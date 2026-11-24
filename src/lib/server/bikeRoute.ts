import "server-only";
import { getKey, isConfigured, redact } from "./env";
import { fetchUpstreamRaw } from "./http";
import type { LatLng } from "../mockData";
import { classify, hintFor, KAKAO_LABEL, KAKAO_PRIORITY, parseRoute, type Priority, type Provider, type RouteFailure, type RouteSuccess } from "../bikeRouteParse";
import { classifyOrs, ORS_ATTRIBUTION, ORS_PREFERENCE, ORS_PROFILE, parseOrs } from "../orsRoute";

export { hintFor };
export type { Priority, Provider, RouteFailure, RouteSuccess };

/**
 * 카카오모빌리티 '자전거 길찾기' (제휴 API).
 * 근거: https://developers.kakaomobility.com/affiliate-en/bicycle/directions
 * ⚠ 공식 문서 본문을 직접 읽지 못해(문서 서버가 비정상 주소로 리다이렉트) 요청/응답 필드는
 *    검색으로 확인한 범위(엔드포인트·priority·오류코드 -5)와 카카오모빌리티 길찾기 공통 규칙을 따릅니다.
 *    응답 구조가 기대와 다르면 경로를 만들어 내지 않고 'BAD_RESPONSE'로 보고합니다.
 */
const SOURCE = "카카오모빌리티 자전거 길찾기";
const ENDPOINT = "https://apis-navi.kakaomobility.com/affiliate/bicycle/v1/directions";

const ORS_BASE = "https://api.openrouteservice.org/v2/directions";

export type ProviderInfo = { id: Provider; name: string; attribution: string | null };

/** ORS_API_KEY 가 있으면 OpenRouteService, 없으면 카카오모빌리티(제휴 승인 필요)를 씁니다. */
export function activeProvider(): ProviderInfo {
  return isConfigured("ors")
    ? { id: "ors", name: "OpenRouteService (자전거 프로필, OpenStreetMap 데이터)", attribution: ORS_ATTRIBUTION }
    : { id: "kakao", name: "카카오모빌리티 자전거 길찾기", attribution: null };
}

async function requestKakao(origin: LatLng, destination: LatLng, priority: Priority): Promise<RouteSuccess | RouteFailure> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("origin", `${origin.lng},${origin.lat}`); // x(경도),y(위도)
  url.searchParams.set("destination", `${destination.lng},${destination.lat}`);
  url.searchParams.set("priority", KAKAO_PRIORITY[priority]);
  const { status, body } = await fetchUpstreamRaw(SOURCE, url, {
    headers: { Authorization: `KakaoAK ${getKey("kakaoRest")}` },
  });
  if (status < 200 || status >= 300) return classify(status, body, redact);
  // 일부 API는 HTTP 200 안에 오류 코드를 담기도 합니다.
  const b = body as Record<string, unknown>;
  if (typeof b?.code === "number" && b.code < 0) return classify(status, body, redact);
  return parseRoute(body, priority, redact, KAKAO_LABEL[priority]);
}

async function requestOrs(origin: LatLng, destination: LatLng, priority: Priority): Promise<RouteSuccess | RouteFailure> {
  const { status, body } = await fetchUpstreamRaw("OpenRouteService", `${ORS_BASE}/${ORS_PROFILE}/geojson`, {
    method: "POST",
    headers: { Authorization: getKey("ors"), "Content-Type": "application/json", Accept: "application/geo+json, application/json" },
    body: JSON.stringify({
      coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]], // [경도, 위도]
      preference: ORS_PREFERENCE[priority],
      instructions: false,
    }),
  });
  if (status < 200 || status >= 300) return classifyOrs(status, body, redact);
  return parseOrs(body, priority);
}

export async function requestBikeRoute(origin: LatLng, destination: LatLng, priority: Priority): Promise<RouteSuccess | RouteFailure> {
  return activeProvider().id === "ors" ? requestOrs(origin, destination, priority) : requestKakao(origin, destination, priority);
}
