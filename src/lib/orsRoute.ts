import type { LatLng } from "./mockData";
import type { FailReason, Priority, Redactor, RouteFailure, RouteSuccess } from "./bikeRouteParse";
import { ORS_LABEL } from "./bikeRouteParse";

// OpenRouteService (HeiGIT) Directions — 순수 로직(분류·파서). 키/네트워크에 의존하지 않아 테스트 가능.
// 확인된 사실: POST /v2/directions/{profile}/geojson, 응답은 FeatureCollection(LineString + properties.summary 의 distance(m)·duration(s)),
//             오류 코드 2009(경로 없음) 2010(지점 없음) 2004(한도 초과) 등. 키 없이 호출하면 401 {"error":"Authorization field missing"}.
export const ORS_PROFILE = "cycling-regular";
export const ORS_PREFERENCE: Record<Priority, "recommended" | "shortest"> = { PRIMARY: "recommended", SHORTEST: "shortest" };
export const ORS_ATTRIBUTION = "© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors";

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function classifyOrs(status: number, body: unknown, redact: Redactor = (t) => t): RouteFailure {
  const b = (body ?? {}) as Record<string, unknown>;
  // 오류 본문은 {"error":"문자열"} 또는 {"error":{"code":2010,"message":"..."}} 두 형태를 모두 처리
  const err = b.error;
  const obj = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const code = typeof obj?.code === "number" ? obj.code : undefined;
  const msg = redact(str(obj?.message ?? (typeof err === "string" ? err : b._nonJson))).slice(0, 160);

  let reason: FailReason = "UPSTREAM_ERROR";
  if (code === 2009 || code === 2010) reason = "NO_ROUTE";
  else if (status === 401 || status === 403) reason = "KEY_INVALID";
  else if (status === 429) reason = "QUOTA_EXCEEDED";
  else if (status === 404) reason = "ENDPOINT_NOT_FOUND"; // 문서상 404 는 '엔드포인트 없음' 또는 '결과 없음' — 코드가 없으면 전자로 봄
  else if (status === 400) reason = "BAD_REQUEST";
  return {
    ok: false,
    reason,
    httpStatus: status,
    upstreamCode: code,
    message: `HTTP ${status}${code !== undefined ? ` / code ${code}` : ""}${msg ? ` — ${msg}` : ""}`,
  };
}

export function parseOrs(body: unknown, priority: Priority): RouteSuccess | RouteFailure {
  const bad = (m: string): RouteFailure => ({ ok: false, reason: "BAD_RESPONSE", message: m });
  const b = body as { type?: unknown; features?: unknown };
  if (b?.type !== "FeatureCollection" || !Array.isArray(b.features) || b.features.length === 0) {
    return bad("FeatureCollection/features 가 없습니다.");
  }
  const f = b.features[0] as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: { summary?: Record<string, unknown> } };
  if (f.geometry?.type !== "LineString" || !Array.isArray(f.geometry.coordinates)) return bad("geometry 가 LineString 이 아닙니다.");

  const path: LatLng[] = [];
  for (const c of f.geometry.coordinates as unknown[]) {
    if (!Array.isArray(c) || c.length < 2) return bad("coordinates 항목 형식이 올바르지 않습니다.");
    const lng = Number(c[0]); // GeoJSON 은 [경도, 위도(, 고도)]
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
      return bad("좌표 값이 대한민국 범위를 벗어났습니다.");
    }
    path.push({ lat, lng });
  }
  if (path.length < 2) return bad("경로 좌표가 없습니다.");

  const distanceM = Number(f.properties?.summary?.distance);
  const durationSec = Number(f.properties?.summary?.duration);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationSec)) return bad("properties.summary.distance/duration 이 없습니다.");
  return { ok: true, priority, label: ORS_LABEL[priority], distanceM, durationSec, path };
}
