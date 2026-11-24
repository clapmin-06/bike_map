// 출발지 검색용 예시 장소 6곳만 남아 있습니다. (대여소·경로·사고다발지역·날씨는 실제 API만 사용)

export type LatLng = { lat: number; lng: number };

export type Place = LatLng & { id: string; name: string; address: string };

export const PLACES: Place[] = [
  { id: "yeouido", name: "여의도공원", address: "서울 영등포구 여의공원로 68", lat: 37.5252, lng: 126.9226 },
  { id: "seoulforest", name: "서울숲", address: "서울 성동구 뚝섬로 273", lat: 37.5444, lng: 127.0374 },
  { id: "hongdae", name: "홍대입구역", address: "서울 마포구 양화로 160", lat: 37.5572, lng: 126.9245 },
  { id: "seoulstation", name: "서울역", address: "서울 용산구 한강대로 405", lat: 37.5547, lng: 126.9707 },
  { id: "jamsil", name: "잠실한강공원", address: "서울 송파구 잠실로 221-6", lat: 37.5183, lng: 127.0824 },
  { id: "gwanghwamun", name: "광화문광장", address: "서울 종로구 세종대로 172", lat: 37.5724, lng: 126.9769 },
];
