import { json, num, route, ValidationError } from "@/lib/server/http";
import { getAllStations } from "@/lib/server/stationCache";
import { inBBox, nearest } from "@/lib/stations";

// 1) 주변 검색(거리순)  GET /api/stations?lat=37.54&lng=127.03&radius=1000&limit=20
// 2) 화면 영역 검색     GET /api/stations?bbox=swLat,swLng,neLat,neLng&limit=300
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;

  if (params.has("bbox")) {
    const p = (params.get("bbox") ?? "").split(",").map(Number);
    if (p.length !== 4 || p.some((v) => !Number.isFinite(v))) {
      throw new ValidationError("bbox는 swLat,swLng,neLat,neLng 형식이어야 합니다.");
    }
    const [swLat, swLng, neLat, neLng] = p;
    if (swLat >= neLat || swLng >= neLng || swLat < 33 || neLat > 39 || swLng < 124 || neLng > 132) {
      throw new ValidationError("bbox 범위가 올바르지 않습니다.");
    }
    const limit = params.has("limit") ? num(params, "limit", { min: 1, max: 500 }) : 300;
    const { stations, fetchedAt } = await getAllStations();
    return json({ fetchedAt, stations: inBBox(stations, { swLat, swLng, neLat, neLng }, limit) }, 15);
  }

  if (params.has("lat") || params.has("lng")) {
    const lat = num(params, "lat", { min: 33, max: 39 });
    const lng = num(params, "lng", { min: 124, max: 132 });
    const radius = params.has("radius") ? num(params, "radius", { min: 100, max: 5000 }) : 1000;
    const limit = params.has("limit") ? num(params, "limit", { min: 1, max: 100 }) : 20;
    const { stations, fetchedAt } = await getAllStations();
    return json({ fetchedAt, radius, stations: nearest(stations, lat, lng, radius, limit) }, 15);
  }

  throw new ValidationError("lat,lng 또는 bbox 파라미터가 필요합니다.");
});
