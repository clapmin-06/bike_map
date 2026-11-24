// 기상청 단기예보 격자(DFS) 변환: 위경도 → (nx, ny). Lambert Conformal Conic.
export function toKmaGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = 30 * D;
  const slat2 = 60 * D;
  const olon = 126 * D;
  const olat = 38 * D;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5),
  };
}
