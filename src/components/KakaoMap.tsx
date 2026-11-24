"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { LatLng, Place } from "@/lib/mockData";
import type { DrawnRoute, Hotspot, Station } from "@/lib/types";
import { HOTSPOT_RADIUS_M } from "@/lib/accidents";

declare global {
  interface Window {
    kakao?: any;
  }
}

const APP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
// 사고다발지역 색: 사고 건수 기준 표시용 구분 (선정 최소 기준은 4건)
const hotspotColor = (count: number) => (count >= 8 ? "#dc2626" : count >= 5 ? "#f59e0b" : "#eab308");
const NEAR_ROUTE_COLOR = "#7c3aed";

type Props = {
  origin: Place | null;
  destination: Place | null;
  routes: DrawnRoute[];
  selectedRouteId: string;
  stations: Station[];
  accidents: Hotspot[];
  /** 경로 근처로 판정된 사고다발지역 id (강조 표시) */
  nearIds?: string[];
  showStations: boolean;
  showAccidents: boolean;
  showRoute: boolean;
  /** 지도 이동/확대 후 현재 화면 영역 (bbox = "swLat,swLng,neLat,neLng") */
  onViewport?: (v: { bbox: string; level: number }) => void;
  /** 목록에서 선택한 대여소로 이동하고 팝업을 엽니다. `nonce`가 바뀔 때마다 동작합니다. */
  focus?: { station: Station; nonce: number } | null;
};

function bikeColor(bikes: number) {
  return bikes === 0 ? "#9ca3af" : bikes <= 3 ? "#f59e0b" : "#16a34a";
}

function loadSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.LatLng) return resolve(window.kakao);
    const existing = document.getElementById("kakao-map-sdk");
    const onReady = () => window.kakao.maps.load(() => resolve(window.kakao));
    if (existing) {
      existing.addEventListener("load", onReady);
      return;
    }
    const s = document.createElement("script");
    s.id = "kakao-map-sdk";
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${APP_KEY}&autoload=false`;
    s.onload = onReady;
    s.onerror = () => reject(new Error("카카오맵 SDK를 불러오지 못했습니다. 키와 등록 도메인을 확인하세요."));
    document.head.appendChild(s);
  });
}

export default function KakaoMap(props: Props) {
  const { origin, destination, routes, selectedRouteId, stations, accidents, nearIds } = props;
  const { showStations, showAccidents, showRoute, onViewport, focus } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const stationOverlays = useRef<any[]>([]);
  const popup = useRef<any>(null);
  const openPopupRef = useRef<((s: Station) => void) | null>(null);
  const onViewportRef = useRef(onViewport);
  useEffect(() => {
    onViewportRef.current = onViewport;
  });
  const oLat = origin?.lat;
  const oLng = origin?.lng;
  const dLat = destination?.lat;
  const dLng = destination?.lng;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(
    APP_KEY ? null : "NEXT_PUBLIC_KAKAO_MAP_KEY 환경변수가 설정되지 않았습니다.",
  );

  // SDK 로드 및 지도 생성
  useEffect(() => {
    if (!APP_KEY) return;
    let cancelled = false;
    loadSdk()
      .then((kakao) => {
        if (cancelled || !box.current) return;
        mapRef.current = new kakao.maps.Map(box.current, {
          center: new kakao.maps.LatLng(37.5380, 126.9900),
          level: 8,
        });
        const map = mapRef.current;
        map.setZoomable(true);
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT); // +/- 버튼
        const report = () => {
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          onViewportRef.current?.({
            bbox: [sw.getLat(), sw.getLng(), ne.getLat(), ne.getLng()].map((v: number) => v.toFixed(5)).join(","),
            level: map.getLevel(),
          });
        };
        kakao.maps.event.addListener(map, "idle", report);
        kakao.maps.event.addListener(map, "click", () => popup.current?.setMap(null));
        setReady(true);
        report();
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // 오버레이 갱신
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const ll = (p: LatLng) => new kakao.maps.LatLng(p.lat, p.lng);
    const add = (o: any) => {
      o.setMap(map);
      overlays.current.push(o);
    };
    const pin = (p: LatLng, html: string, z = 1) =>
      add(new kakao.maps.CustomOverlay({ position: ll(p), content: html, yAnchor: 1, zIndex: z }));

    if (showRoute) {
      routes.forEach((r) => {
        const selected = r.id === selectedRouteId;
        add(
          new kakao.maps.Polyline({
            path: r.path.map(ll),
            strokeWeight: selected ? 7 : 4,
            strokeColor: r.color,
            strokeOpacity: selected ? 0.95 : 0.4,
            strokeStyle: selected ? "solid" : "shortdash",
            zIndex: selected ? 5 : 1,
          }),
        );
      });
    }

    if (showAccidents) {
      const near = new Set(nearIds ?? []);
      accidents.forEach((a) => {
        const isNear = near.has(a.id);
        const color = isNear ? NEAR_ROUTE_COLOR : hotspotColor(a.count);
        // 선정 기준 반경(200m)을 그대로 그립니다.
        add(
          new kakao.maps.Circle({
            center: ll(a),
            radius: HOTSPOT_RADIUS_M,
            strokeWeight: isNear ? 3 : 2,
            strokeColor: color,
            strokeOpacity: 0.9,
            fillColor: color,
            fillOpacity: isNear ? 0.35 : 0.22,
            zIndex: isNear ? 3 : 2,
          }),
        );
        const el = document.createElement("button");
        el.type = "button";
        el.title = a.title;
        el.textContent = `⚠ ${a.count}`;
        el.style.cssText = `font:700 11px sans-serif;background:${color};color:#fff;padding:2px 6px;border-radius:10px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          popup.current?.setMap(null);
          const box = document.createElement("div");
          box.style.cssText =
            "background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.25);font:12px sans-serif;color:#0f172a;min-width:170px;margin-bottom:30px";
          const t = document.createElement("b");
          t.textContent = a.title;
          t.style.cssText = "display:block;font-size:13px;margin-bottom:3px";
          const l1 = document.createElement("div");
          l1.textContent = `${a.area ? a.area + " · " : ""}과거 사고 ${a.count}건`;
          const l2 = document.createElement("div");
          l2.textContent = `사상자 ${a.casualties}명 (사망 ${a.deaths} · 중상 ${a.serious} · 경상 ${a.minor})`;
          const l3 = document.createElement("div");
          l3.textContent = "※ 과거 사고 통계이며 현재 상황이 아닙니다";
          l3.style.cssText = "color:#b45309;margin-top:3px";
          box.append(t, l1, l2, l3);
          popup.current = new kakao.maps.CustomOverlay({ position: ll(a), content: box, yAnchor: 1, zIndex: 30 });
          popup.current.setMap(map);
        });
        add(new kakao.maps.CustomOverlay({ position: ll(a), content: el, yAnchor: 1, zIndex: 4 }));
      });
    }

    const flag = (p: Place, label: string, color: string) =>
      pin(
        p,
        `<div style="display:flex;flex-direction:column;align-items:center">
           <div style="background:${color};color:#fff;font:700 12px sans-serif;padding:4px 8px;border-radius:6px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap">${label} · ${p.name}</div>
           <div style="width:2px;height:10px;background:${color}"></div>
         </div>`,
        10,
      );
    if (origin) flag(origin, "출발", "#111827");
    if (destination) flag(destination, "도착", "#7c3aed");

  }, [ready, origin, destination, routes, selectedRouteId, accidents, nearIds, showAccidents, showRoute]);

  // 출발·도착이 바뀔 때만 해당 범위로 맞춤 (대여소 갱신·토글로는 움직이지 않음)
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !map) return;
    const pts = [
      oLat !== undefined && oLng !== undefined ? { lat: oLat, lng: oLng } : null,
      dLat !== undefined && dLng !== undefined ? { lat: dLat, lng: dLng } : null,
    ].filter(Boolean) as { lat: number; lng: number }[];
    if (pts.length === 2) {
      const bounds = new kakao.maps.LatLngBounds();
      pts.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
      map.setBounds(bounds, 80, 80, 80, 80);
    } else if (pts.length === 1) {
      map.panTo(new kakao.maps.LatLng(pts[0].lat, pts[0].lng));
    }
    // 사용자가 확대/이동한 뒤 리렌더링만으로 화면이 되돌려지지 않도록, 좌표 '값'이 바뀔 때만 실행
  }, [ready, oLat, oLng, dLat, dLng]);

  // 대여소 마커 (실시간 데이터). 이름은 외부 데이터이므로 innerHTML 없이 textContent로만 넣습니다.
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !map) return;
    stationOverlays.current.forEach((o) => o.setMap(null));
    stationOverlays.current = [];
    if (!showStations) {
      popup.current?.setMap(null);
      return;
    }

    const openPopup = (s: Station) => {
      popup.current?.setMap(null);
      const el = document.createElement("div");
      el.style.cssText =
        "background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.25);font:12px sans-serif;color:#0f172a;min-width:150px;margin-bottom:34px";
      const title = document.createElement("b");
      title.textContent = s.name;
      title.style.cssText = "display:block;font-size:13px;margin-bottom:3px";
      const body = document.createElement("div");
      body.textContent = `이용 가능 자전거 ${s.bikes}대 · 거치대 ${s.racks}`;
      el.append(title, body);
      if (s.distanceM !== undefined) {
        const d = document.createElement("div");
        d.textContent = `출발지에서 ${s.distanceM}m`;
        d.style.color = "#64748b";
        el.append(d);
      }
      popup.current = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content: el,
        yAnchor: 1,
        zIndex: 20,
      });
      popup.current.setMap(map);
    };
    openPopupRef.current = openPopup;

    stations.forEach((s) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = s.name;
      el.textContent = `🚲 ${s.bikes}`;
      el.style.cssText = `background:${bikeColor(s.bikes)};color:#fff;font:700 12px sans-serif;padding:3px 7px;border-radius:12px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopup(s);
      });
      const o = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content: el,
        yAnchor: 1,
        zIndex: 3,
      });
      o.setMap(map);
      stationOverlays.current.push(o);
    });
  }, [ready, stations, showStations]);

  // 목록에서 대여소를 선택하면 해당 위치로 이동하고 팝업을 엽니다.
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    map.setLevel(Math.min(map.getLevel(), 4));
    map.panTo(new kakao.maps.LatLng(focus.station.lat, focus.station.lng));
    openPopupRef.current?.(focus.station);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  return (
    <div className="relative h-full w-full bg-slate-100">
      <div ref={box} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          {error ? (
            <div className="max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow">
              <p className="font-semibold">지도를 표시할 수 없습니다</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2 text-xs">
                <code>.env.local</code>에 <code>NEXT_PUBLIC_KAKAO_MAP_KEY=발급받은_JavaScript_키</code>를 넣고
                서버를 재시작하세요. 카카오 개발자 콘솔의 <b>플랫폼 &gt; Web</b>에 <code>http://localhost:3000</code>을
                등록해야 합니다.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">지도를 불러오는 중…</p>
          )}
        </div>
      )}
    </div>
  );
}
