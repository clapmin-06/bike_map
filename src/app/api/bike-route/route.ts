import { activeProvider, hintFor, requestBikeRoute, type Priority, type RouteFailure, type RouteSuccess } from "@/lib/server/bikeRoute";
import { json, num, route } from "@/lib/server/http";

// GET /api/bike-route?olat=&olng=&dlat=&dlng=
// 기본(PRIMARY)·최단(SHORTEST) 두 경로를 병렬 조회합니다. 제공자는 ORS_API_KEY 유무로 결정됩니다.
// 실패하면 경로를 만들어 내지 않고 실패 이유(reason)와 안내(hint)를 반환합니다.
export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const origin = { lat: num(p, "olat", { min: 33, max: 39 }), lng: num(p, "olng", { min: 124, max: 132 }) };
  const destination = { lat: num(p, "dlat", { min: 33, max: 39 }), lng: num(p, "dlng", { min: 124, max: 132 }) };

  const provider = activeProvider();
  const priorities: Priority[] = ["PRIMARY", "SHORTEST"];
  const results = await Promise.all(priorities.map((pr) => requestBikeRoute(origin, destination, pr)));

  const routes = results.filter((r): r is RouteSuccess => r.ok);
  const failures = results
    .map((r, i) => (r.ok ? null : { priority: priorities[i], ...r, hint: hintFor(r.reason, provider.id) }))
    .filter((f): f is RouteFailure & { priority: Priority; hint: string } => f !== null);

  if (routes.length === 0) {
    const first = failures[0];
    return Response.json(
      { error: "자전거 경로를 조회하지 못했습니다.", reason: first.reason, detail: first.message, hint: first.hint, failures, provider, fetchedAt: Date.now() },
      { status: first.reason === "NO_PERMISSION" ? 403 : first.reason === "BAD_REQUEST" ? 400 : 502 },
    );
  }
  return json({ routes, failures, provider, fetchedAt: Date.now() }, 60);
});
