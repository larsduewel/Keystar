"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { type MapSystem } from "./model";
import { matchingSystems } from "./search";
import { createMapRenderer } from "./renderer";
import { MapPlanning } from "./planning";
import { EMPTY_OVERLAY } from "./travel";
import { Panel } from "@/components/ui/glass";

export function UniverseMap({initialSystemId=null}:{initialSystemId?:number|null}) {
 const { t, f } = useI18n(); const m = t.map;
 const [systems, setSystems] = useState<MapSystem[]>([]);
 const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
 const [query, setQuery] = useState(""); const [space, setSpace] = useState("known");
 const [selected, setSelected] = useState<MapSystem | null>(null); const [labels, setLabels] = useState(true);
 const camera = useRef({ yaw: 0, pitch: .6, zoom: 1.4, panX: 0, panY: 0 });
 const redraw = useRef<() => void>(() => {});
 const rotationFrame = useRef(0);
 const stopRotation = () => { cancelAnimationFrame(rotationFrame.current); rotationFrame.current = 0; };
 const setCamera = (update: typeof camera.current | ((c: typeof camera.current) => typeof camera.current)) => {
  camera.current = typeof update === "function" ? update(camera.current) : update;
  redraw.current();
 };
 const [overlay, setOverlay] = useState(EMPTY_OVERLAY);
 const overlayRef = useRef(EMPTY_OVERLAY);
 useEffect(() => { overlayRef.current = overlay; redraw.current(); }, [overlay]);
 const canvas = useRef<HTMLCanvasElement>(null);
 useEffect(() => {
  const element = canvas.current;
  if (!element) return;
  const zoom = (event: WheelEvent) => {
   event.preventDefault();
   cancelAnimationFrame(rotationFrame.current);
   rotationFrame.current = 0;
   const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
   camera.current.zoom = Math.max(.3, Math.min(100, camera.current.zoom * Math.exp(-delta * .001)));
   redraw.current();
  };
  element.addEventListener("wheel", zoom, { passive: false });
  return () => element.removeEventListener("wheel", zoom);
 }, []);
 const hits = useRef<{system: MapSystem; x: number; y: number}[]>([]);
 const drag = useRef<{x: number; y: number; moved: boolean; pan: boolean} | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  fetch("/data/map-systems.json", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then((rows:MapSystem[]) => {setSystems(rows);const target=rows.find(s=>s[0]===initialSystemId);if(target){setSelected(target);setSpace(target[0]>=31000000?"wormholes":"known");camera.current={yaw:0,pitch:.6,zoom:5,panX:0,panY:0};}}).catch(e => { if (e.name !== "AbortError") setError(true); });
  return () => controller.abort();
 }, [attempt, initialSystemId]);
 const visible = useMemo(() => systems.filter(s => space === "all" || (space === "wormholes" ? s[0] >= 31000000 && s[0] < 32000000 : s[0] < 31000000)), [systems, space]);
 useEffect(() => {
  const el = canvas.current; if (!el || !visible.length) return;
  const renderer = createMapRenderer(el, visible, {
   overlay: () => overlayRef.current, camera: () => camera.current, dragging: () => !!drag.current?.moved,
   selected: selected?.[0] ?? null, query, labels, distanceUnit: m.lightYears, format: value => f.number(value, 1),
   onHits: points => { hits.current = points; },
  });
  redraw.current = renderer.schedule;
  renderer.schedule();
  return () => { renderer.destroy(); redraw.current = () => {}; };
 }, [visible, selected, query, labels, f, m.lightYears]);
 useEffect(() => {
  if (!selected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now(), yaw = camera.current.yaw;
  const rotate = (now: number) => {
   const elapsed = Math.min((now - start) / 1000, 4);
   camera.current.yaw = yaw + .3 * (1 - Math.exp(-elapsed));
   redraw.current();
   if (elapsed < 4) rotationFrame.current = requestAnimationFrame(rotate);
   else rotationFrame.current = 0;
  };
  rotationFrame.current = requestAnimationFrame(rotate);
  return () => { cancelAnimationFrame(rotationFrame.current); rotationFrame.current = 0; };
 }, [selected]);
 const button = "glass-chip rounded-md px-3 py-1.5 text-xs text-ink-2 hover:text-ink transition-colors";
 const choose = (s: MapSystem) => { stopRotation(); setSpace(s[0]>=31000000?"wormholes":"known"); setSelected(s); setCamera(c => ({...c,zoom:Math.max(c.zoom,5),panX:0,panY:0})); };
 return <div className="grid items-start gap-3 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]"><MapPlanning initialOriginId={initialSystemId} systems={systems} selected={selected} onFocus={choose} onOverlay={setOverlay}/><Panel title={m.universe} subtitle={m.controls} actions={<span className="text-xs font-semibold tabular-nums text-ink-2">{f.integer(visible.length)} {m.systems}</span>} bodyClassName="px-3 pb-3">
  <div className="mb-3 flex flex-wrap items-center gap-2">
   <input aria-label={m.search} placeholder={m.search} value={query} list="map-system-search" onChange={e => {setQuery(e.target.value);const match=systems.find(s=>s[1].toLowerCase()===e.target.value.trim().toLowerCase());if(match)choose(match);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const match=matchingSystems(systems,query,1)[0];if(match){setQuery(match[1]);choose(match);}}}} className="glass-inset min-w-48 rounded-md px-3 py-2 text-xs text-ink"/>
   <datalist id="map-system-search">{query.trim()&&matchingSystems(systems,query,20).map(s=><option key={s[0]} value={s[1]}/>)}</datalist>
   <select aria-label={m.systems} value={space} onChange={e => {stopRotation();setSpace(e.target.value);setSelected(null);setCamera({yaw:0,pitch:.6,zoom:1.4,panX:0,panY:0});}} className="glass-inset rounded-md px-3 py-2 text-xs text-ink"><option value="known">{m.known}</option><option value="wormholes">{m.wormholes}</option><option value="all">{m.all}</option></select>
   <button className={button} onClick={() => {stopRotation();setSelected(null);setCamera({yaw:0,pitch:.6,zoom:1.4,panX:0,panY:0});}}>{m.reset}</button>
   <button className={button} aria-label={m.zoomIn} onClick={() => setCamera(c => ({...c,zoom:Math.min(100,c.zoom*1.4)}))}>+</button>
   <button className={button} aria-label={m.zoomOut} onClick={() => setCamera(c => ({...c,zoom:Math.max(.3,c.zoom/1.4)}))}>−</button>
   <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/>{m.labels}</label>
  </div>
  <div className="grid gap-3">
   <div className="glass-inset relative min-w-0 overflow-hidden rounded-lg">
    <canvas ref={canvas} aria-label={m.canvas} className="h-[65vh] min-h-96 w-full text-ink touch-none cursor-grab"
     onContextMenu={e=>e.preventDefault()}
     onPointerDown={e => {stopRotation();drag.current={x:e.clientX,y:e.clientY,moved:false,pan:e.button===2||e.button===1||e.shiftKey};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e => {const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;setCamera(c => d.pan ? {...c,panX:c.panX+dx,panY:c.panY+dy} : {...c,yaw:c.yaw+dx*.006,pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,c.pitch+dy*.006))});d.x=e.clientX;d.y=e.clientY;}}
     onPointerCancel={() => {drag.current=null;redraw.current();}}
     onPointerUp={e => {if(drag.current && !drag.current.moved && !drag.current.pan){const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const p=hits.current.reduce<{system:MapSystem;x:number;y:number}|null>((best,p) => Math.hypot(p.x-x,p.y-y)<Math.min(12,best?Math.hypot(best.x-x,best.y-y):12)?p:best,null);if(p)choose(p.system);}drag.current=null;redraw.current();}}/>
    {!systems.length && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">{error ? <button onClick={() => {setError(false);setAttempt(a=>a+1);}}>{m.error} · {m.retry}</button> : m.loading}</div>}
   </div>
  </div>
  <div className="flex flex-wrap justify-between gap-3 border-t border-surface-contrast/10 p-3 text-xs text-ink-2"><div className="flex gap-4">{(["high","low","null"] as const).map((key,i) => <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:`var(--series-${["ice","gas","ore"][i]})`}}/>{m[key]}</span>)}</div></div>
 </Panel></div>;
}
