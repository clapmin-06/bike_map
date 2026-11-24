import "server-only";
import { getKey, redact } from "./env";
import { fetchUpstreamJson, UpstreamError } from "./http";
import { normalizeRow, type BikeListRow } from "../stations";
import type { Station } from "../types";

// 서울 열린데이터광장 '따릉이대여소 실시간 정보'(bikeList).
// 인증키가 URL 경로에 들어가므로 이 URL은 로그/응답에 절대 출력하지 않습니다.
const SOURCE = "서울 열린데이터광장";
const PAGE_SIZE = 1000; // API 1회 최대 1000건
const PAGES = [1, 1001, 2001, 3001]; // 대여소는 약 2,700개 → 여유 있게 4페이지
const TTL_MS = 30_000; // 지도 이동마다 업스트림을 호출하지 않도록 30초 캐시

type Page = {
  rentBikeStatus?: { row?: BikeListRow[]; RESULT?: { CODE: string; MESSAGE: string } };
  RESULT?: { CODE: string; MESSAGE: string };
};

async function fetchPage(key: string, start: number): Promise<BikeListRow[]> {
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/bikeList/${start}/${start + PAGE_SIZE - 1}/`;
  const data = (await fetchUpstreamJson(SOURCE, url)) as Page;
  const result = data.rentBikeStatus?.RESULT ?? data.RESULT;
  if (result?.CODE === "INFO-200") return []; // 데이터 없음(마지막 페이지 너머)
  if (result && result.CODE !== "INFO-000") {
    throw new UpstreamError(SOURCE, `${SOURCE} 오류: ${redact(result.CODE)} ${redact(result.MESSAGE)}`);
  }
  return data.rentBikeStatus?.row ?? [];
}

let cache: { at: number; stations: Station[] } | null = null;
let inflight: Promise<Station[]> | null = null;

export async function getAllStations(): Promise<{ stations: Station[]; fetchedAt: number }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { stations: cache.stations, fetchedAt: cache.at };
  inflight ??= (async () => {
    const key = getKey("seoul");
    const pages = await Promise.all(PAGES.map((s) => fetchPage(key, s)));
    const seen = new Set<string>();
    const stations: Station[] = [];
    for (const row of pages.flat()) {
      const s = normalizeRow(row);
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        stations.push(s);
      }
    }
    if (stations.length === 0) throw new UpstreamError(SOURCE, `${SOURCE}에서 대여소 데이터를 받지 못했습니다.`);
    cache = { at: Date.now(), stations };
    return stations;
  })().finally(() => {
    inflight = null;
  });
  const stations = await inflight;
  return { stations, fetchedAt: cache?.at ?? Date.now() };
}
