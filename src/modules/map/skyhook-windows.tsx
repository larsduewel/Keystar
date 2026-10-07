"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { MapSystem } from "./model";
import { Panel } from "@/components/ui/glass";
import { SKYHOOK_REFRESH_MS, upcomingSkyhooks, windowState, type SkyhookSnapshot, type SkyhookWindow } from "./skyhooks";
export type SkyhookFilter = "off" | "all" | SkyhookWindow;
export function useSkyhooks(filter: SkyhookFilter) {
 const [snapshot,setSnapshot]=useState<SkyhookSnapshot|null>(null);
 const [failed,setFailed]=useState(false);
 const [now,setNow]=useState(()=>Date.now());
 const [attempt,setAttempt]=useState(0);
 const enabled=filter!=="off";
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let stopped=false;
  const load=async()=>{
   try {
    const response=await fetch("/api/map/skyhooks",{signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw new Error("Unavailable");
    const data=await response.json() as SkyhookSnapshot;
    if(stopped)return;
    setSnapshot(data);setFailed(false);setNow(Date.now());
   } catch {if(!stopped)setFailed(true);}
  };
  void load();
  const poll=setInterval(()=>void load(),SKYHOOK_REFRESH_MS);
  const clock=setInterval(()=>setNow(Date.now()),30_000);
  return ()=>{stopped=true;controller.abort();clearInterval(poll);clearInterval(clock);};
 },[enabled,attempt]);
 const rows=useMemo(()=>filter==="off"?[]:upcomingSkyhooks(snapshot?.skyhooks??[],now,filter),[snapshot,now,filter]);
 const stale=!!snapshot && (now-Date.parse(snapshot.sourceAt)>SKYHOOK_REFRESH_MS*2 || now-Date.parse(snapshot.checkedAt)>SKYHOOK_REFRESH_MS*2);
 return {snapshot,failed,now,rows,stale,retry:()=>setAttempt(a=>a+1)};
}
export function SkyhookWindows({data,systems,onFocus}:{data:ReturnType<typeof useSkyhooks>;systems:MapSystem[];onFocus:(s:MapSystem)=>void}) {
 const {t,f}=useI18n(),m=t.map;
 const names=useMemo(()=>new Map(systems.map(s=>[s[0],s])),[systems]);
 return <Panel className="min-h-0 lg:min-h-48 lg:max-h-80 lg:flex-1" title={m.skyhooks} subtitle={m.skyhookHint} bodyClassName="flex min-h-0 flex-col px-3 pb-3">
  <div role="status" className="mb-2 text-xs text-ink-3">
   {data.failed?<button className="text-warning-text" onClick={data.retry}>{m.skyhookUnavailable} · {m.retry}</button>:!data.snapshot?m.skyhookLoading:null}
   {data.snapshot&&<p>{m.checked}: {f.relativeTime(data.snapshot.checkedAt,undefined,"narrow")}{data.stale&&<span className="block text-warning-text">{m.skyhookStale}</span>}</p>}
  </div>
  <div className="mb-2 flex flex-wrap gap-3 text-xs"><span className="text-good-text">● {m.skyhookActive}</span><span className="text-accent">○ {m.skyhookUpcoming}</span></div>
  <div className="min-h-0 max-h-80 space-y-2 overflow-y-auto overscroll-contain lg:flex-1" aria-label={m.skyhooks}>
   {data.snapshot&&!data.rows.length&&<p className="text-xs text-ink-3">{m.skyhookEmpty}</p>}
   {data.rows.map(row=>{const system=names.get(row.systemId),active=windowState(row,data.now)==="active";return <div key={row.planetId} className="glass-inset rounded-md p-2 text-xs">
    <button disabled={!system} onClick={()=>system&&onFocus(system)} className="text-accent hover:underline disabled:text-ink-3">{system?`${system[1]} · ${f.number(system[2],1)}`:`${m.skyhookUnknownSystem} (${row.systemId})`}</button>
    <p className="mt-1 text-ink">{row.planetName??`${m.skyhookUnknownPlanet} (${row.planetId})`}</p>
    <p className={active?"text-good-text":"text-accent"}>{active?m.skyhookCloses:m.skyhookOpens} {f.relativeTime(active?row.end:row.start,new Date(data.now),"narrow")}</p>
    <p className="text-ink-3">{f.dateTime(row.start)} – {f.dateTime(row.end)}</p>
   </div>;})}
  </div>
 </Panel>;
}
