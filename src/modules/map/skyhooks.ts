export type Skyhook = {
 planetId: number; systemId: number; planetName: string | null; start: string; end: string;
};
export type SkyhookSnapshot = { skyhooks: Skyhook[]; checkedAt: string; sourceAt: string };
export type SkyhookWindow = "active" | "upcoming";
export const SKYHOOK_REFRESH_MS = 300_000;
export function windowState(row: Skyhook, now: number): SkyhookWindow | null {
 const start = Date.parse(row.start), end = Date.parse(row.end);
 if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || now >= end) return null;
 return now >= start ? "active" : "upcoming";
}
/** Fail closed on malformed feeds so an invalid response cannot replace a good snapshot. */
export function parseSkyhooks(input: unknown): Skyhook[] {
 if (!input || typeof input !== "object" || !("skyhooks" in input) || !Array.isArray(input.skyhooks)) throw new Error("Invalid Skyhook feed");
 const rows = new Map<number, Skyhook>();
 for (const entry of input.skyhooks) {
  const v = entry?.theft_vulnerability;
  if (!Number.isSafeInteger(entry?.planet_id) || entry.planet_id <= 0 || !Number.isSafeInteger(entry?.solar_system_id) || entry.solar_system_id <= 0 || typeof v?.start !== "string" || typeof v?.end !== "string" || !Number.isFinite(Date.parse(v.start)) || !Number.isFinite(Date.parse(v.end)) || Date.parse(v.end) <= Date.parse(v.start)) throw new Error("Invalid Skyhook window");
  rows.set(entry.planet_id, {planetId: entry.planet_id, systemId: entry.solar_system_id, planetName: null, start: v.start, end: v.end});
 }
 return [...rows.values()];
}
export function upcomingSkyhooks(rows: Skyhook[], now: number, filter: "all" | SkyhookWindow = "all") {
 return rows.filter(row => {const state=windowState(row, now);return state !== null && (filter === "all" || state === filter);})
  .sort((a,b) => Number(windowState(b,now)==="active")-Number(windowState(a,now)==="active") || Date.parse(a.start)-Date.parse(b.start) || a.planetId-b.planetId);
}
export function skyhookSystems(rows: Skyhook[], now: number): Map<number, SkyhookWindow> {
 const result=new Map<number,SkyhookWindow>();
 for(const row of rows){const state=windowState(row,now);if(state && (state==="active" || !result.has(row.systemId)))result.set(row.systemId,state);}
 return result;
}
