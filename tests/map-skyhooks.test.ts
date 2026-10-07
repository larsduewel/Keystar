import { describe, expect, it } from "vitest";
import { parseSkyhooks, upcomingSkyhooks, skyhookSystems, windowState, type Skyhook } from "../src/modules/map/skyhooks";
const now=Date.parse("2026-10-07T12:00:00Z");
const row=(id=1,start=now,end=now+7200000):Skyhook=>({planetId:id,systemId:30000001,planetName:null,start:new Date(start).toISOString(),end:new Date(end).toISOString()});
describe("public Skyhook windows",()=>{
 it("opens inclusively and closes exclusively, removing expired windows",()=>{
  expect(windowState(row(),now-1)).toBe("upcoming");expect(windowState(row(),now)).toBe("active");expect(windowState(row(),now+7200000)).toBeNull();
 });
 it("sorts active windows before upcoming windows and filters without mutating input",()=>{
  const rows=[row(3,now+2000),row(1,now-7200000,now),row(2,now-1000),row(4,now+1000)];
  expect(upcomingSkyhooks(rows,now).map(r=>r.planetId)).toEqual([2,4,3]);
  expect(upcomingSkyhooks(rows,now,"active").map(r=>r.planetId)).toEqual([2]);expect(rows[0].planetId).toBe(3);
 });
 it("prioritizes an active window when several planets share a system",()=>{
  expect(skyhookSystems([row(1,now+1),row(2),row(3,now+2)],now).get(30000001)).toBe("active");
 });
 it("accepts an empty feed and deduplicates planets without inventing names",()=>{
  expect(parseSkyhooks({skyhooks:[]})).toEqual([]);
  const entry={planet_id:42,solar_system_id:30000001,theft_vulnerability:{start:row().start,end:row().end}};
  expect(parseSkyhooks({skyhooks:[entry,entry]})).toEqual([{...row(42)}]);
 });
 it.each([null,{}, {skyhooks:[null]}, {skyhooks:[{planet_id:1,solar_system_id:2,theft_vulnerability:{start:"invalid",end:"invalid"}}]}, {skyhooks:[{planet_id:-1,solar_system_id:2,theft_vulnerability:{start:row().start,end:row().end}}]}, {skyhooks:[{planet_id:1,solar_system_id:2,theft_vulnerability:{start:row().end,end:row().start}}]}])("rejects malformed feeds rather than erasing a successful snapshot: %j",input=>{
  expect(()=>parseSkyhooks(input)).toThrow();
 });
});
