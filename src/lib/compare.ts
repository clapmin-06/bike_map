import { hotspotsNearPath } from "./accidents";
import type { BikeRoute, Hotspot } from "./types";

/** 경로 중심선에서 이 거리 이내의 사고다발지역을 '경로 근처'로 셉니다. */
export const NEAR_ROUTE_M = 300;

export type RouteSummary = {
  priority: BikeRoute["priority"];
  label: string;
  distanceM: number;
  durationSec: number;
  nearCount: number; // 경로 근처 사고다발지역 수 (지점 수)
  nearAccidentSum: number; // 그 지점들의 과거 사고 건수 합
  nearIds: string[];
};

/**
 * 경로별 '사실 수치'만 계산합니다. 안전하다/위험하다는 판단이나 점수는 만들지 않습니다.
 * (사고다발지역은 과거 통계이고, 교통량·도로 구조·시간대 등은 반영되지 않습니다.)
 */
export function summarizeRoutes(routes: BikeRoute[], hotspots: Hotspot[]): RouteSummary[] {
  return routes.map((r) => {
    const near = hotspotsNearPath(r.path, hotspots, NEAR_ROUTE_M);
    return {
      priority: r.priority,
      label: r.label,
      distanceM: r.distanceM,
      durationSec: r.durationSec,
      nearCount: near.length,
      nearAccidentSum: near.reduce((a, h) => a + h.count, 0),
      nearIds: near.map((h) => h.id),
    };
  });
}

/** 두 경로의 수치 차이를 중립적인 문장으로. (우열 판단 없음) */
export function describeDifference(a: RouteSummary, b: RouteSummary): string {
  const dKm = Math.abs(a.distanceM - b.distanceM) / 1000;
  const dMin = Math.round(Math.abs(a.durationSec - b.durationSec) / 60);
  const dN = Math.abs(a.nearCount - b.nearCount);
  const longer = a.distanceM >= b.distanceM ? a : b;
  const shorter = longer === a ? b : a;
  const parts = [`${longer.label}이(가) ${shorter.label}보다 ${dKm.toFixed(1)}km 길고 소요시간은 약 ${dMin}분 차이`];
  parts.push(dN === 0 ? "경로 근처 사고다발지역 수는 같음" : `경로 근처 사고다발지역 수는 ${dN}곳 차이`);
  return parts.join(", ");
}
