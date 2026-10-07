"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { systemSpace, type MapSystem, type MapRegion } from "./model";
import { matchingSystems } from "./search";
import { createMapRenderer } from "./renderer";
import { MapPlanning } from "./planning";
import { SkyhookWindows, useSkyhooks, type SkyhookFilter } from "./skyhook-windows";
import { skyhookSystems } from "./skyhooks";
import { EMPTY_OVERLAY } from "./travel";
import { Panel } from "@/components/ui/glass";

export function UniverseMap({initialSystemId=null}:{initialSystemId?:number|null}) {
 const { t, f } = useI18n(); const m = t.map;
 const [view,setView]=useState<"2d"|"3d">("3d");
 const viewRef=useRef(view);
 const [skyhookFilter,setSkyhookFilter]=useState<SkyhookFilter>("off");
 const skyhooks=useSkyhooks(skyhookFilter);
 const skyhookHighlights=useMemo(()=>skyhookSystems(skyhooks.rows,skyhooks.now),[skyhooks.rows,skyhooks.now]);
 const skyhookRef=useRef(skyhookHighlights);
 const [systems, setSystems] = useState<MapSystem[]>([]);
 const [regions,setRegions] = useState<MapRegion[]>([]);
 const [regionId,setRegionId] = useState<number|null>(null);
 const [regionLabels,setRegionLabels] = useState(true);
 const regionNames = useMemo(()=>new Map(regions),[regions]);
 const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
 const [query, setQuery] = useState(""); const [space, setSpace] = useState("known");
 const [selected, setSelected] = useState<MapSystem | null>(null); const [labels, setLabels] = useState(true);
 const [hovered,setHovered] = useState<{system:MapSystem;x:number;y:number}|null>(null);
 const hoveredSkyhooks=useMemo(()=>skyhooks.rows.filter(row=>row.systemId===hovered?.system[0]),[skyhooks.rows,hovered]);
 const camera = useRef({ yaw: 0, pitch: .6, zoom: 1.4, panX: 0, panY: 0 });
 const redraw = useRef<() => void>(() => {});
 const rotationFrame = useRef(0);
 const stopRotation = () => { cancelAnimationFrame(rotationFrame.current); rotationFrame.current = 0; };
 const setCamera = (update: typeof camera.current | ((c: typeof camera.current) => typeof camera.current)) => {
  camera.current = typeof update === "function" ? update(camera.current) : update;
  redraw.current();
 };
 const [focusRoute,setFocusRoute] = useState<number[]>([]);
 const [overlay, setOverlay] = useState(EMPTY_OVERLAY);
 const overlayRef = useRef(EMPTY_OVERLAY);
 useEffect(() => { overlayRef.current = overlay; redraw.current(); }, [overlay]);
 useEffect(()=>{viewRef.current=view;redraw.current();},[view]);
 useEffect(()=>{skyhookRef.current=skyhookHighlights;redraw.current();},[skyhookHighlights]);
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
  Promise.all(["map-systems","map-regions"].map(name=>fetch(`/data/${name}.json`, { signal: controller.signal }).then(r=>{if(!r.ok)throw new Error();return r.json();}))).then(data => {const [rows,regionRows]=data as [MapSystem[],MapRegion[]];setRegions(regionRows);setSystems(rows);const target=rows.find(s=>s[0]===initialSystemId);if(target){setRegionId(target[6]??null);setSelected(target);setSpace(systemSpace(target[0]));camera.current={yaw:0,pitch:.6,zoom:5,panX:0,panY:0};}}).catch(e => { if (e.name !== "AbortError") setError(true); });
  return () => controller.abort();
 }, [attempt, initialSystemId]);
 const visible = useMemo(() => systems.filter(s => space === "all" || (space === "wormholes" ? s[0] >= 31000000 && s[0] < 32000000 : s[0] < 31000000)), [systems, space]);
 const regionCount = useMemo(()=>visible.filter(s=>s[6]===regionId).length,[visible,regionId]);
 const visibleRegionIds = useMemo(()=>new Set(visible.map(s=>s[6])),[visible]);
 useEffect(() => {
  const el = canvas.current; if (!el || !visible.length) return;
  const renderer = createMapRenderer(el, visible, {
   view:()=>viewRef.current, overlay: () => overlayRef.current, camera: () => camera.current, dragging: () => !!drag.current?.moved,
   skyhooks:()=>skyhookRef.current, focusRoute, selected: selected?.[0] ?? null, query, labels, regions, regionId, regionLabels, distanceUnit: m.lightYears, format: value => f.number(value, 1),
   onHits: points => { hits.current = points; },
  });
  redraw.current = renderer.schedule;
  renderer.schedule();
  return () => { renderer.destroy(); redraw.current = () => {}; };
 }, [visible, focusRoute, selected, query, labels, regions, regionId, regionLabels, f, m.lightYears]);
 useEffect(() => {
  if ((!selected && !focusRoute.length) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now(), yaw = camera.current.yaw;
  const rotate = (now: number) => {
   const elapsed = focusRoute.length ? (now-start)/1000 : Math.min((now - start) / 1000, 4);
   camera.current.yaw = yaw + (focusRoute.length ? elapsed*.035 : .3 * (1 - Math.exp(-elapsed)));
   redraw.current();
   if (focusRoute.length || elapsed < 4) rotationFrame.current = requestAnimationFrame(rotate);
   else rotationFrame.current = 0;
  };
  rotationFrame.current = requestAnimationFrame(rotate);
  return () => { cancelAnimationFrame(rotationFrame.current); rotationFrame.current = 0; };
 }, [selected,focusRoute]);
 const button = "glass-chip rounded-md px-3 py-1.5 text-xs text-ink-2 hover:text-ink transition-colors";
 const choose = (s: MapSystem) => { stopRotation(); setFocusRoute([]); setSpace(systemSpace(s[0])); setSelected(s); setRegionId(s[6]??null); setCamera(c => ({...c,zoom:Math.max(c.zoom,5),panX:0,panY:0})); };
 return <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(19.5rem,23.5rem)_minmax(0,1fr)]"><div className="relative min-w-0"><MapPlanning initialOriginId={initialSystemId} systems={systems} selected={selected} onFocus={choose} onRoute={path=>{stopRotation();setFocusRoute([...path]);setSelected(null);setRegionId(null);setQuery("");setSpace("known");setCamera({yaw:0,pitch:.6,zoom:1,panX:0,panY:0});}} onOverlay={setOverlay} skyhookPanel={skyhookFilter!=="off"?<SkyhookWindows data={skyhooks} systems={systems} onFocus={choose}/>:null}/></div><Panel title={m.universe} subtitle={view==="2d"?m.controls2d:m.controls} actions={<div className="flex flex-wrap items-center justify-end gap-3"><span className="text-xs font-semibold tabular-nums text-ink-2">{f.integer(visible.length)} {m.systems}</span><div role="group" aria-label={m.viewMode} className="glass-inset flex rounded-md p-0.5">{(["2d","3d"] as const).map(mode=><button key={mode} type="button" aria-pressed={view===mode} onClick={()=>setView(mode)} className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${view===mode?"bg-accent/15 text-accent":"text-ink-3 hover:text-ink"}`}>{mode==="2d"?m.view2d:m.view3d}</button>)}</div></div>} bodyClassName="px-3 pb-3">
  <div className="mb-3 flex flex-wrap items-center gap-2">
   <input aria-label={m.search} placeholder={m.search} value={query} list="map-system-search" onChange={e => {setQuery(e.target.value);const match=systems.find(s=>s[1].toLowerCase()===e.target.value.trim().toLowerCase());if(match)choose(match);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const match=matchingSystems(systems,query,1)[0];if(match){setQuery(match[1]);choose(match);}}}} className="glass-inset min-w-48 rounded-md px-3 py-2 text-xs text-ink"/>
   <datalist id="map-system-search">{query.trim()&&matchingSystems(systems,query,20).map(s=><option key={s[0]} value={s[1]}/>)}</datalist>
   <select aria-label={m.systems} value={space} onChange={e => {stopRotation();setFocusRoute([]);setQuery("");setSpace(e.target.value);setSelected(null);setRegionId(null);setCamera({yaw:0,pitch:.6,zoom:1.4,panX:0,panY:0});}} className="glass-inset rounded-md px-3 py-2 text-xs text-ink"><option value="known">{m.known}</option><option value="wormholes">{m.wormholes}</option><option value="all">{m.all}</option></select>
   <select aria-label={m.region} value={regionId??""} onChange={e=>{stopRotation();setFocusRoute([]);setQuery("");setRegionId(e.target.value?Number(e.target.value):null);setSelected(null);setCamera({yaw:0,pitch:.6,zoom:e.target.value?1:1.4,panX:0,panY:0});}} className="glass-inset max-w-full rounded-md px-3 py-2 text-xs text-ink"><option value="">{m.allRegions}</option>{regions.filter(r=>visibleRegionIds.has(r[0])).map(r=><option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>
   <select aria-label={m.mapFilters} value={skyhookFilter} onChange={e=>setSkyhookFilter(e.target.value as SkyhookFilter)} className="glass-inset rounded-md px-3 py-2 text-xs text-ink"><option value="off">{m.skyhookOff}</option><option value="all">{m.skyhookAll}</option><option value="active">{m.skyhookActive}</option><option value="upcoming">{m.skyhookUpcoming}</option></select>
   <button className={button} onClick={() => {stopRotation();setFocusRoute([]);setQuery("");setSelected(null);setRegionId(null);setCamera({yaw:0,pitch:.6,zoom:1.4,panX:0,panY:0});}}>{m.reset}</button>
   <button className={button} aria-label={m.zoomIn} onClick={() => {stopRotation();setCamera(c => ({...c,zoom:Math.min(100,c.zoom*1.4)}));}}>+</button>
   <button className={button} aria-label={m.zoomOut} onClick={() => {stopRotation();setCamera(c => ({...c,zoom:Math.max(.3,c.zoom/1.4)}));}}>−</button>
   <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={regionLabels} onChange={e=>setRegionLabels(e.target.checked)}/>{m.regionLabels}</label>
   <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/>{m.labels}</label>
  </div>
  {selected && <p className="mb-3 flex flex-wrap gap-x-3 text-xs text-ink-2"><strong className="text-ink">{selected[1]}</strong><span>{m.region}: {regionNames.get(selected[6]??-1)??m.unknownRegion}</span><span>{m.security}: {f.number(selected[2],1)}</span></p>}
  {!selected && regionId && <p className="mb-3 text-xs text-ink-2">{regionNames.get(regionId)??m.unknownRegion} · {f.integer(regionCount)} {m.systems}</p>}
  <div className="grid gap-3">
   <div className="glass-inset relative min-w-0 overflow-hidden rounded-lg">
    <canvas ref={canvas} aria-label={view==="2d"?m.canvas2d:m.canvas} className="h-[65vh] min-h-96 w-full text-ink touch-none cursor-grab"
     onContextMenu={e=>e.preventDefault()}
     onPointerLeave={()=>setHovered(null)}
     onPointerDown={e => {setHovered(null);stopRotation();drag.current={x:e.clientX,y:e.clientY,moved:false,pan:view==="2d"?e.button!==2||e.shiftKey:e.button===2||e.button===1||e.shiftKey};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e => {const d=drag.current;if(!d){const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const hit=hits.current.reduce<{system:MapSystem;x:number;y:number}|null>((best,p)=>Math.hypot(p.x-x,p.y-y)<Math.min(10,best?Math.hypot(best.x-x,best.y-y):10)?p:best,null);setHovered(prev=>prev?.system[0]===hit?.system[0]?prev:hit?{system:hit.system,x:Math.max(4,Math.min(hit.x+12,rect.width-200)),y:Math.max(4,Math.min(hit.y+12,rect.height-90))}:null);return;}const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;setCamera(c => d.pan ? {...c,panX:c.panX+dx,panY:c.panY+dy} : {...c,yaw:c.yaw+dx*.006,pitch:view==="2d"?c.pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,c.pitch+dy*.006))});d.x=e.clientX;d.y=e.clientY;}}
     onPointerCancel={() => {drag.current=null;redraw.current();}}
     onPointerUp={e => {if(drag.current && !drag.current.moved && e.button===0 && !e.shiftKey){const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const p=hits.current.reduce<{system:MapSystem;x:number;y:number}|null>((best,p) => Math.hypot(p.x-x,p.y-y)<Math.min(12,best?Math.hypot(best.x-x,best.y-y):12)?p:best,null);if(p)choose(p.system);}drag.current=null;redraw.current();}}/>
    {hovered && <div className="pointer-events-none absolute z-10 rounded-lg border border-surface-contrast/10 bg-space-900 px-3 py-2 text-xs shadow-xl" style={{left:hovered.x,top:hovered.y}}><strong className="block text-ink">{hovered.system[1]}</strong><span className="block text-ink-2">{regionNames.get(hovered.system[6]??-1)??m.unknownRegion}</span><span className="text-ink-3">{m.security}: {f.number(hovered.system[2],1)}</span>{hoveredSkyhooks.length>0&&<div className="mt-2 border-t border-surface-contrast/10 pt-2"><strong className="block text-ink">{m.skyhooks} · {f.integer(hoveredSkyhooks.length)}</strong>{hoveredSkyhooks.slice(0,3).map(row=><span key={row.planetId} className="block text-ink-2">{row.planetName??`${m.skyhookUnknownPlanet} (${row.planetId})`} · {Date.parse(row.start)<=skyhooks.now?m.skyhookCloses:m.skyhookOpens} {f.relativeTime(Date.parse(row.start)<=skyhooks.now?row.end:row.start,new Date(skyhooks.now),"narrow")}</span>)}</div>}</div>}
    {!systems.length && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">{error ? <button onClick={() => {setError(false);setAttempt(a=>a+1);}}>{m.error} · {m.retry}</button> : m.loading}</div>}
   </div>
  </div>
  <div className="flex flex-wrap justify-between gap-3 border-t border-surface-contrast/10 p-3 text-xs text-ink-2"><div className="flex gap-4">{(["high","low","null"] as const).map((key,i) => <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:`var(--series-${["ice","gas","ore"][i]})`}}/>{m[key]}</span>)}</div></div>
 </Panel></div>;
}
