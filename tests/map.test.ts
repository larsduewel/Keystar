import { mapSystemHref, parseMapSystem } from "../src/modules/map/links";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { project, securityClass } from "../src/modules/map/model";
describe("universe map", () => {
 it("supports validated system deep links", () => {
  expect(mapSystemHref(30000142)).toBe("/map?system=30000142");
  expect(parseMapSystem("30000142")).toBe(30000142);
  expect(parseMapSystem("bad")).toBeNull();expect(parseMapSystem(["30000142"])).toBeNull();expect(parseMapSystem("12")).toBeNull();
 });
 it("ships a complete, unique and finite universe dataset", () => {
  const rows = JSON.parse(readFileSync("public/data/map-systems.json", "utf8")) as [number,string,number,number,number,number][];
  expect(rows.length).toBeGreaterThan(8000);
  expect(new Set(rows.map(r => r[0])).size).toBe(rows.length);
  expect(rows.every(r => r[1].length > 0 && r.slice(2).every(Number.isFinite))).toBe(true);
  expect(rows.some(r => r[0] >= 31000000)).toBe(true);
  expect(rows.find(r => r[1] === "Jita")?.[0]).toBe(30000142);
 });
 it("maps every system to an official region and locates Jita in The Forge", () => {
  const rows=JSON.parse(readFileSync("public/data/map-systems.json","utf8")) as import("../src/modules/map/model").MapSystem[];
  const regions=new Map<number,string>(JSON.parse(readFileSync("public/data/map-regions.json","utf8")));
  expect(rows.every(s=>s[6]!==undefined&&regions.has(s[6]))).toBe(true);
  const jita=rows.find(s=>s[0]===30000142)!;
  expect(regions.get(jita[6]!)).toBe("The Forge");
 });
 it("preserves spatial distance through rotations", () => { const p = project(3, 4, 12, 1.2, 0.8); expect(Math.hypot(p.x,p.y,p.z)).toBeCloseTo(13); });
 it("classifies rounded highsec boundary and negative security", () => { expect(securityClass(.45)).toBe("high"); expect(securityClass(.44)).toBe("low"); expect(securityClass(-.8)).toBe("null"); });
});
