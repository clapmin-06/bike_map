import { activeProvider, hintFor, requestBikeRoute } from "@/lib/server/bikeRoute";
import { route } from "@/lib/server/http";

// GET /api/bike-route/check — 실제 호출 권한 점검용. 고정된 짧은 구간(서울역→광화문광장)으로
// API를 한 번 호출해 "사용 가능 / 불가 + 이유"만 반환합니다. 키 값은 반환하지 않습니다.
export const GET = route(async () => {
  const r = await requestBikeRoute(
    { lat: 37.5547, lng: 126.9707 },
    { lat: 37.5724, lng: 126.9769 },
    "PRIMARY",
  );
  if (r.ok) {
    return Response.json({ available: true, provider: activeProvider().name, sample: { distanceM: r.distanceM, durationSec: r.durationSec, points: r.path.length } });
  }
  return Response.json({
    available: false,
    provider: activeProvider().name,
    reason: r.reason,
    detail: r.message,
    hint: hintFor(r.reason, activeProvider().id),
    httpStatus: r.httpStatus ?? null,
  });
});
