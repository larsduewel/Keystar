import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, eveTypes, eveEntities } from "@/core/db";
import { mapNameQueue } from "./schema";
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
 const saved=cache.get(systemId);if(saved && saved.expires>Date.now())return saved.value.then(withNames);
 const value=(async()=>{
  const rows: ZkillKillmail[]=[];let complete=false;
  for(let page=1;page<=5;page++) {
   const batch=await getZkill().get(`/api/solarSystemID/${systemId}/pastSeconds/7200/page/${page}/`);
   rows.push(...batch);
   if(batch.length<200){complete=true;break;}
  }
  const result=gateEvidence(systemId,gates,rows,new Date(),complete);
  return result;
 })();
 cache.set(systemId,{expires:Date.now()+3600_000,value});
 void value.catch(()=>cache.delete(systemId));return value.then(withNames);
}

/** Names are read afresh from the shared cache, never resolved against ESI on the request path. */
async function withNames(evidence:GateCheck):Promise<GateCheck>{
 const result={...evidence};
  const ids=[...new Set(result.kills.flatMap(k=>(k.attackers??[]).flatMap(a=>a.shipTypeId?[a.shipTypeId]:[])))];
  if(ids.length){const types=await getDb().select({id:eveTypes.typeId,name:eveTypes.name}).from(eveTypes).where(inArray(eveTypes.typeId,ids));result.shipNames=Object.fromEntries(types.map(t=>[t.id,t.name]));}
  const characterIds=[...new Set(result.kills.flatMap(k=>(k.attackers??[]).map(a=>a.characterId)))];
  if(characterIds.length){
   const characters=await getDb().select({id:eveEntities.id,name:eveEntities.name}).from(eveEntities).where(inArray(eveEntities.id,characterIds));
   result.characterNames=Object.fromEntries(characters.map(c=>[c.id,c.name]));
  }
 const missing=[...ids.filter(id=>!result.shipNames?.[id]).map(id=>({id,kind:"type" as const})),...characterIds.filter(id=>!result.characterNames?.[id]).map(id=>({id,kind:"character" as const}))];
 if(missing.length)await getDb().insert(mapNameQueue).values(missing).onConflictDoNothing();
 return result;
}
