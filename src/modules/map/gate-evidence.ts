import type { ZkillKillmail } from "@/modules/killboard/zkill";
import type { GateCheck, MapGate } from "./travel";
export const GATE_RADIUS_METRES = 150_000;
export function gateEvidence(systemId: number, gates: MapGate[], killmails: ZkillKillmail[], now: Date, complete: boolean): GateCheck {
 const result: GateCheck={systemId,checkedAt:now.toISOString(),complete,missingPositions:0,kills:[]};
 const local=gates.filter(g=>g[1]===systemId), since=now.getTime()-2*3600_000;
 if(!local.length)result.complete=false;
 for(const km of killmails) {
  const time=Date.parse(km.killmail_time);
  if(km.solar_system_id!==systemId || !Number.isFinite(time) || time<since || time>now.getTime())continue;
  const p=km.victim.position;
  const validPosition=p && [p.x,p.y,p.z].every(Number.isFinite);
  const located=local.find(g=>g[0]===km.zkb.locationID);
  let nearest=located, distance: number | null=null;
  if(validPosition) {
   let closest=Infinity;
   for(const g of local) { const d=Math.hypot(p.x-g[4],p.y-g[5],p.z-g[6]);if(d<closest){closest=d;nearest=g;} }
   distance=closest;
   if(closest>GATE_RADIUS_METRES)continue;
  } else if(!located) {result.missingPositions++;continue;}
  if(nearest)result.kills.push({id:km.killmail_id,time:km.killmail_time,gateId:nearest[0],destinationId:nearest[2],distanceKm:distance===null?null:distance/1000,shipTypeId:km.victim.ship_type_id,attackers:km.attackers.filter(a=>a.character_id).map(a=>({characterId:a.character_id!,shipTypeId:a.ship_type_id??null}))});
 }
 result.kills.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));return result;
}
