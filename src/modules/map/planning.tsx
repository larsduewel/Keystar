"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/glass";
import type { MapSystem } from "./model";
import { matchingSystems } from "./search";
import { distanceLy, gateGraph, jumpRange, routeGateKills, routeRisk, shortestRoute, systemsInRange, type GateCheck, type JumpRules, type JumpShip, type MapGate, type MapOverlay } from "./travel";

function SystemSearch({label,systems,value,onPick}:{label:string;systems:MapSystem[];value:MapSystem|null;onPick:(s:MapSystem|null)=>void}) {
 const { f }=useI18n();
 const [text,setText]=useState("");const [open,setOpen]=useState(false);
 const matches=useMemo(()=>matchingSystems(systems,text,8),[systems,text]);
 return <div className="relative min-w-0"><label className="mb-1 block text-xs text-ink-3">{label}</label>
 <input aria-label={label} value={open?text:value?.[1]??text} autoComplete="off" onFocus={()=>{setText(value?.[1]??text);setOpen(true);}} onBlur={()=>setOpen(false)} onChange={e=>{setText(e.target.value);onPick(null);setOpen(true);}} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);if(e.key==="Enter"){e.preventDefault();const exact=matches[0];if(exact){onPick(exact);setText(exact[1]);setOpen(false);}}}} className="glass-inset w-full rounded-md px-3 py-2 text-xs text-ink"/>
 {open && matches.length>0 && <div className="glass absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto p-1">{matches.map(s=><button key={s[0]} onMouseDown={e=>e.preventDefault()} onClick={()=>{onPick(s);setText(s[1]);setOpen(false);}} className="flex w-full justify-between rounded px-2 py-2 text-left text-xs text-ink-2 hover:bg-surface-contrast/5"><span>{s[1]}</span><span>{f.number(s[2],1)}</span></button>)}</div>}
 </div>;
}

export function MapPlanning({initialOriginId=null,systems,selected,onFocus,onOverlay}:{initialOriginId?:number|null;systems:MapSystem[];selected:MapSystem|null;onFocus:(s:MapSystem)=>void;onOverlay:(o:MapOverlay)=>void}) {
 const {t,f}=useI18n();const m=t.map;
 const [gates,setGates]=useState<MapGate[]>([]),[rules,setRules]=useState<JumpRules|null>(null);
 const [dataError,setDataError]=useState(false),[attempt,setAttempt]=useState(0);
 const [start,setStart]=useState<MapSystem|null>(null),[end,setEnd]=useState<MapSystem|null>(null);
 const [route,setRoute]=useState<number[]>([]),[routeError,setRouteError]=useState(false);
 const [checks,setChecks]=useState<Record<number,GateCheck>>({}),[failed,setFailed]=useState<number[]>([]),[checking,setChecking]=useState(false),[checkVersion,setCheckVersion]=useState(0);
 const [origin,setOrigin]=useState<MapSystem|null>(null),[ship,setShip]=useState<JumpShip>("carrier"),[level,setLevel]=useState(5),[showRange,setShowRange]=useState(!!initialOriginId);
 const byId=useMemo(()=>new Map(systems.map(s=>[s[0],s])),[systems]);
 const graph=useMemo(()=>gateGraph(gates),[gates]);
 const range=rules?jumpRange(rules,ship,level):0;
 const source=origin??systems.find(s=>s[0]===initialOriginId)??selected;
 const rangeSystems=useMemo(()=>showRange&&source?systemsInRange(systems,source,range):[],[showRange,source,systems,range]);
 const restricted=(s:MapSystem)=>s[2]>=.45 || (rules?.restricted.includes(s[0])??false);
 const originBlocked=source&&(source[0]>=31000000 || (rules?.restricted.includes(source[0])??false));
 useEffect(()=>{
  const controller=new AbortController();
  Promise.all([fetch("/data/map-gates.json",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}),fetch("/data/map-jump-rules.json",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();})]).then(([g,j])=>{setGates(g);setRules(j);setDataError(false);}).catch(e=>{if(e.name!=="AbortError")setDataError(true);});
  return ()=>controller.abort();
 },[attempt]);
 useEffect(()=>{
  onOverlay({route,risks:Object.fromEntries(route.map(id=>[id,routeRisk(checks[id],route)])),inRange:originBlocked?[]:rangeSystems.map(s=>s[0]),range:showRange&&source&&!originBlocked?range:null,originId:showRange?source?.[0]??null:null});
 },[route,checks,rangeSystems,range,showRange,source,originBlocked,onOverlay]);
 useEffect(()=>{
  if(!route.length)return;
  const controller=new AbortController();let next=0;
  async function worker(){while(next<route.length && !controller.signal.aborted){const id=route[next++];try{
   const response=await fetch(`/api/map/gate-check?systemId=${id}`,{signal:controller.signal});if(!response.ok)throw Error();
   const result:GateCheck=await response.json();if(!controller.signal.aborted)setChecks(c=>({...c,[id]:result}));
  }catch{if(!controller.signal.aborted)setFailed(c=>[...c,id]);}}}
  void Promise.all([worker(),worker()]).then(()=>{if(!controller.signal.aborted)setChecking(false);});
  return ()=>controller.abort();
 },[route,checkVersion]);
 const button="glass-chip rounded-md px-3 py-2 text-xs text-ink-2 hover:text-ink disabled:opacity-40";
 return <div className="grid min-w-0 gap-3">
 <Panel className="relative z-20" title={m.travel} subtitle={m.routeHint} bodyClassName="px-3 pb-3">
  <div className="grid grid-cols-2 gap-2"><SystemSearch label={m.start} systems={systems} value={start} onPick={setStart}/><SystemSearch label={m.end} systems={systems} value={end} onPick={setEnd}/></div>
  <div className="my-3 flex flex-wrap items-center gap-2"><button className={button} disabled={!start||!end||!gates.length} onClick={()=>{if(!start||!end)return;const path=shortestRoute(graph,start[0],end[0]);setRouteError(!path);setChecking(!!path);setChecks({});setFailed([]);setRoute(path??[]);if(path)onFocus(start);}}>{m.plan}</button>{route.length>0 && <><span className="text-xs text-ink-2">{route.length-1} {m.jumps}</span><button className={button} disabled={checking} onClick={()=>{setChecking(true);setChecks({});setFailed([]);setCheckVersion(v=>v+1);}}>{m.refreshCheck}</button></>}</div>
  {dataError && <button className="text-xs text-warning" onClick={()=>setAttempt(v=>v+1)}>{m.dataError} · {m.retryData}</button>}
  {routeError && <p className="text-xs text-warning">{m.noRoute}</p>}
  {checking && <p role="status" className="mb-2 text-xs text-ink-3">{m.checking} {Object.keys(checks).length+failed.length}/{route.length}</p>}
  {route.length>0 && <ol className="glass-inset max-h-64 space-y-1 overflow-y-auto rounded-lg p-2">{route.map((id,index)=>{
   const check=checks[id],risk=routeRisk(check,route),kills=check?routeGateKills(check,route):[];
   return <li key={id} className={`rounded-md p-2 text-xs ${risk==="red"?"bg-critical/10":risk==="green"?"bg-good/10":"bg-surface-contrast/5"}`}>
    <div className="flex flex-wrap justify-between gap-2"><button onClick={()=>{const s=byId.get(id);if(s)onFocus(s);}} className="font-medium text-ink">{index+1}. {byId.get(id)?.[1]??id}</button><span className={risk==="red"?"text-critical-text":risk==="green"?"text-good-text":"text-ink-3"}>{risk==="red"?m.nearGate:risk==="green"?m.clear:failed.includes(id)?m.checkFailed:check?m.unknown:m.notChecked}</span></div>
    {check && <p className="mt-1 text-2xs text-ink-3">{m.checked}: {f.relativeTime(check.checkedAt)}</p>}
    {kills.map(k=><a key={k.id} href={`https://zkillboard.com/kill/${k.id}/`} target="_blank" rel="noreferrer" className="mt-1 block text-accent hover:underline">{m.killmail} {k.id} · {f.relativeTime(k.time)} · {m.gateTo} {byId.get(k.destinationId)?.[1]??k.destinationId} · {k.distanceKm===null?m.resolvedGate:`${f.number(k.distanceKm,1)} km`}</a>)}
   </li>;
  })}</ol>}
  <p className="mt-3 text-2xs text-ink-3">{m.evidenceHint}</p>
 </Panel>
 <Panel title={m.jumpTitle} subtitle={m.rangeHint} bodyClassName="px-3 pb-3">
  <div className="grid grid-cols-2 gap-2"><SystemSearch label={m.origin} systems={systems} value={source} onPick={s=>{setOrigin(s);if(s)onFocus(s);}}/>
   <label className="text-xs text-ink-3">{m.ship}<select aria-label={m.ship} value={ship} onChange={e=>setShip(e.target.value as JumpShip)} className="glass-inset mt-1 w-full rounded-md px-3 py-2 text-xs text-ink">{(["carrier","freighter","blackops"] as const).map(k=><option key={k} value={k}>{m[k]}</option>)}</select></label>
   <label className="text-xs text-ink-3">{m.calibration}<select aria-label={m.calibration} value={level} onChange={e=>setLevel(Number(e.target.value))} className="glass-inset mt-1 w-full rounded-md px-3 py-2 text-xs text-ink">{[0,1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <div className="glass-inset flex items-center justify-between rounded-md px-3"><span className="text-xs text-ink-3">{m.range}</span><strong className="text-sm text-accent">{f.number(range,1)} {m.lightYears}</strong></div>
  </div>
  <button className={`${button} my-3`} disabled={!rules||!source||!!originBlocked} onClick={()=>{if(source)onFocus(source);setShowRange(v=>!v);}}>{showRange?m.hideRange:m.showRange}</button>
  {originBlocked && <p className="text-xs text-warning">{m.originRestricted}</p>}
  {showRange&&!originBlocked && <><h3 className="eve-label mb-2 text-2xs text-ink-3">{m.inRange} · {rangeSystems.length}</h3><div className="glass-inset flex max-h-60 flex-wrap gap-1 overflow-y-auto rounded-lg p-2">{rangeSystems.length===0&&<p className="text-xs text-ink-3">{m.noneInRange}</p>}{rangeSystems.map(s=><button key={s[0]} title={`${s[1]} · ${f.number(distanceLy(source!,s),2)} ${m.lightYears} · ${m.security}: ${f.number(s[2],1)}${restricted(s)?` · ${m.restricted}`:""}`} onClick={()=>onFocus(s)} className={`glass-chip rounded px-2 py-1 text-xs ${restricted(s)?"text-warning":"text-accent"}`}>{s[1]} <span className="text-ink-3">{f.number(distanceLy(source!,s),1)}</span>{restricted(s)&&" *"}</button>)}</div></>}
 </Panel>
 </div>;
}
