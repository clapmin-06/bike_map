import type { Station } from "./types";

// 서울 열린데이터광장 bikeList 응답 한 행
export type BikeListRow = {
  stationId: string;
  stationName: string;
  rackTotCnt: string;
  parkingBikeTotCnt: string;
  stationLatitude: string;
  stationLongitude: string;
};

export function normalizeRow(r: BikeListRow): Station | null {
  const lat = Number(r.stationLatitude);
  const lng = Number(r.stationLongitude);
  const bikes = Number(r.parkingBikeTotCnt);
  const racks = Number(r.rackTotCnt);
  // 좌표가 0 이거나 숫자가 아닌 행(점검 중 등)은 제외
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return {
    id: r.stationId,
    name: String(r.stationName ?? "").replace(/^\s*\d+\.\s*/, "").trim() || r.stationId,
    lat,
    lng,
    bikes: Number.isFinite(bikes) ? Math.max(0, bikes) : 0,
    racks: Number.isFinite(racks) ? Math.max(0, racks) : 0,
  };
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 기준점 반경 내 대여소를 가까운 순으로. */
export function nearest(all: Station[], lat: number, lng: number, radiusM: number, limit: number): Station[] {
  return all
    .map((s) => ({ ...s, distanceM: Math.round(distanceM(lat, lng, s.lat, s.lng)) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

export type BBox = { swLat: number; swLng: number; neLat: number; neLng: number };

/** 화면(bbox) 안의 대여소. 한도를 넘으면 화면 중심에 가까운 순으로 자릅니다. */
export function inBBox(all: Station[], b: BBox, limit: number): Station[] {
  const inside = all.filter((s) => s.lat >= b.swLat && s.lat <= b.neLat && s.lng >= b.swLng && s.lng <= b.neLng);
  if (inside.length <= limit) return inside;
  const cLat = (b.swLat + b.neLat) / 2;
  const cLng = (b.swLng + b.neLng) / 2;
  return inside
    .map((s) => ({ s, d: distanceM(cLat, cLng, s.lat, s.lng) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map((x) => x.s);
}
