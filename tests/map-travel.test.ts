import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateEvidence } from "../src/modules/map/gate-evidence";
import { distanceLy, gateGraph, jumpRange, routeRisk, shortestRoute, systemsInRange, type JumpRules, type MapGate } from "../src/modules/map/travel";
import type { MapSystem } from "../src/modules/map/model";
import type { ZkillKillmail } from "../src/modules/killboard/zkill";
const now=new Date("2026-10-03T12:00:00Z");
const gates:MapGate[]=[[10,1,2,20,0,0,0],[11,1,3,30,1000000,0,0]];
const kill=(id:number,x:number|undefined,time="2026-10-03T11:30:00Z"):ZkillKillmail=>({killmail_id:id,killmail_time:time,solar_system_id:1,victim:{ship_type_id:587,damage_taken:1,...(x===undefined?{}:{position:{x,y:0,z:0}})},attackers:[],zkb:{hash:"abc"}});
afterEach(()=>vi.useRealTimers());
describe("travel planning",()=>{
 it("finds the fewest-gate route, handles cycles and disconnected systems",()=>{
  const g=new Map([[1,[2,4]],[2,[1,3]],[3,[2,4]],[4,[1,3,5]],[5,[4]]]);
  expect(shortestRoute(g,1,5)).toEqual([1,4,5]);expect(shortestRoute(g,1,1)).toEqual([1]);expect(shortestRoute(g,1,9)).toBeNull();
 });
 it("contains a real Jita–Perimeter gate route",()=>{
  const data=JSON.parse(readFileSync("public/data/map-gates.json","utf8")) as MapGate[];
  expect(shortestRoute(gateGraph(data),30000142,30000144)).toEqual([30000142,30000144]);
 });
 it("classifies gate proximity and ignores old, future or unrelated-system kills",()=>{
  const foreign={...kill(5,0),solar_system_id:2};
  const result=gateEvidence(1,gates,[kill(1,150000),kill(2,150001),kill(3,0,"2026-10-03T09:59:59Z"),kill(4,0,"2026-10-03T13:00:00Z"),foreign],now,true);
  expect(result.kills.map(k=>k.id)).toEqual([1]);expect(result.kills[0].distanceKm).toBe(150);
 });
 it("uses resolved gate location only when position is absent and records unknown locations",()=>{
  const associated=kill(1,undefined);associated.zkb.locationID=10;
  const result=gateEvidence(1,gates,[associated,kill(2,undefined)],now,true);
  expect(result.kills[0].gateId).toBe(10);expect(result.missingPositions).toBe(1);
  const far=kill(3,500000);far.zkb.locationID=10;
  expect(gateEvidence(1,gates,[far],now,true).kills).toHaveLength(0);
 });
 it("does not mark unrelated gates red or incomplete checks green",()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const other=gateEvidence(1,gates,[kill(1,1000000)],now,true);
  expect(routeRisk(other,[1,2])).toBe("green");expect(routeRisk(other,[1,3])).toBe("red");
  expect(routeRisk({...other,complete:false},[1,2])).toBe("unknown");
  expect(routeRisk(gateEvidence(1,gates,[kill(2,undefined)],now,true),[1,2])).toBe("unknown");
  expect(routeRisk(undefined,[1,2])).toBe("unknown");
 });
 it("removes cached kills once they leave the two-hour window",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  expect(routeRisk(gateEvidence(1,gates,[kill(1,0)],now,true),[1,2])).toBe("green");
 });
});
describe("jump ranges",()=>{
 const rules=JSON.parse(readFileSync("public/data/map-jump-rules.json","utf8")) as JumpRules;
 it("uses CCP hull ranges and the skill multiplier",()=>{
  expect(jumpRange(rules,"carrier",5)).toBe(7);expect(jumpRange(rules,"freighter",5)).toBe(10);expect(jumpRange(rules,"blackops",5)).toBe(8);
  expect(jumpRange(rules,"carrier",0)).toBe(3.5);expect(jumpRange(rules,"blackops",4)).toBe(7.2);
 });
 it("computes actual 3D distance and includes the range boundary",()=>{
  const origin:MapSystem=[30000001,"Origin",0,0,0,0],near:MapSystem=[30000002,"Near",0,3,4,0],far:MapSystem=[30000003,"Far",0,3,4,1],wh:MapSystem=[31000001,"WH",-1,0,0,0];
  expect(distanceLy(origin,near)).toBe(5);expect(systemsInRange([origin,near,far,wh],origin,5)).toEqual([near]);expect(systemsInRange([near],wh,10)).toEqual([]);
 });
});
