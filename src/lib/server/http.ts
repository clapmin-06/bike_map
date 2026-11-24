import "server-only";
import { connection } from "next/server";
import { MissingKeyError, redact } from "./env";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * 외부 API 호출. 인증키가 URL/헤더에 들어가므로
 * - 오류 메시지에 URL을 담지 않고
 * - 본문/메시지에 키가 섞여 있으면 가립니다.
 */
export async function fetchUpstreamJson(
  source: string,
  url: string | URL,
  init: RequestInit = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "응답 시간 초과" : "연결 실패";
    throw new UpstreamError(source, `${source} ${reason}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new UpstreamError(source, `${source} 응답 오류 (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // 공공데이터포털은 키 오류 시 HTTP 200 + XML 로 응답하는 경우가 있습니다.
    const hint = redact(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 120);
    throw new UpstreamError(source, `${source} 가 JSON이 아닌 응답을 반환했습니다${hint ? `: ${hint}` : ""}`);
  }
}

/**
 * 상태 코드와 본문을 그대로 돌려주는 호출. 권한·한도 오류처럼 "왜 거절됐는지"를
 * 호출자가 분류해야 할 때 사용합니다. 연결 실패/시간 초과만 예외로 던집니다.
 */
export async function fetchUpstreamRaw(
  source: string,
  url: string | URL,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "응답 시간 초과" : "연결 실패";
    throw new UpstreamError(source, `${source} ${reason}`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _nonJson: redact(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 160) };
  }
  return { status: res.status, body };
}

/** 라우트 핸들러 공통 래퍼: 에러를 안전한 JSON 응답으로 변환합니다. */
export function route(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    // 요청 시점에만 실행되도록 선언. try 바깥에서 호출해야 Next의 prerender 중단 신호를 삼키지 않습니다.
    await connection();
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
      if (e instanceof MissingKeyError) {
        // 어떤 설정이 빠졌는지는 알려주되 값은 노출하지 않습니다.
        return Response.json({ error: "서버에 API 키가 설정되지 않았습니다.", missing: e.envName }, { status: 503 });
      }
      if (e instanceof UpstreamError) {
        return Response.json({ error: e.message, source: e.source }, { status: 502 });
      }
      console.error("[api] unexpected error:", redact(e instanceof Error ? (e.stack ?? e.message) : String(e)));
      return Response.json({ error: "서버 내부 오류" }, { status: 500 });
    }
  };
}

export function num(params: URLSearchParams, name: string, opts: { min: number; max: number }): number {
  const raw = params.get(name);
  const v = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(v) || v < opts.min || v > opts.max) {
    throw new ValidationError(`${name} 값이 올바르지 않습니다 (${opts.min}~${opts.max}).`);
  }
  return v;
}

export function json(data: unknown, maxAgeSec: number): Response {
  return Response.json(data, { headers: { "Cache-Control": `private, max-age=${maxAgeSec}` } });
}
