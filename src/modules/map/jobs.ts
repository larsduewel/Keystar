import { and, eq, inArray, or } from "drizzle-orm";
import { eveEntities, eveTypes } from "@/core/db";
import { mapNameQueue } from "./schema";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
export const mapNamesJob: JobDefinition = {
 key:"map.names",label:t=>t.map.resolveNames,module:"map",owner:"global",intervalSeconds:15,
 async run({db}){
  const pending=await db.select().from(mapNameQueue).limit(500);
  if(!pending.length)return {summary:"No pending map names"};
  await ensureNames(pending.filter(p=>p.kind==="character").map(p=>p.id));
  await ensureTypes(pending.filter(p=>p.kind==="type").map(p=>p.id));
  const characters=pending.filter(p=>p.kind==="character").map(p=>p.id),types=pending.filter(p=>p.kind==="type").map(p=>p.id);
  const [knownCharacters,knownTypes]=await Promise.all([
   characters.length?db.select({id:eveEntities.id}).from(eveEntities).where(inArray(eveEntities.id,characters)):[],
   types.length?db.select({id:eveTypes.typeId}).from(eveTypes).where(inArray(eveTypes.typeId,types)):[],
  ]);
  const resolvedCharacters=new Set(knownCharacters.map(p=>p.id)),resolvedTypes=new Set(knownTypes.map(p=>p.id));
  const resolved=pending.filter(p=>p.kind==="character"?resolvedCharacters.has(p.id):resolvedTypes.has(p.id));
  if(resolved.length)await db.delete(mapNameQueue).where(or(...resolved.map(p=>and(eq(mapNameQueue.id,p.id),eq(mapNameQueue.kind,p.kind)))));
  // ensureTypes is best effort: unconfirmed rows must survive for normal worker backoff/retry.
  if(resolved.length<pending.length)throw new Error("Map names remain unresolved");
  return {summary:`Resolved ${resolved.length} map names`};
 },
};
