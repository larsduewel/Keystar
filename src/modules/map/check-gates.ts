import "server-only";
import gateData from "../../../public/data/map-gates.json";
import { getZkill } from "@/modules/killboard/sync";
import { gateEvidence } from "./gate-evidence";
import type { GateCheck, MapGate } from "./travel";
import type { ZkillKillmail } from "@/modules/killboard/zkill";
const gates = gateData as MapGate[];
const known = new Set(gates.map(g=>g[1]));
const cache = new Map<number,{expires:number;value:Promise<GateCheck>}>();
export const hasGates = (systemId: number) => known.has(systemId);
/** Deduplicate checks and respect zKillboard's one-hour API cache. */
export function checkGates(systemId: number): Promise<GateCheck> {
 const saved=cache.get(systemId);if(saved && saved.expires>Date.now())return saved.value;
 const value=(async()=>{
  const rows: ZkillKillmail[]=[];let complete=false;
  for(let page=1;page<=5;page++) {
   const batch=await getZkill().get(`/api/solarSystemID/${systemId}/pastSeconds/7200/page/${page}/`);
   rows.push(...batch);
   if(batch.length<200){complete=true;break;}
  }
  return gateEvidence(systemId,gates,rows,new Date(),complete);
 })();
 cache.set(systemId,{expires:Date.now()+3600_000,value});
 void value.catch(()=>cache.delete(systemId));return value;
}
