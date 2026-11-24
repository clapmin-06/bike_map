import "server-only";
import { getKey, redact } from "./env";
import { fetchUpstreamJson, UpstreamError } from "./http";
import { AccidentPageError, normalizeHotspot, parseAccidentPage } from "../accidents";
import type { Hotspot } from "../types";

const SOURCE = "도로교통공단 자전거 사고다발지역 API";
const ENDPOINT = "https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle";
const TTL_MS = 24 * 3600_000; // 연 단위 통계이므로 하루 캐시
const YEARS_BACK = 7;

async function fetchSeoul(year: number, rows: number, pageNo: number) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("ServiceKey", getKey("dataGoKr"));
  url.searchParams.set("searchYearCd", String(year));
  url.searchParams.set("siDo", "11"); // 서울
  url.searchParams.set("guGun", ""); // 공백 = 서울 전체 (실제 호출로 확인: 구별 합과 동일한 결과)
  url.searchParams.set("type", "json");
  url.searchParams.set("numOfRows", String(rows));
  url.searchParams.set("pageNo", String(pageNo));
  const body = await fetchUpstreamJson(SOURCE, url);
  try {
    return parseAccidentPage(body);
  } catch (e) {
    if (e instanceof AccidentPageError) throw new UpstreamError(SOURCE, `${SOURCE}: ${redact(e.message)}`);
    throw e;
  }
}

export type YearProbe = { year: number; hasData: boolean };

/** 최신 연도부터 거꾸로 호출해 실제로 데이터가 있는 가장 최근 기준연도를 찾습니다. (연도 목록이 문서에 없음) */
async function findLatestYear(now = new Date().getFullYear()): Promise<{ year: number; probes: YearProbe[] }> {
  const probes: YearProbe[] = [];
  for (let y = now; y >= now - YEARS_BACK; y--) {
    const page = await fetchSeoul(y, 1, 1); // 오류(키/권한)는 그대로 던져 연도 탐색을 중단. 03(NODATA)만 '없음'
    const has = page.items.length > 0;
    probes.push({ year: y, hasData: has });
    if (has) return { year: y, probes };
  }
  throw new UpstreamError(SOURCE, `${SOURCE}: ${now - YEARS_BACK}~${now}년 사이에 사고다발지역 데이터가 있는 연도를 찾지 못했습니다.`);
}

export type HotspotResult = {
  baseYear: number;
  probes: YearProbe[];
  fetchedAt: number;
  hotspots: Hotspot[];
};

let cache: { at: number; result: HotspotResult } | null = null;
let inflight: Promise<HotspotResult> | null = null;

export async function getSeoulHotspots(): Promise<HotspotResult> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.result;
  inflight ??= (async () => {
    const { year, probes } = await findLatestYear();
    const byId = new Map<string, Hotspot>();
    const ROWS = 300;
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const page = await fetchSeoul(year, ROWS, pageNo);
      for (const raw of page.items) {
        const h = normalizeHotspot(raw);
        if (h) byId.set(h.id, h);
      }
      if (page.items.length < ROWS || pageNo * ROWS >= page.totalCount) break;
    }
    const result: HotspotResult = { baseYear: year, probes, fetchedAt: Date.now(), hotspots: [...byId.values()] };
    cache = { at: Date.now(), result };
    return result;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
