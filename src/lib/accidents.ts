import type { Hotspot } from "./types";

// 한국도로교통공단 '자전거 교통사고 다발지역' (공공데이터포털 15056681)
// 선정 기준: 직전 1년간 자전거가 가해/피해 차종인 사고가 반경 200m 안에 4건 이상(사망 포함 시 3건 이상).
export const HOTSPOT_RADIUS_M = 200;

export class AccidentPageError extends Error {}

type RawItem = Record<string, unknown>;

const SUCCESS_CODES = new Set(["00", "0", "000", "INFO-000"]);

/** data.go.kr 응답(최상위 또는 response.header/body 래핑)에서 항목을 꺼냅니다. */
export function parseAccidentPage(body: unknown): { items: RawItem[]; totalCount: number } {
  const root = (body ?? {}) as Record<string, unknown>;
  const wrapped = root.response as { header?: Record<string, unknown>; body?: Record<string, unknown> } | undefined;
  const head = (wrapped?.header ?? root) as Record<string, unknown>;
  const data = (wrapped?.body ?? root) as Record<string, unknown>;

  const code = head.resultCode;
  if (code === undefined || code === null) {
    throw new AccidentPageError("응답에 resultCode 가 없습니다 (응답 구조가 예상과 다릅니다).");
  }
  // 03 NODATA_ERROR: 오류가 아니라 '해당 조건(연도·구)에 데이터 없음'을 뜻합니다. (실제 호출에서 확인됨)
  // 기준연도 탐색 중 아직 집계되지 않은 연도는 이 코드로 응답하므로 빈 결과로 처리해야 합니다.
  if (String(code) === "03") return { items: [], totalCount: 0 };
  if (!SUCCESS_CODES.has(String(code))) {
    throw new AccidentPageError(`resultCode ${String(code)}: ${String(head.resultMsg ?? "").slice(0, 120)}`);
  }
  const totalCount = Number(data.totalCount ?? 0);
  const itemsNode = data.items as { item?: unknown } | string | undefined;
  const raw = typeof itemsNode === "object" && itemsNode ? itemsNode.item : undefined;
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return { items: items as RawItem[], totalCount: Number.isFinite(totalCount) ? totalCount : 0 };
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function normalizeHotspot(r: RawItem): Hotspot | null {
  const lat = Number(r.la_crd);
  const lng = Number(r.lo_crd);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  const spot = String(r.spot_cd ?? "");
  const afos = String(r.afos_id ?? "");
  return {
    id: `${afos}-${spot}` !== "-" ? `${afos}-${spot}` : `${lat},${lng}`,
    title: String(r.spot_nm ?? "").trim() || "위치 정보 없음",
    area: String(r.sido_sgg_nm ?? "").trim(),
    count: n(r.occrrnc_cnt),
    casualties: n(r.caslt_cnt),
    deaths: n(r.dth_dnv_cnt),
    serious: n(r.se_dnv_cnt),
    minor: n(r.sl_dnv_cnt),
    reported: n(r.wnd_dnv_cnt),
    lat,
    lng,
  };
}

/** 점 → 선분 최소거리(m). 서울 규모에서 충분한 등장방형 근사. */
function toXY(lat: number, lng: number, lat0: number) {
  return { x: (lng * Math.cos((lat0 * Math.PI) / 180) * 111_320), y: lat * 110_540 };
}

export function distanceToPathM(p: { lat: number; lng: number }, path: { lat: number; lng: number }[]): number {
  if (path.length === 0) return Infinity;
  const q = toXY(p.lat, p.lng, p.lat);
  let best = Infinity;
  if (path.length === 1) {
    const a = toXY(path[0].lat, path[0].lng, p.lat);
    return Math.hypot(q.x - a.x, q.y - a.y);
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = toXY(path[i].lat, path[i].lng, p.lat);
    const b = toXY(path[i + 1].lat, path[i + 1].lng, p.lat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
  }
  return best;
}

/** 경로 중심선에서 thresholdM 이내인 사고다발지역을 가까운 순으로. */
export function hotspotsNearPath(
  path: { lat: number; lng: number }[],
  hotspots: Hotspot[],
  thresholdM: number,
): (Hotspot & { distanceM: number })[] {
  return hotspots
    .map((h) => ({ ...h, distanceM: Math.round(distanceToPathM(h, path)) }))
    .filter((h) => h.distanceM <= thresholdM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
