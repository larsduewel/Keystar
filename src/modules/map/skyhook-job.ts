import { eq, inArray } from "drizzle-orm";
import { eveEntities } from "@/core/db";
import type { JobDefinition } from "@/core/sync/types";
import { mapSkyhookSnapshot } from "./schema";
import { parseSkyhooks } from "./skyhooks";
export const mapSkyhooksJob: JobDefinition = {
 key:"map.skyhooks", label:t=>t.map.skyhookSync, module:"map", owner:"global", intervalSeconds:300,
 async run({db,esi}) {
  const response=await esi.get<unknown>("/skyhooks/raidable");
  const rows=parseSkyhooks(response.data);
  const checkedAt=new Date();
  // A network response (including 304) confirms freshness; a local cache hit does not.
  const [previous]=await db.select().from(mapSkyhookSnapshot).where(eq(mapSkyhookSnapshot.id,0));
  const sourceAt=response.fromCache && previous ? previous.sourceAt : checkedAt;
  const cached=rows.length ? await db.select().from(eveEntities).where(inArray(eveEntities.id,rows.map(r=>r.planetId))) : [];
  const names=new Map(cached.filter(r=>r.category==="planet").map(r=>[r.id,r.name]));
  // Sequential lookups respect the shared ESI limiter and avoid a burst on a cold cache.
  for(const row of rows) {
   row.planetName=names.get(row.planetId) ?? null;
   if(row.planetName)continue;
   try {
    const {data}=await esi.get<{planet_id:number;system_id:number;name:string}>(`/universe/planets/${row.planetId}`);
    if(data.planet_id!==row.planetId || data.system_id!==row.systemId || !data.name)continue;
    await db.insert(eveEntities).values({id:row.planetId,category:"planet",name:data.name,updatedAt:checkedAt}).onConflictDoUpdate({target:eveEntities.id,set:{category:"planet",name:data.name,updatedAt:checkedAt}});
    row.planetName=data.name;
   } catch { /* The window is still useful; explicitly unknown names retry next refresh. */ }
  }
  await db.insert(mapSkyhookSnapshot).values({id:0,skyhooks:rows,checkedAt,sourceAt}).onConflictDoUpdate({target:mapSkyhookSnapshot.id,set:{skyhooks:rows,checkedAt,sourceAt}});
  return {summary:`Cached ${rows.length} public Skyhook windows`};
 },
};
