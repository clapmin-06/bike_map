import { getSeoulHotspots } from "@/lib/server/accidentCache";
import { json, route } from "@/lib/server/http";

// GET /api/accidents
// 서울 전체 자전거 사고다발지역과, 실제 조회에 성공한 가장 최근 기준연도(baseYear)를 반환합니다.
// ⚠ 과거 사고 통계이며 실시간 위험 정보가 아닙니다.
export const GET = route(async () => {
  const r = await getSeoulHotspots();
  return json(
    {
      baseYear: r.baseYear,
      yearProbes: r.probes, // 어떤 연도를 시도했고 어디서 데이터가 나왔는지(투명성)
      fetchedAt: r.fetchedAt,
      count: r.hotspots.length,
      hotspots: r.hotspots,
    },
    3600,
  );
});
