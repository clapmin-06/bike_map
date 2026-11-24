import "server-only"; // 클라이언트 컴포넌트에서 import 하면 빌드가 실패합니다.

/**
 * 서버 전용 API 키. NEXT_PUBLIC_ 접두사가 없으므로 브라우저 번들에 포함되지 않습니다.
 * 값은 .env.local 에만 두고, 절대 커밋하거나 응답/로그에 출력하지 않습니다.
 */
export const SERVER_KEYS = {
  seoul: "SEOUL_OPEN_API_KEY", // 서울 열린데이터광장 (따릉이 실시간 대여정보)
  dataGoKr: "DATA_GO_KR_SERVICE_KEY", // 공공데이터포털 (기상청 실황, 도로교통공단 자전거사고)
  kakaoRest: "KAKAO_REST_API_KEY", // 카카오 REST API 키 (장소 검색)
  ors: "ORS_API_KEY", // OpenRouteService 키 (자전거 경로, 선택)
} as const;

export type ServerKeyName = keyof typeof SERVER_KEYS;

export class MissingKeyError extends Error {
  constructor(public readonly envName: string) {
    super(`서버 환경변수 ${envName} 가 설정되지 않았습니다.`);
    this.name = "MissingKeyError";
  }
}

export function getKey(name: ServerKeyName): string {
  const envName = SERVER_KEYS[name];
  const raw = process.env[envName]?.trim();
  if (!raw) throw new MissingKeyError(envName);
  // 공공데이터포털은 URL 인코딩된 키(%2B 등)를 그대로 복사해 넣는 경우가 많아 디코딩해 둡니다.
  if (name === "dataGoKr" && raw.includes("%")) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function isConfigured(name: ServerKeyName): boolean {
  return !!process.env[SERVER_KEYS[name]]?.trim();
}

/** 에러 메시지 등에서 키 값을 가리기 위한 목록 (원문 + URL 인코딩 형태). */
export function secretValues(): string[] {
  const out: string[] = [];
  for (const envName of Object.values(SERVER_KEYS)) {
    const v = process.env[envName]?.trim();
    if (!v) continue;
    out.push(v, encodeURIComponent(v));
    try {
      out.push(decodeURIComponent(v));
    } catch {
      /* 무시 */
    }
  }
  return [...new Set(out)].filter((s) => s.length >= 6);
}

export function redact(text: string): string {
  let result = text;
  for (const s of secretValues()) result = result.split(s).join("***");
  return result;
}
