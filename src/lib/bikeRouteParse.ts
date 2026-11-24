import type { LatLng } from "./mockData";

// 순수 로직(분류·파서). 서버 키/네트워크에 의존하지 않아 단위 테스트 가능.
// 비밀 마스킹은 호출부(서버)에서 redact 를 주입합니다.
export type Redactor = (t: string) => string;
/** 제공자와 무관한 경로 구분: PRIMARY=제공자의 기본(자전거 친화) 설정, SHORTEST=최단 */
export type Priority = "PRIMARY" | "SHORTEST";
export type Provider = "kakao" | "ors";
export const KAKAO_PRIORITY: Record<Priority, string> = { PRIMARY: "BIKE_ROAD", SHORTEST: "DISTANCE" };
export const KAKAO_LABEL: Record<Priority, string> = { PRIMARY: "자전거도로 우선", SHORTEST: "최단 경로" };
export const ORS_LABEL: Record<Priority, string> = { PRIMARY: "기본 경로 (recommended)", SHORTEST: "최단 경로 (shortest)" };

export type FailReason =
  | "KEY_INVALID" // 인증키 거부 (401)
  | "NO_PERMISSION" // 앱에 이 API 사용 권한 없음 (제휴 승인 필요, code -5 / 403)
  | "QUOTA_EXCEEDED" // 호출 한도 초과 (429, -10)
  | "ENDPOINT_NOT_FOUND" // 404
  | "BAD_REQUEST" // 400 (좌표 형식 등)
  | "NO_ROUTE" // 호출은 성공했지만 경로 없음
  | "BAD_RESPONSE" // 응답 형식이 기대와 다름
  | "UPSTREAM_ERROR";

export type RouteFailure = { ok: false; reason: FailReason; message: string; httpStatus?: number; upstreamCode?: number | string };
export type RouteSuccess = {
  ok: true;
  priority: Priority;
  label: string;
  distanceM: number;
  durationSec: number;
  path: LatLng[];
};

const HINT_KAKAO: Record<FailReason, string> = {
  KEY_INVALID: "KAKAO_REST_API_KEY 값이 올바른지(REST API 키, JavaScript 키가 아님) 확인하세요.",
  NO_PERMISSION:
    "이 카카오 앱에 자전거 길찾기 API 사용 권한이 없습니다. 카카오모빌리티 제휴 승인(카카오 비즈니스 계정·앱 정보 전달 후 승인)이 필요한 API입니다.",
  QUOTA_EXCEEDED: "호출 한도를 초과했습니다. 잠시 후 다시 시도하거나 카카오 콘솔에서 쿼터를 확인하세요.",
  ENDPOINT_NOT_FOUND: "엔드포인트를 찾지 못했습니다. 카카오모빌리티 문서의 최신 주소를 확인하세요.",
  BAD_REQUEST: "요청 파라미터를 확인하세요 (좌표 범위·형식).",
  NO_ROUTE: "두 지점 사이에 자전거 경로를 찾지 못했습니다.",
  BAD_RESPONSE: "응답 구조가 예상과 달라 경로를 해석할 수 없습니다. 문서의 응답 스키마와 비교해 파서를 조정해야 합니다.",
  UPSTREAM_ERROR: "카카오모빌리티 서버 오류 또는 연결 문제입니다.",
};
const HINT_ORS: Record<FailReason, string> = {
  KEY_INVALID: "ORS_API_KEY 값이 올바른지 확인하세요 (openrouteservice.org 대시보드의 API 키).",
  NO_PERMISSION: "이 키로는 요청이 허용되지 않습니다. OpenRouteService 대시보드에서 키 상태와 허용 범위를 확인하세요.",
  QUOTA_EXCEEDED: "OpenRouteService 호출 한도를 초과했습니다. 잠시 후 다시 시도하거나 대시보드에서 사용량을 확인하세요.",
  ENDPOINT_NOT_FOUND: "엔드포인트 또는 프로필 이름을 찾지 못했습니다.",
  BAD_REQUEST: "요청 값을 확인하세요 (좌표 범위, 거리 제한 등).",
  NO_ROUTE: "두 지점 사이에 경로를 찾지 못했습니다. 출발·도착 지점이 도로에서 너무 멀 수 있습니다.",
  BAD_RESPONSE: "응답 구조가 예상과 달라 경로를 해석할 수 없습니다. 파서를 조정해야 합니다.",
  UPSTREAM_ERROR: "OpenRouteService 서버 오류 또는 연결 문제입니다.",
};
export const hintFor = (r: FailReason, provider: Provider = "kakao") => (provider === "ors" ? HINT_ORS : HINT_KAKAO)[r];

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function classify(status: number, body: unknown, redact: Redactor = (t) => t): RouteFailure {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = (b.code ?? b.error_code ?? b.errorCode) as number | string | undefined;
  const msg = redact(str(b.msg ?? b.message ?? b.error_message ?? b._nonJson)).slice(0, 160);
  const permission = code === -5 || /permission|not allowed|권한/i.test(msg);
  let reason: FailReason = "UPSTREAM_ERROR";
  if (status === 401 || code === -401) reason = "KEY_INVALID";
  else if (permission || status === 403) reason = "NO_PERMISSION";
  else if (status === 429 || code === -10) reason = "QUOTA_EXCEEDED";
  else if (status === 404) reason = "ENDPOINT_NOT_FOUND";
  else if (status === 400) reason = "BAD_REQUEST";
  return {
    ok: false,
    reason,
    httpStatus: status,
    upstreamCode: code,
    message: `HTTP ${status}${code !== undefined ? ` / code ${code}` : ""}${msg ? ` — ${msg}` : ""}`,
  };
}

/** 응답에서 경로 좌표를 꺼냅니다. 기대한 구조가 아니면 null (경로를 지어내지 않음). */
export function parseRoute(body: unknown, priority: Priority, redact: Redactor = (t) => t, label: string = KAKAO_LABEL[priority]): RouteSuccess | RouteFailure {
  const bad = (m: string): RouteFailure => ({ ok: false, reason: "BAD_RESPONSE", message: m });
  const routes = (body as { routes?: unknown })?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return bad("routes 배열이 없습니다.");
  const r = routes[0] as Record<string, unknown>;
  const resultCode = r.result_code;
  if (typeof resultCode === "number" && resultCode !== 0) {
    return { ok: false, reason: "NO_ROUTE", message: `result_code ${resultCode}: ${redact(str(r.result_msg)).slice(0, 120)}` };
  }
  const sections = r.sections;
  if (!Array.isArray(sections)) return bad("routes[0].sections 가 없습니다.");

  const path: LatLng[] = [];
  for (const s of sections as Array<{ roads?: Array<{ vertexes?: unknown }> }>) {
    for (const road of s.roads ?? []) {
      const v = road.vertexes;
      if (!Array.isArray(v) || v.length % 2 !== 0) return bad("roads[].vertexes 형식이 올바르지 않습니다.");
      for (let i = 0; i < v.length; i += 2) {
        const lng = Number(v[i]);
        const lat = Number(v[i + 1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
          return bad("좌표 값이 대한민국 범위를 벗어났습니다.");
        }
        path.push({ lat, lng });
      }
    }
  }
  if (path.length < 2) return bad("경로 좌표가 없습니다.");

  const summary = (r.summary ?? {}) as Record<string, unknown>;
  const distanceM = Number(summary.distance);
  const durationSec = Number(summary.duration);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationSec)) return bad("summary.distance/duration 이 없습니다.");
  return { ok: true, priority, label, distanceM, durationSec, path };
}

