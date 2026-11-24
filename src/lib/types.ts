export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bikes: number; // 현재 이용 가능한 자전거 수
  racks: number; // 거치대 총 수
  distanceM?: number; // 기준점(출발지)으로부터의 거리 (m)
};

/** 지도에 그릴 실제 경로 (카카오모빌리티 자전거 길찾기 결과) */
export type DrawnRoute = {
  id: string;
  color: string;
  path: { lat: number; lng: number }[];
};

/** 자전거 교통사고 다발지역 (도로교통공단, 과거 사고 통계) */
export type Hotspot = {
  id: string;
  title: string; // 지점 위치명
  area: string; // 시도시군구명
  count: number; // 다발지역 내 사고건수
  casualties: number; // 사상자수
  deaths: number;
  serious: number; // 중상
  minor: number; // 경상
  reported: number; // 부상신고
  lat: number;
  lng: number;
};

/** 카카오모빌리티 자전거 길찾기 결과 한 건 */
export type BikeRoute = {
  priority: "PRIMARY" | "SHORTEST"; // 제공자의 기본(자전거 친화) 설정 / 최단
  label: string;
  distanceM: number;
  durationSec: number;
  path: { lat: number; lng: number }[];
};
export type RouteFailure = { priority: string; reason: string; message: string; hint: string };
export type RouteError = { message: string; reason?: string; detail?: string; hint?: string; missing?: string };
export type RouteState = {
  key: string;
  routes: BikeRoute[];
  failures: RouteFailure[];
  error: RouteError | null;
  fetchedAt: number | null; // 서버가 경로를 조회한 시각 (ms)
  provider: { id: string; name: string; attribution: string | null } | null; // 경로 제공자 (출처 표시용)
};
