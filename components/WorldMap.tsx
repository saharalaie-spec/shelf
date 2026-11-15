"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import world from "@/lib/data/world.json";
import { project, WORLD_VIEW, type MapPlace } from "@/lib/world";
import { Button, Icon } from "./ui";

// Each continent's stone, spelled out in full so the stylesheet keeps these colors (app/globals.css).
const REGIONS = [
  ["americas", "var(--map-americas)"],
  ["europe", "var(--map-europe)"],
  ["africa", "var(--map-africa)"],
  ["asia", "var(--map-asia)"],
  ["oceania", "var(--map-oceania)"],
] as const;
const MAX_ZOOM = 10;
/** Places closer than this many screen pixels share one circle, until you zoom in. */
const MERGE_PX = 26;

type View = { cx: number; cy: number; z: number };
const HOME: View = { cx: WORLD_VIEW.x + WORLD_VIEW.width / 2, cy: WORLD_VIEW.y + WORLD_VIEW.height / 2, z: 1 };

function clamp(v: View): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
  const w = WORLD_VIEW.width / z;
  const h = WORLD_VIEW.height / z;
  const cx = Math.min(WORLD_VIEW.x + WORLD_VIEW.width - w / 2, Math.max(WORLD_VIEW.x + w / 2, v.cx));
  const cy = Math.min(WORLD_VIEW.y + WORLD_VIEW.height - h / 2, Math.max(WORLD_VIEW.y + h / 2, v.cy));
  return { cx, cy, z };
}

/**
 * All your places on one world map: smooth continents in Trove's stones, a navy circle for each place with its number
 * of spots (nearby places share one until you zoom), and a card below for the one you tap, with Open. Drawn by the
 * app itself, no map service. Zoom with the buttons, a double tap, or a pinch once zoomed in; drag to move around.
 */
export function WorldMap({ places, onOpen, openLabel = "Open" }: { places: MapPlace[]; onOpen: (id: string) => void; openLabel?: string }) {
  const [view, setView] = useState<View>(HOME);
  const [chosen, setChosen] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(350);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth || 350));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = WORLD_VIEW.width / view.z;
  const h = WORLD_VIEW.height / view.z;
  const vx = view.cx - w / 2;
  const vy = view.cy - h / 2;
  const unit = w / px; // map units per screen pixel

  // Nearby places share a circle at this zoom; the biggest place leads it.
  const circles = useMemo(() => {
    const pts = places.map((p) => ({ p, at: project(p.lon, p.lat) })).sort((a, b) => b.p.spots - a.p.spots);
    const out: { at: [number, number]; members: MapPlace[] }[] = [];
    for (const { p, at } of pts) {
      const near = out.find((c) => Math.hypot(c.at[0] - at[0], c.at[1] - at[1]) < MERGE_PX * unit);
      if (near) near.members.push(p);
      else out.push({ at, members: [p] });
    }
    return out;
  }, [places, unit]);

  const zoomAt = (factor: number, x = view.cx, y = view.cy) =>
    setView((v) => clamp({ z: v.z * factor, cx: x + (v.cx - x) / factor, cy: y + (v.cy - y) / factor }));

  // Dragging to move, two fingers to pinch. Only once zoomed in, so on the world view a finger still scrolls the page.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return [vx + ((e.clientX - r.left) / r.width) * w, vy + ((e.clientY - r.top) / r.height) * h] as const;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) {
        const [mx, my] = toMap({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        zoomAt(d / pinch.current, mx, my);
      }
      pinch.current = d;
    } else if (view.z > 1 && e.buttons) {
      const dx = (e.clientX - prev.x) * unit;
      const dy = (e.clientY - prev.y) * unit;
      setView((v) => clamp({ ...v, cx: v.cx - dx, cy: v.cy - dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // A mouse wheel or trackpad zooms too (desktop).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const vw = WORLD_VIEW.width / v.z, vh = WORLD_VIEW.height / v.z;
        const x = v.cx - vw / 2 + ((e.clientX - r.left) / r.width) * vw;
        const y = v.cy - vh / 2 + ((e.clientY - r.top) / r.height) * vh;
        const f = Math.exp(-e.deltaY * 0.004);
        return clamp({ z: v.z * f, cx: x + (v.cx - x) / f, cy: y + (v.cy - y) / f });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const tap = (c: { at: [number, number]; members: MapPlace[] }) => {
    if (c.members.length === 1 || view.z >= MAX_ZOOM) {
      setChosen(c.members[0].id);
      return;
    }
    // Several places in one circle: zoom to fit them all, with room around them for their names.
    const pts = c.members.map((m) => project(m.lon, m.lat));
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const want = Math.min(MAX_ZOOM, Math.max(view.z * 2, Math.min(WORLD_VIEW.width / (spanX * 2.4), WORLD_VIEW.height / (spanY * 2.8))));
    setView(clamp({ z: want, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 + (WORLD_VIEW.height / want) * 0.04 }));
  };

  const place = places.find((p) => p.id === chosen) ?? null;
  const r = (n: number) => (7 + Math.sqrt(n) * 2.6) * unit;

  return (
    <div className="mb-5">
      <div
        ref={box}
        className="relative overflow-hidden rounded-2xl bg-[var(--map-sea)] select-none"
        style={{ aspectRatio: `${WORLD_VIEW.width} / ${WORLD_VIEW.height}`, touchAction: view.z > 1 ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const [x, y] = toMap(e);
          zoomAt(2, x, y);
        }}
      >
        <svg viewBox={`${vx} ${vy} ${w} ${h}`} className="absolute inset-0 h-full w-full" role="img" aria-label={`Map of ${places.length} places`}>
          {/* Faint lines of longitude and latitude. */}
          <g stroke="var(--map-grid)" strokeWidth={unit} fill="none">
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
              <polyline key={lon} points={Array.from({ length: 29 }, (_, i) => project(lon, -56 + i * 5).join(",")).join(" ")} />
            ))}
            {[-40, -20, 0, 20, 40, 60, 80].map((lat) => (
              <line key={lat} x1={0} x2={1000} y1={project(0, lat)[1]} y2={project(0, lat)[1]} />
            ))}
          </g>
          {REGIONS.map(([reg, color]) => (
            <path key={reg} d={world.paths[reg]} fill={color} stroke={color} strokeWidth={0.6 * Math.min(1, unit * 2)} strokeLinejoin="round" />
          ))}
          {circles.map((c) => {
            const spots = c.members.reduce((n, m) => n + m.spots, 0);
            const on = c.members.some((m) => m.id === chosen);
            const rr = r(spots);
            const label = c.members.length === 1 && view.z >= 2.5 ? c.members[0].name : null;
            return (
              <g key={c.members.map((m) => m.id).join(",")} className="cursor-pointer" onClick={() => tap(c)} role="button" aria-label={c.members.map((m) => m.name).join(", ")}>
                <circle cx={c.at[0]} cy={c.at[1]} r={rr + 3 * unit} fill="var(--accent)" opacity={0.14} />
                <circle cx={c.at[0]} cy={c.at[1]} r={rr} fill={on ? "var(--surface)" : "var(--accent)"} stroke={on ? "var(--accent)" : "var(--surface)"} strokeWidth={1.6 * unit} />
                <text x={c.at[0]} y={c.at[1] + 3.6 * unit} textAnchor="middle" fontSize={10 * unit} fontWeight={600} fill={on ? "var(--accent)" : "var(--accent-ink)"}>
                  {spots}
                </text>
                {label && (
                  <text x={c.at[0]} y={c.at[1] + rr + 12 * unit} textAnchor="middle" fontSize={11 * unit} fontWeight={600} fill="var(--ink)" paintOrder="stroke" stroke="var(--map-sea)" strokeWidth={3 * unit}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute right-2 bottom-2 flex gap-1.5">
          {view.z > 1 && (
            <MapButton label="Whole world" onClick={() => setView(HOME)}>
              <Icon name="globe2" size={15} />
            </MapButton>
          )}
          {view.z > 1 && (
            <MapButton label="Zoom out" onClick={() => zoomAt(1 / 2)}>
              <span className="text-[17px] leading-none">−</span>
            </MapButton>
          )}
          <MapButton label="Zoom in" onClick={() => zoomAt(2)} disabled={view.z >= MAX_ZOOM}>
            <span className="text-[17px] leading-none">+</span>
          </MapButton>
        </div>
      </div>

      {place && (
        <div className="mt-3 rounded-2xl bg-surface p-4 shadow-book">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-serif text-[21px] leading-tight font-medium tracking-tight">{place.name}</p>
              <p className="text-[14px] text-muted">
                {[place.country !== place.name ? place.country : null, `${place.spots} ${place.spots === 1 ? "spot" : "spots"}`, `${place.been} been`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button onClick={() => setChosen(null)} aria-label="Close" className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2">
              <Icon name="x" size={18} />
            </button>
          </div>
          {place.some.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[14px] text-ink-2">
              {place.some.map((s) => (
                <li key={s.title} className="flex items-center gap-2 truncate">
                  {s.been ? <Icon name="check" size={14} className="shrink-0" /> : <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-current" aria-hidden />}
                  <span className="truncate">{s.title}</span>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-3 w-full" onClick={() => onOpen(place.id)}>
            {openLabel} {place.name} ›
          </Button>
        </div>
      )}
    </div>
  );
}

function MapButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink shadow-book active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
