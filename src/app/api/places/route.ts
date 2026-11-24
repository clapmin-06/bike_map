import { getKey } from "@/lib/server/env";
import { fetchUpstreamJson, json, route, ValidationError } from "@/lib/server/http";

// 카카오 로컬 API(키워드 검색) 프록시. REST 키는 서버에서만 사용합니다.
type KakaoDoc = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도
  y: string; // 위도
};

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1 || q.length > 50) throw new ValidationError("q는 1~50자여야 합니다.");

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", q);
  url.searchParams.set("size", "10");
  // 서울 시청 기준으로 20km 이내 결과를 우선합니다.
  url.searchParams.set("x", "126.978");
  url.searchParams.set("y", "37.566");
  url.searchParams.set("radius", "20000");

  const data = (await fetchUpstreamJson("카카오 로컬 API", url, {
    headers: { Authorization: `KakaoAK ${getKey("kakaoRest")}` },
  })) as { documents?: KakaoDoc[] };

  const places = (data.documents ?? []).map((d) => ({
    id: d.id,
    name: d.place_name,
    address: d.road_address_name || d.address_name,
    lat: Number(d.y),
    lng: Number(d.x),
  }));
  return json({ places }, 60);
});
