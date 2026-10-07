import { beforeEach, expect, it, vi } from "vitest";
import type { JobContext } from "../src/core/sync/types";
import { mapSkyhooksJob } from "../src/modules/map/skyhook-job";
import { mapSkyhookSnapshot } from "../src/modules/map/schema";
const feed={skyhooks:[{planet_id:42,solar_system_id:30000001,theft_vulnerability:{start:"2026-10-07T12:00:00Z",end:"2026-10-07T14:00:00Z"}}]};
beforeEach(()=>vi.resetAllMocks());
function context(cached=true){
 let read=0;
 const writes:{table:unknown;values:unknown}[]=[];
 const db={select:()=>({from:()=>({where:async()=>read++===0?[{sourceAt:new Date("2026-10-07T11:59:00Z")}]:cached?[{id:42,category:"planet",name:"Jita IV"}]:[]})}),insert:(table:unknown)=>({values:(values:unknown)=>({onConflictDoUpdate:async()=>{writes.push({table,values});}})})};
 const get=vi.fn().mockResolvedValue({data:feed,lastModified:null,fromCache:false,notModified:false});
 return {ctx:{db,esi:{get}} as unknown as JobContext,writes,get};
}
it("reuses cached planet names and publishes a validated snapshot",async()=>{
 const {ctx,writes,get}=context();await mapSkyhooksJob.run(ctx);
 expect(get).toHaveBeenCalledExactlyOnceWith("/skyhooks/raidable");
 expect(writes).toHaveLength(1);expect(writes[0].table).toBe(mapSkyhookSnapshot);
 expect(writes[0].values).toMatchObject({id:0,skyhooks:[{planetName:"Jita IV"}]});
});
it.each([new Error("offline"),null])("preserves the previous snapshot on feed failure or invalid data: %s",async failure=>{
 const {ctx,writes,get}=context();if(failure)get.mockRejectedValue(failure);else get.mockResolvedValue({data:{}});
 await expect(mapSkyhooksJob.run(ctx)).rejects.toThrow();expect(writes).toHaveLength(0);
});
it("publishes windows with explicitly unknown planets when names cannot be resolved",async()=>{
 const {ctx,writes,get}=context(false);get.mockResolvedValueOnce({data:feed}).mockRejectedValueOnce(new Error("planet offline"));
 await mapSkyhooksJob.run(ctx);expect(writes[0].values).toMatchObject({skyhooks:[{planetName:null}]});
});
it("rejects a planet name returned for a different system",async()=>{
 const {ctx,writes,get}=context(false);get.mockResolvedValueOnce({data:feed}).mockResolvedValueOnce({data:{planet_id:42,system_id:999,name:"Wrong"}});
 await mapSkyhooksJob.run(ctx);expect(writes).toHaveLength(1);expect(writes[0].values).toMatchObject({skyhooks:[{planetName:null}]});
});
it("retains source age when the ESI client serves the previous cached response",async()=>{
 const {ctx,writes,get}=context();get.mockResolvedValue({data:feed,fromCache:true});await mapSkyhooksJob.run(ctx);
 expect(writes[0].values).toMatchObject({sourceAt:new Date("2026-10-07T11:59:00Z")});
});
it("accepts empty successful feeds rather than keeping expired results",async()=>{
 const {ctx,writes,get}=context();get.mockResolvedValue({data:{skyhooks:[]}});await mapSkyhooksJob.run(ctx);expect(writes[0].values).toMatchObject({skyhooks:[]});
});

it("refreshes feed freshness when ESI confirms the unchanged body with 304",async()=>{
 const {ctx,writes,get}=context();get.mockResolvedValue({data:feed,fromCache:false,notModified:true});await mapSkyhooksJob.run(ctx);
 const snapshot=writes[0].values as {sourceAt:Date;checkedAt:Date};expect(snapshot.sourceAt).toEqual(snapshot.checkedAt);
});
