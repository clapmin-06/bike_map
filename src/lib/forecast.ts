// 기상청 단기예보(getVilageFcst) — 발표시각(base)과 예보시각(fcst)을 구분해서 다룹니다.
//  · 발표시각(baseDate/baseTime): 기상청이 이 예보를 '발표한' 시각
//  · 예보시각(fcstDate/fcstTime): 예보가 '가리키는' 시각 (그 시각의 기온·강수확률)

export const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const; // 1일 8회 발표 (02,05,...,23시)
const PUBLISH_DELAY_MIN = 10; // 발표 후 약 10분부터 API로 제공

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;

export type Base = { baseDate: string; baseTime: string };

/** KST 기준으로 지금 조회 가능한 가장 최근 발표시각. `back`=1 이면 그 직전 발표. */
export function latestBase(nowMs: number, back = 0): Base {
  // UTC getter 를 KST 벽시계로 쓰기 위해 +9h, 제공 지연(10분)만큼 뺍니다.
  const t = new Date(nowMs + 9 * 3600_000 - PUBLISH_DELAY_MIN * 60_000);
  // 후보 발표 시각들을 (날짜, 시) 로 나열해 가장 최근 것부터 back 번째를 고릅니다.
  const candidates: { d: Date; h: number }[] = [];
  for (let dayOffset = 0; dayOffset >= -2; dayOffset--) {
    const d = new Date(t.getTime() + dayOffset * 86_400_000);
    for (const h of [...BASE_HOURS].reverse()) {
      const isToday = dayOffset === 0;
      if (!isToday || h <= t.getUTCHours()) candidates.push({ d, h });
    }
  }
  const c = candidates[back];
  return { baseDate: ymd(c.d), baseTime: `${p2(c.h)}00` };
}

export type ForecastItem = {
  baseDate?: string;
  baseTime?: string;
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
};

export class ForecastPageError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** data.go.kr 응답에서 항목을 꺼냅니다. 03(NODATA)은 code 로 구분해 호출부가 이전 발표로 재시도할 수 있게 합니다. */
export function parseForecastPage(body: unknown): ForecastItem[] {
  const r = body as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: ForecastItem[] } } } };
  const header = r?.response?.header;
  if (!header || header.resultCode === undefined) {
    throw new ForecastPageError("응답에 response.header.resultCode 가 없습니다 (응답 구조가 예상과 다릅니다).");
  }
  if (header.resultCode !== "00") {
    throw new ForecastPageError(`resultCode ${header.resultCode}: ${String(header.resultMsg ?? "").slice(0, 120)}`, header.resultCode);
  }
  const items = r.response?.body?.items?.item;
  return Array.isArray(items) ? items : [];
}

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };

export type Slot = {
  fcstDate: string; // YYYYMMDD  (예보시각)
  fcstTime: string; // HHMM
  tempC: number | null; // TMP
  popPct: number | null; // POP 강수확률
  sky: string | null;
  precipitation: string | null; // 강수형태
};

/** 시각별로 묶고, KST 현재 시각(정시) 이후의 슬롯을 최대 `limit`개. */
export function buildSlots(items: ForecastItem[], nowMs: number, limit = 12): Slot[] {
  const kst = new Date(nowMs + 9 * 3600_000);
  const nowKey = `${ymd(kst)}${p2(kst.getUTCHours())}00`;
  const byTime = new Map<string, Slot>();
  for (const it of items) {
    const key = `${it.fcstDate}${it.fcstTime}`;
    let s = byTime.get(key);
    if (!s) {
      s = { fcstDate: it.fcstDate, fcstTime: it.fcstTime, tempC: null, popPct: null, sky: null, precipitation: null };
      byTime.set(key, s);
    }
    const v = Number(it.fcstValue);
    if (it.category === "TMP" && Number.isFinite(v)) s.tempC = v;
    else if (it.category === "POP" && Number.isFinite(v)) s.popPct = v;
    else if (it.category === "SKY") s.sky = SKY[it.fcstValue] ?? null;
    else if (it.category === "PTY") s.precipitation = PTY[it.fcstValue] ?? null;
  }
  return [...byTime.entries()]
    .filter(([k, s]) => k >= nowKey && (s.tempC !== null || s.popPct !== null))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, limit)
    .map(([, s]) => s);
}
