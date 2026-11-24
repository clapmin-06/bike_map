import { getKey, redact } from "@/lib/server/env";
import { toKmaGrid } from "@/lib/server/kmaGrid";
import { fetchUpstreamJson, json, num, route, UpstreamError } from "@/lib/server/http";

// 공공데이터포털 '기상청_단기예보 조회서비스' 초단기실황(getUltraSrtNcst) 프록시.
type Item = { category: string; obsrValue: string };
type Resp = {
  response?: {
    header?: { resultCode: string; resultMsg: string };
    body?: { items?: { item?: Item[] } };
  };
};

const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "5": "빗방울", "6": "빗방울눈날림", "7": "눈날림" };

// 실황은 매 정시 생성되고 약 40분 뒤부터 조회 가능 → 40분 전 시각의 정시를 사용합니다.
function baseDateTime(now = Date.now()) {
  const kst = new Date(now + 9 * 3600_000 - 40 * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    base_date: `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}`,
    base_time: `${p(kst.getUTCHours())}00`,
  };
}

// GET /api/weather?lat=37.5665&lng=126.978
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const lat = num(params, "lat", { min: 33, max: 39 });
  const lng = num(params, "lng", { min: 124, max: 132 });
  const { nx, ny } = toKmaGrid(lat, lng);

  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst");
  url.searchParams.set("serviceKey", getKey("dataGoKr"));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("numOfRows", "20");
  url.searchParams.set("pageNo", "1");
  const base = baseDateTime();
  url.searchParams.set("base_date", base.base_date);
  url.searchParams.set("base_time", base.base_time);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  const data = (await fetchUpstreamJson("기상청 API", url)) as Resp;
  const header = data.response?.header;
  if (header?.resultCode !== "00") {
    throw new UpstreamError("기상청 API", `기상청 API 오류: ${redact(header?.resultMsg ?? "알 수 없음")}`);
  }
  const v: Record<string, string> = {};
  for (const it of data.response?.body?.items?.item ?? []) v[it.category] = it.obsrValue;

  return json(
    {
      grid: { nx, ny },
      observedAt: base,
      tempC: v.T1H !== undefined ? Number(v.T1H) : null,
      humidityPct: v.REH !== undefined ? Number(v.REH) : null,
      windMs: v.WSD !== undefined ? Number(v.WSD) : null,
      rain1h: v.RN1 ?? null, // 예: "강수없음", "1.0mm"
      precipitationType: PTY[v.PTY ?? "0"] ?? "알 수 없음",
    },
    300,
  );
});
