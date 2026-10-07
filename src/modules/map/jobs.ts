import { and, eq, or } from "drizzle-orm";
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
  // A failed resolver leaves the durable batch available for the worker's normal retry/backoff.
  await db.delete(mapNameQueue).where(or(...pending.map(p=>and(eq(mapNameQueue.id,p.id),eq(mapNameQueue.kind,p.kind)))));
  return {summary:`Resolved ${pending.length} map names`};
 },
};
