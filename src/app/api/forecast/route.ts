import { getKey, redact } from "@/lib/server/env";
import { toKmaGrid } from "@/lib/server/kmaGrid";
import { fetchUpstreamJson, json, num, route, UpstreamError } from "@/lib/server/http";
import { buildSlots, ForecastPageError, latestBase, parseForecastPage, type Base } from "@/lib/forecast";

// 공공데이터포털 '기상청_단기예보 조회서비스' 단기예보(getVilageFcst) 프록시.
// 응답은 발표시각(base)과 시간대별 예보시각(slots[].fcstDate/fcstTime)을 분리해서 돌려줍니다.
const SOURCE = "기상청 단기예보 API";
const ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

async function fetchBase(nx: number, ny: number, base: Base) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", getKey("dataGoKr"));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000"); // 발표 1회분(약 3일, 시간당 12개 항목)을 넉넉히
  url.searchParams.set("base_date", base.baseDate);
  url.searchParams.set("base_time", base.baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  const body = await fetchUpstreamJson(SOURCE, url);
  try {
    return parseForecastPage(body);
  } catch (e) {
    if (e instanceof ForecastPageError) {
      if (e.code === "03") return null; // NODATA: 아직 해당 발표분이 준비되지 않음
      throw new UpstreamError(SOURCE, `${SOURCE}: ${redact(e.message)}`);
    }
    throw e;
  }
}

// GET /api/forecast?lat=37.5665&lng=126.978
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const lat = num(params, "lat", { min: 33, max: 39 });
  const lng = num(params, "lng", { min: 124, max: 132 });
  const { nx, ny } = toKmaGrid(lat, lng);
  const now = Date.now();

  // 최신 발표분이 아직 없으면(NODATA) 직전 발표분으로 한 번만 재시도하고, 실제 사용한 발표시각을 그대로 알립니다.
  let base = latestBase(now, 0);
  let items = await fetchBase(nx, ny, base);
  if (items === null) {
    base = latestBase(now, 1);
    items = await fetchBase(nx, ny, base);
  }
  if (items === null) throw new UpstreamError(SOURCE, `${SOURCE}: 최근 발표분 데이터가 없습니다.`);

  const slots = buildSlots(items, now, 12);
  if (slots.length === 0) throw new UpstreamError(SOURCE, `${SOURCE}: 현재 시각 이후의 예보 항목이 없습니다.`);
  return json({ grid: { nx, ny }, base, slots, fetchedAt: now }, 300);
});
