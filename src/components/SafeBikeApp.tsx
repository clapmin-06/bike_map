"use client";

import { useEffect, useMemo, useState } from "react";
import KakaoMap from "./KakaoMap";
import { PLACES, type Place } from "@/lib/mockData";
import IntegratedPanel, { ROUTE_COLOR } from "./IntegratedPanel";
import type { DrawnRoute, Hotspot, RouteState, Station } from "@/lib/types";
import { hotspotsNearPath, HOTSPOT_RADIUS_M } from "@/lib/accidents";
import { NEAR_ROUTE_M } from "@/lib/compare";
import type { Slot } from "@/lib/forecast";

type StationResult = { stations: Station[]; fetchedAt: number };
type Loadable = { loading: boolean; error: string | null; data: StationResult | null };
const RADII = [500, 1000, 2000] as const;
const MIN_ZOOM_LEVEL = 6; // 이 레벨 이하(확대)일 때만 화면 영역 대여소를 불러옵니다.

async function loadStations(query: string, signal: AbortSignal): Promise<StationResult> {
  const res = await fetch(`/api/stations?${query}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = body.missing ? ` (서버에 ${body.missing} 설정 필요)` : "";
    throw new Error(`${body.error ?? "대여소 정보를 불러오지 못했습니다."}${hint}`);
  }
  return { stations: body.stations, fetchedAt: body.fetchedAt };
}

function useStationQuery(query: string | null): Loadable {
  const [state, setState] = useState<Loadable>({ loading: false, error: null, data: null });
  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    loadStations(query, ctrl.signal)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState((s) => ({ ...s, loading: false, error: e.message }));
      });
    return () => ctrl.abort();
  }, [query]);
  return query ? state : { loading: false, error: null, data: null };
}

/** 출발 대여소 → 목적지 자전거 경로. 실패하면 이유를 그대로 보여주며, 경로를 임의로 만들지 않습니다. */
function useBikeRoutes(key: string | null) {
  const [state, setState] = useState<RouteState | null>(null);
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/bike-route?${key}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({
            key,
            routes: [],
            failures: [],
            fetchedAt: Date.now(),
            provider: body.provider ?? null,
            error: {
              message: body.error ?? "자전거 경로를 조회하지 못했습니다.",
              reason: body.reason,
              detail: body.detail,
              hint: body.hint,
              missing: body.missing,
            },
          });
          return;
        }
        setState({ key, routes: body.routes, failures: body.failures ?? [], error: null, fetchedAt: body.fetchedAt ?? Date.now(), provider: body.provider ?? null });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") {
          setState({ key, routes: [], failures: [], fetchedAt: Date.now(), provider: null, error: { message: "경로 서버에 연결하지 못했습니다." } });
        }
      });
    return () => ctrl.abort();
  }, [key]);
  const ready = !!key && state?.key === key;
  return { loading: !!key && !ready, state: ready ? state : null };
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

type HotspotState = {
  baseYear: number;
  hotspots: Hotspot[];
  fetchedAt: number;
};

function useHotspots() {
  const [state, setState] = useState<{ data: HotspotState | null; error: string | null; done: boolean }>({
    data: null,
    error: null,
    done: false,
  });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/accidents", { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const hint = body.missing ? ` (서버에 ${body.missing} 설정 필요)` : "";
          setState({ data: null, error: `${body.error ?? "사고다발지역을 불러오지 못했습니다."}${hint}`, done: true });
          return;
        }
        setState({
          data: { baseYear: body.baseYear, hotspots: body.hotspots, fetchedAt: body.fetchedAt },
          error: null,
          done: true,
        });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ data: null, error: "사고다발지역 서버에 연결하지 못했습니다.", done: true });
      });
    return () => ctrl.abort();
  }, []);
  return state;
}

type ForecastState = {
  grid: { nx: number; ny: number };
  base: { baseDate: string; baseTime: string };
  slots: Slot[];
  fetchedAt: number;
};

function useForecast(lat: number | null, lng: number | null) {
  const key = lat !== null && lng !== null ? `lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}` : null;
  const [state, setState] = useState<{ key: string; data: ForecastState | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/forecast?${key}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const hint = body.missing ? ` (서버에 ${body.missing} 설정 필요)` : "";
          setState({ key, data: null, error: `${body.error ?? "예보를 불러오지 못했습니다."}${hint}` });
          return;
        }
        setState({ key, data: { grid: body.grid, base: body.base, slots: body.slots, fetchedAt: body.fetchedAt ?? Date.now() }, error: null });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ key, data: null, error: "예보 서버에 연결하지 못했습니다." });
      });
    return () => ctrl.abort();
  }, [key]);
  const ready = !!key && state?.key === key;
  return { loading: !!key && !ready, data: ready ? state!.data : null, error: ready ? state!.error : null };
}

/** 발표시각: 기상청이 예보를 낸 시각 (YYYYMMDD, HHMM → "2026-11-19 11:00") */
const fmtBase = (d: string, t: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2)}`;
/** 예보시각: 예보가 가리키는 시각 ("11/19 12시") */
const fmtFcst = (d: string, t: string) => `${d.slice(4, 6)}/${d.slice(6, 8)} ${t.slice(0, 2)}시`;

function PlaceSearch({
  label,
  value,
  onSelect,
  excludeId,
}: {
  label: string;
  value: Place | null;
  onSelect: (p: Place | null) => void;
  excludeId?: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const results = useMemo(
    () => PLACES.filter((p) => p.id !== excludeId && (query.trim() === "" || p.name.includes(query.trim()))),
    [query, excludeId],
  );

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <input
        value={query}
        placeholder={`${label}를 검색하세요`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">검색 결과가 없습니다</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(p);
                  setQuery(p.name);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-emerald-50"
              >
                <span className="block text-sm font-medium text-slate-800">{p.name}</span>
                <span className="block text-xs text-slate-500">{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function Card({
  title,
  children,
  live,
}: {
  title: string;
  children: React.ReactNode;
  live?: string; // 실시간/공식 데이터 출처 배지
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {live && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            {live}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export default function SafeBikeApp() {
  const [origin, setOrigin] = useState<Place | null>(PLACES[0]);
  const [destination, setDestination] = useState<Place | null>(PLACES[1]);
  const [routeStart, setRouteStart] = useState<Station | null>(null); // 경로 출발 대여소
  const [routeId, setRouteId] = useState<string>("PRIMARY");
  const [showStations, setShowStations] = useState(true);
  const [showAccidents, setShowAccidents] = useState(true);
  const [showRoute, setShowRoute] = useState(true);

  const [radius, setRadius] = useState<(typeof RADII)[number]>(1000);
  const [viewport, setViewport] = useState<{ bbox: string; level: number } | null>(null);
  const [focus, setFocus] = useState<{ station: Station; nonce: number } | null>(null);

  // 출발지 주변 대여소 (거리순) / 현재 화면 영역 대여소
  const nearby = useStationQuery(origin ? `lat=${origin.lat}&lng=${origin.lng}&radius=${radius}&limit=20` : null);
  const zoomedIn = !!viewport && viewport.level <= MIN_ZOOM_LEVEL;
  const inView = useStationQuery(zoomedIn && showStations ? `bbox=${viewport!.bbox}&limit=300` : null);

  const mapStations = useMemo(() => {
    const byId = new Map<string, Station>();
    (inView.data?.stations ?? []).forEach((s) => byId.set(s.id, s));
    (nearby.data?.stations ?? []).forEach((s) => byId.set(s.id, s)); // 거리 정보가 있는 쪽 우선
    return [...byId.values()];
  }, [inView.data, nearby.data]);

  const routeKey =
    routeStart && destination
      ? `olat=${routeStart.lat}&olng=${routeStart.lng}&dlat=${destination.lat}&dlng=${destination.lng}`
      : null;
  const bikeRoutes = useBikeRoutes(routeKey);
  const drawnRoutes: DrawnRoute[] = useMemo(
    () => (bikeRoutes.state?.routes ?? []).map((r) => ({ id: r.priority, color: ROUTE_COLOR[r.priority], path: r.path })),
    [bikeRoutes.state],
  );
  const selectedRouteId = drawnRoutes.some((r) => r.id === routeId) ? routeId : (drawnRoutes[0]?.id ?? routeId);
  const startFresh = routeStart ? (nearby.data?.stations ?? []).find((x) => x.id === routeStart.id) : undefined;
  const hotspots = useHotspots();
  const selectedPath = bikeRoutes.state?.routes.find((r) => r.priority === selectedRouteId)?.path ?? null;
  const nearRoute = useMemo(
    () => (selectedPath && hotspots.data ? hotspotsNearPath(selectedPath, hotspots.data.hotspots, NEAR_ROUTE_M) : []),
    [selectedPath, hotspots.data],
  );
  const nearIds = useMemo(() => nearRoute.map((h) => h.id), [nearRoute]);
  // 지도 출발 깃발: 경로 출발 대여소가 있으면 그 위치
  const mapOrigin: Place | null = useMemo(
    () =>
      routeStart
        ? { id: routeStart.id, name: routeStart.name, address: "", lat: routeStart.lat, lng: routeStart.lng }
        : origin,
    [routeStart, origin],
  );
  const forecast = useForecast(mapOrigin?.lat ?? null, mapOrigin?.lng ?? null);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="flex max-h-[55dvh] w-full shrink-0 flex-col overflow-y-auto border-b border-slate-200 bg-slate-50 md:max-h-none md:w-[400px] md:border-b-0 md:border-r">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
          <h1 className="text-lg font-extrabold text-emerald-700">🚲 Safe Bike Seoul</h1>
          <p className="mt-1 text-xs text-slate-500">
            대여소는 실시간, 날씨는 기상청 단기예보, 사고다발지역은 과거 통계입니다. 출발지 검색 후보만 예시 장소입니다.
          </p>
        </header>

        <div className="space-y-4 p-4">
          <Card title="경로 검색">
            <div className="space-y-3">
              <PlaceSearch label="출발지" value={origin} onSelect={setOrigin} excludeId={destination?.id} />
              <PlaceSearch label="목적지" value={destination} onSelect={setDestination} excludeId={origin?.id} />
              <p className="text-[11px] text-slate-400">검색 후보는 예시 장소 6곳만 제공됩니다. 아래 주변 대여소에서 <b>여기서 출발</b>을 누르면 목적지까지 자전거 경로를 조회합니다.</p>
            </div>
          </Card>

          <IntegratedPanel
            routeStart={routeStart}
            startStationLive={startFresh ?? routeStart}
            startIsLive={!!startFresh}
            destination={destination}
            routes={bikeRoutes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setRouteId}
            hotspots={{ loading: !hotspots.done, data: hotspots.data, error: hotspots.error }}
            forecast={forecast}
            stations={{ fetchedAt: nearby.data?.fetchedAt ?? null, error: nearby.error, loading: !nearby.data && !nearby.error && !!origin }}
          />

          <Card title="날씨 예보 (기온 · 강수확률)" live="기상청 단기예보">
            {!mapOrigin && <p className="text-sm text-slate-500">출발지를 선택하면 해당 위치의 예보를 보여드려요.</p>}
            {mapOrigin && (
              <p className="mb-2 text-xs text-slate-500">
                출발지 <b className="text-slate-700">{mapOrigin.name}</b> ({mapOrigin.lat.toFixed(4)}, {mapOrigin.lng.toFixed(4)})
                {forecast.data && (
                  <>
                    {" "}
                    → 기상청 격자 <b className="text-slate-700">nx {forecast.data.grid.nx}, ny {forecast.data.grid.ny}</b>
                  </>
                )}
              </p>
            )}
            {forecast.loading && <p className="text-sm text-slate-500">예보 불러오는 중…</p>}
            {forecast.error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {forecast.error}
              </p>
            )}
            {forecast.data && (
              <>
                <dl className="mb-3 space-y-1 rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold">발표시각</dt>
                    <dd>
                      {fmtBase(forecast.data.base.baseDate, forecast.data.base.baseTime)}{" "}
                      <span className="text-slate-500">(기상청이 예보를 낸 시각)</span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold">가장 가까운 예보시각</dt>
                    <dd>
                      {fmtFcst(forecast.data.slots[0].fcstDate, forecast.data.slots[0].fcstTime)}{" "}
                      <span className="text-slate-500">(예보가 가리키는 시각)</span>
                    </dd>
                  </div>
                </dl>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-center text-xs">
                    <caption className="sr-only">예보시각별 기온과 강수확률</caption>
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-medium">예보시각</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">기온</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">강수확률</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">하늘</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forecast.data.slots.map((sl, i) => (
                        <tr key={sl.fcstDate + sl.fcstTime} className={i === 0 ? "bg-emerald-50" : ""}>
                          <th scope="row" className="px-2 py-1.5 font-medium text-slate-700">
                            {fmtFcst(sl.fcstDate, sl.fcstTime)}
                          </th>
                          <td className="px-2 py-1.5 font-semibold text-slate-900">{sl.tempC !== null ? `${sl.tempC}°C` : "-"}</td>
                          <td
                            className={`px-2 py-1.5 font-semibold ${
                              (sl.popPct ?? 0) >= 60 ? "text-blue-700" : "text-slate-900"
                            }`}
                          >
                            {sl.popPct !== null ? `${sl.popPct}%` : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {sl.precipitation && sl.precipitation !== "없음" ? sl.precipitation : (sl.sky ?? "-")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  발표시각은 하루 8회(02·05·08·11·14·17·20·23시)이며, 표는 발표분의 시간대별 예보시각입니다.
                </p>
              </>
            )}
          </Card>

          <Card title={origin ? `${origin.name} 주변 대여소` : "출발지 주변 대여소"} live="실시간 · 서울 열린데이터광장">
            <div className="mb-2 flex gap-1">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={radius === r}
                  onClick={() => setRadius(r)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    radius === r ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {formatDistance(r)}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-slate-400">가까운 순</span>
            </div>

            {!origin && <p className="py-3 text-sm text-slate-500">출발지를 선택하면 주변 대여소를 보여드려요.</p>}
            {origin && nearby.error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {nearby.error}
              </p>
            )}
            {origin && !nearby.error && !nearby.data && <p className="py-3 text-sm text-slate-500">불러오는 중…</p>}
            {origin && !nearby.error && nearby.data && nearby.data.stations.length === 0 && (
              <p className="py-3 text-sm text-slate-500">반경 {formatDistance(radius)} 안에 대여소가 없습니다. 반경을 넓혀 보세요.</p>
            )}
            {nearby.data && nearby.data.stations.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {nearby.data.stations.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFocus({ station: s, nonce: Date.now() })}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-slate-800">{s.name}</span>
                        <span className="text-[11px] text-slate-400">{formatDistance(s.distanceM ?? 0)}</span>
                      </span>
                      <span className="flex shrink-0 gap-1.5 text-xs">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${
                            s.bikes === 0
                              ? "bg-slate-200 text-slate-600"
                              : s.bikes <= 3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          자전거 {s.bikes}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">거치대 {s.racks}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRouteStart(s)}
                      aria-pressed={routeStart?.id === s.id}
                      className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${
                        routeStart?.id === s.id
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      {routeStart?.id === s.id ? "출발지" : "여기서 출발"}
                    </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {nearby.data && (
              <p className="mt-2 text-[11px] text-slate-400">
                {new Date(nearby.data.fetchedAt).toLocaleTimeString("ko-KR")} 기준 · 약 30초마다 갱신되는 서버 캐시
              </p>
            )}
          </Card>

          <Card title="자전거 사고다발지역">
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="note">
              <p className="font-semibold">
                ⚠ 과거 사고 통계입니다{hotspots.data ? ` (${hotspots.data.baseYear}년 기준)` : ""}
              </p>
              <p className="mt-1">
                도로교통공단이 집계한 과거 자전거 사고 지점으로, 현재의 실시간 위험을 뜻하지 않습니다. 이후 도로 환경이
                개선·변경되었을 수 있습니다. 선정 기준: 직전 1년간 반경 {HOTSPOT_RADIUS_M}m 안 자전거 사고 4건 이상(사망
                포함 시 3건 이상).
              </p>
              {hotspots.data && (
                <p className="mt-1 text-amber-800">
                  제공되는 최신 기준연도는 {hotspots.data.baseYear}년입니다 ({new Date().getFullYear() - hotspots.data.baseYear}
                  년 전 자료).
                </p>
              )}
            </div>

            {!hotspots.done && <p className="text-sm text-slate-500">불러오는 중…</p>}
            {hotspots.error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {hotspots.error}
              </p>
            )}
            {hotspots.data && (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  서울 {hotspots.data.hotspots.length}곳을 지도에 표시합니다. 색은 사고 건수 기준: 빨강 8건↑ · 주황 5건↑ ·
                  노랑 4건↑.
                </p>
                {!selectedPath && (
                  <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
                    자전거 경로를 조회하면 경로에서 {NEAR_ROUTE_M}m 이내의 사고다발지역을 보여드려요.
                  </p>
                )}
                {selectedPath && nearRoute.length === 0 && (
                  <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                    선택한 경로 {NEAR_ROUTE_M}m 이내에 {hotspots.data.baseYear}년 기준 사고다발지역이 없습니다.
                  </p>
                )}
                {nearRoute.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-semibold text-violet-700">
                      경로 근처 {nearRoute.length}곳 (경로에서 {NEAR_ROUTE_M}m 이내)
                    </p>
                    <ul className="space-y-2">
                      {nearRoute.map((h) => (
                        <li key={h.id} className="rounded-lg border border-violet-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">{h.title}</span>
                            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                              경로에서 {h.distanceM}m
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {h.area && `${h.area} · `}과거 사고 {h.count}건 · 사상자 {h.casualties}명 (사망 {h.deaths} · 중상{" "}
                            {h.serious} · 경상 {h.minor})
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            <p className="mt-2 text-[11px] text-slate-400">출처: 한국도로교통공단 · 공공데이터포털</p>
          </Card>
        </div>
      </aside>

      <main className="relative min-h-[45dvh] flex-1">
        <KakaoMap
          origin={mapOrigin}
          destination={destination}
          routes={drawnRoutes}
          selectedRouteId={selectedRouteId}
          stations={mapStations}
          onViewport={(v) => setViewport((prev) => (prev && prev.bbox === v.bbox && prev.level === v.level ? prev : v))}
          focus={focus}
          accidents={hotspots.data?.hotspots ?? []}
          nearIds={nearIds}
          showStations={showStations}
          showAccidents={showAccidents}
          showRoute={showRoute}
        />
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 p-2 shadow">
          <Toggle label="경로" checked={showRoute} onChange={setShowRoute} />
          <Toggle label="따릉이 대여소" checked={showStations} onChange={setShowStations} />
          <Toggle label="사고다발지역" checked={showAccidents} onChange={setShowAccidents} />
        </div>
        {showStations && viewport && !zoomedIn && (
          <p className="absolute left-3 top-16 z-10 rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs text-white">
            지도를 더 확대하면 화면 안의 모든 대여소가 표시됩니다
          </p>
        )}
        {showStations && inView.error && (
          <p className="absolute left-3 top-16 z-10 max-w-xs rounded-lg bg-red-600/90 px-3 py-1.5 text-xs text-white" role="alert">
            {inView.error}
          </p>
        )}
        <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow">
          <p className="font-semibold">범례</p>
          <p>🚲 대여소 (실시간): 초록 여유 · 주황 부족(3대 이하) · 회색 없음</p>
          <p>━ 경로: 초록 자전거도로 우선 · 파랑 최단 (카카오모빌리티)</p>
          <p>
            ⚠ 사고다발지역 (과거 {hotspots.data ? `${hotspots.data.baseYear}년 ` : ""}통계): 빨강 8건↑ · 주황 5건↑ · 노랑 4건↑ · 보라 경로 근처
          </p>
        </div>
      </main>
    </div>
  );
}
