"use client";

import { useMemo } from "react";
import type { Place } from "@/lib/mockData";
import type { Slot } from "@/lib/forecast";
import type { BikeRoute, Hotspot, RouteState, Station } from "@/lib/types";
import { describeDifference, NEAR_ROUTE_M, summarizeRoutes } from "@/lib/compare";

export const ROUTE_COLOR = { PRIMARY: "#16a34a", SHORTEST: "#2563eb" } as const;

type Fetched<T> = { loading: boolean; data: T | null; error: string | null };

type Props = {
  routeStart: Station | null; // 선택한 출발 대여소 (최신 대여 현황은 nearby 에서 찾아 표시)
  startStationLive: Station | null;
  startIsLive: boolean; // true: 최신 조회 목록에서 찾은 값, false: 선택 당시의 값(오래됐을 수 있음)
  destination: Place | null;
  routes: { loading: boolean; state: RouteState | null };
  selectedRouteId: string;
  onSelectRoute: (id: string) => void;
  hotspots: Fetched<{ baseYear: number; hotspots: Hotspot[]; fetchedAt: number }>;
  forecast: Fetched<{ grid: { nx: number; ny: number }; base: { baseDate: string; baseTime: string }; slots: Slot[]; fetchedAt: number }>;
  stations: { fetchedAt: number | null; error: string | null; loading: boolean };
};

// 시각은 항상 한국 시간(KST)으로 표시합니다. (브라우저/서버 시간대에 따라 달라지지 않게)
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Seoul" }); // 15:20:00
const dateTime = (ms: number) =>
  new Date(ms).toLocaleString("sv-SE", { hour12: false, timeZone: "Asia/Seoul" }).slice(5, 16).replace("-", "/"); // 11/19 15:20
const fmtBase = (d: string, t: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2)}`;
const fmtFcst = (d: string, t: string) => `${d.slice(4, 6)}/${d.slice(6, 8)} ${t.slice(0, 2)}시`;
const km = (m: number) => `${(m / 1000).toFixed(1)}km`;
const minutes = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
};

function Tile({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <div className="mt-0.5 text-sm font-bold text-slate-900">{children}</div>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{sub}</p>}
    </div>
  );
}

export default function IntegratedPanel(p: Props) {
  const { routes, hotspots, forecast, stations } = p;
  const summaries = useMemo(
    () => (routes.state && !routes.state.error && hotspots.data ? summarizeRoutes(routes.state.routes, hotspots.data.hotspots) : []),
    [routes.state, hotspots.data],
  );
  const slot0 = forecast.data?.slots[0];
  const year = hotspots.data?.baseYear;
  const routeFetchedAt = routes.state?.fetchedAt ?? null;

  const status = (loading: boolean, error: string | null, ok: boolean) =>
    loading ? <span className="text-slate-500">불러오는 중</span>
    : error ? <span className="text-red-600" title={error}>오류</span>
    : ok ? <span className="text-emerald-700">정상</span>
    : <span className="text-slate-400">대기</span>;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm" aria-label="통합 요약">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-800">통합 요약</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {p.routeStart ? `${p.routeStart.name} → ${p.destination?.name ?? "목적지 미선택"}` : "대여소를 골라 '여기서 출발'을 누르면 경로를 비교합니다."}
        </p>
      </div>

      {/* 1) 따릉이 · 날씨 · 사고다발지역 한눈에 */}
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="출발 대여소"
          sub={
            p.startStationLive
              ? p.startIsLive && stations.fetchedAt
                ? `조회 ${clock(stations.fetchedAt)}`
                : "선택 당시 값 (최신 목록에 없음)"
              : undefined
          }
        >
          {p.startStationLive ? (
            <>자전거 {p.startStationLive.bikes}대<span className="block text-[11px] font-medium text-slate-500">거치대 {p.startStationLive.racks}</span></>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </Tile>
        <Tile
          label="출발지 예보"
          sub={slot0 ? `${fmtFcst(slot0.fcstDate, slot0.fcstTime)} 예보` : undefined}
        >
          {slot0 ? (
            <>
              {slot0.tempC ?? "-"}°C<span className="block text-[11px] font-medium text-slate-500">강수확률 {slot0.popPct ?? "-"}%</span>
            </>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </Tile>
        <Tile label="사고다발지역" sub={year ? `과거 ${year}년 기준` : undefined}>
          {hotspots.data ? (
            <>
              서울 {hotspots.data.hotspots.length}곳<span className="block text-[11px] font-medium text-slate-500">지도에 표시</span>
            </>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </Tile>
      </div>

      {/* 2) 경로 비교 */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-xs font-bold text-slate-700">경로 비교</h3>

        {!p.routeStart && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">출발 대여소를 선택하면 두 경로를 조회합니다.</p>}
        {p.routeStart && !p.destination && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">목적지를 선택해 주세요.</p>}
        {routes.loading && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">경로 조회 중…</p>}

        {routes.state?.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p className="font-semibold">경로를 조회하지 못해 비교할 수 없습니다</p>
            <p className="mt-1">{routes.state.error.message}</p>
            {routes.state.error.missing && <p className="mt-1 text-xs">서버에 {routes.state.error.missing} 설정이 필요합니다.</p>}
            {routes.state.error.hint && <p className="mt-1 text-xs">{routes.state.error.hint}</p>}
            {routes.state.error.detail && <p className="mt-1 break-all text-[11px] text-red-600">상세: {routes.state.error.detail}</p>}
            <p className="mt-2 text-[11px] text-red-700">경로와 수치는 임의로 생성하지 않습니다. 아래 대여소·예보·사고다발지역 정보는 그대로 확인할 수 있습니다.</p>
          </div>
        )}

        {summaries.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[320px] text-center text-xs">
                <caption className="sr-only">경로별 거리와 경로 근처 사고다발지역 수</caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left font-medium">경로</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">거리</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">소요</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">근처 사고다발지역</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summaries.map((s) => {
                    const selected = s.priority === p.selectedRouteId;
                    return (
                      <tr
                        key={s.priority}
                        onClick={() => p.onSelectRoute(s.priority)}
                        className={`cursor-pointer ${selected ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                        aria-selected={selected}
                      >
                        <th scope="row" className="px-2 py-2 text-left font-semibold text-slate-800">
                          <button type="button" onClick={() => p.onSelectRoute(s.priority)} className="flex items-center gap-1.5 text-left">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ROUTE_COLOR[s.priority] }} />
                            {s.label}
                          </button>
                        </th>
                        <td className="px-2 py-2 font-semibold text-slate-900">{km(s.distanceM)}</td>
                        <td className="px-2 py-2 text-slate-700">{minutes(s.durationSec)}</td>
                        <td className="px-2 py-2 font-semibold text-slate-900">
                          {s.nearCount}곳
                          <span className="block text-[10px] font-normal text-slate-500">과거 사고 {s.nearAccidentSum}건</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {summaries.length === 2 && <p className="mt-1.5 text-[11px] text-slate-500">{describeDifference(summaries[0], summaries[1])}.</p>}
          </>
        )}

        {routes.state && !routes.state.error && routes.state.failures.map((f) => (
          <p key={f.priority} className="mt-1.5 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
            {f.priority === "PRIMARY" ? "기본" : "최단"} 경로만 조회하지 못했습니다: {f.message}
          </p>
        ))}

        {/* 안전성 단정 금지 안내 — 경로가 있든 없든 항상 표시 */}
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900" role="note">
          <b>이 비교는 안전 여부를 판단하지 않습니다.</b> 경로 중심선에서 {NEAR_ROUTE_M}m 이내에 있는 <b>과거</b>{year ? `(${year}년 기준)` : ""} 자전거
          사고다발지역 지점 수와 거리·시간만 보여줍니다. 지점 수가 적다고 더 안전하다거나 많다고 더 위험하다고 말할 수 없습니다. 교통량, 도로 구조·공사,
          시간대, 날씨, 사고다발지역으로 선정되지 않은 지점은 반영되지 않았습니다.
        </p>
      </div>

      {/* 3) 출처와 기준 시각 */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-xs font-bold text-slate-700">정보 출처 · 기준 시각</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[340px] text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-medium">항목</th>
                <th scope="col" className="px-2 py-1.5 font-medium">출처</th>
                <th scope="col" className="px-2 py-1.5 font-medium">기준 시각</th>
                <th scope="col" className="px-2 py-1.5 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top text-slate-700">
              <tr>
                <th scope="row" className="px-2 py-1.5 font-semibold">따릉이</th>
                <td className="px-2 py-1.5">서울 열린데이터광장 · 따릉이대여소 실시간 정보</td>
                <td className="px-2 py-1.5">
                  {stations.fetchedAt ? `서버 조회 ${clock(stations.fetchedAt)}` : "-"}
                  <span className="block text-[10px] text-slate-400">API가 측정시각을 주지 않아 조회시각 표시 (최대 30초 캐시)</span>
                </td>
                <td className="px-2 py-1.5">{status(stations.loading, stations.error, !!stations.fetchedAt)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 font-semibold">자전거 경로</th>
                <td className="px-2 py-1.5">{routes.state?.provider?.name ?? "자전거 경로 API (조회 전)"}</td>
                <td className="px-2 py-1.5">{routeFetchedAt ? `서버 조회 ${clock(routeFetchedAt)}` : "-"}</td>
                <td className="px-2 py-1.5">
                  {status(routes.loading, routes.state?.error?.message ?? null, !!routes.state && !routes.state.error)}
                  {routes.state?.error?.reason === "NO_PERMISSION" && <span className="block text-[10px] text-red-600">권한 없음</span>}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 font-semibold">사고다발지역</th>
                <td className="px-2 py-1.5">한국도로교통공단 · 공공데이터포털(15056681)</td>
                <td className="px-2 py-1.5">
                  {year ? `${year}년 집계 (과거)` : "-"}
                  {hotspots.data && <span className="block text-[10px] text-slate-400">서버 조회 {dateTime(hotspots.data.fetchedAt)}</span>}
                </td>
                <td className="px-2 py-1.5">{status(hotspots.loading, hotspots.error, !!hotspots.data)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 font-semibold">날씨</th>
                <td className="px-2 py-1.5">기상청 단기예보 (공공데이터포털)</td>
                <td className="px-2 py-1.5">
                  {forecast.data ? (
                    <>
                      발표 {fmtBase(forecast.data.base.baseDate, forecast.data.base.baseTime)}
                      {slot0 && <span className="block">예보 {fmtFcst(slot0.fcstDate, slot0.fcstTime)}</span>}
                      <span className="block text-[10px] text-slate-400">서버 조회 {clock(forecast.data.fetchedAt)}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-2 py-1.5">{status(forecast.loading, forecast.error, !!forecast.data)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 font-semibold">지도 · 장소</th>
                <td className="px-2 py-1.5">카카오맵 JavaScript SDK · 출발지/목적지 후보는 예시 장소</td>
                <td className="px-2 py-1.5">-</td>
                <td className="px-2 py-1.5 text-slate-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
        {routes.state?.provider?.attribution && (
          <p className="mt-1.5 text-[10px] text-slate-500">경로 데이터: {routes.state.provider.attribution}</p>
        )}
      </div>
    </section>
  );
}

export type { BikeRoute };
