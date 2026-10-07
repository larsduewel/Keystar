import type { MapSystem } from "./model";
/** Gate id, source system, destination system/gate, and local coordinates in metres. */
export type MapGate = [number, number, number, number, number, number, number];
export const JUMP_SHIPS = ["carrier", "commandCarrier", "supercapital", "blackops", "freighter"] as const;
export type JumpShip = typeof JUMP_SHIPS[number];
export type JumpRules = { bases: Record<JumpShip, number>; calibrationBonus: number; restricted: number[] };
export type GateKill = { id: number; time: string; gateId: number; destinationId: number; distanceKm: number | null; shipTypeId: number; weaponTypeIds?: number[]; smartbombPodKill?: boolean; attackers?: { characterId: number; shipTypeId: number | null }[] };
export type GateCheck = { systemId: number; checkedAt: string; complete: boolean; missingPositions: number; kills: GateKill[]; shipNames?: Record<number,string>; characterNames?: Record<number,string> };
export type MapOverlay = { route: number[]; risks: Record<number, "red" | "green" | "unknown">; inRange: number[]; range: number | null; originId: number | null };
export const EMPTY_OVERLAY: MapOverlay = { route: [], risks: {}, inRange: [], range: null, originId: null };
export function gateGraph(gates: readonly MapGate[]): Map<number, number[]> {
 const graph = new Map<number, number[]>();
 for (const gate of gates) { const list=graph.get(gate[1]) ?? []; if(!list.includes(gate[2]))list.push(gate[2]);graph.set(gate[1],list); }
 return graph;
}
/** BFS minimizes the number of stargate jumps, not spatial distance or risk. */
export function shortestRoute(graph: Map<number, number[]>, start: number, end: number): number[] | null {
 if(start===end)return [start];
 const queue=[start], previous=new Map<number,number>(); previous.set(start,start);
 for(let i=0;i<queue.length;i++) for(const next of graph.get(queue[i]) ?? []) {
  if(previous.has(next))continue; previous.set(next,queue[i]);
  if(next===end) { const route=[end]; while(route[route.length-1]!==start)route.push(previous.get(route[route.length-1])!);return route.reverse(); }
  queue.push(next);
 }
 return null;
}
export function jumpRange(rules: JumpRules, ship: JumpShip, level: number) {
 return rules.bases[ship]*(1+rules.calibrationBonus*Math.max(0,Math.min(5,Math.floor(level))));
}
export function distanceLy(a: MapSystem,b: MapSystem) { return Math.hypot(a[3]-b[3],a[4]-b[4],a[5]-b[5]); }
/** Geometric reach only. Destination restrictions and cyno availability remain separate. */
export function systemsInRange(systems: readonly MapSystem[], origin: MapSystem, range: number): MapSystem[] {
 if(origin[0]>=31000000)return [];
 return systems.filter(s=>s[0]<31000000 && s[0]!==origin[0] && distanceLy(origin,s)<=range+1e-9).sort((a,b)=>distanceLy(origin,a)-distanceLy(origin,b));
}
export function routeGateKills(check: GateCheck, route: number[]): GateKill[] {
 const index=route.indexOf(check.systemId);if(index<0)return [];
 return check.kills.filter(k=>Date.parse(k.time)>=Date.now()-2*3600_000 && [route[index-1],route[index+1]].includes(k.destinationId));
}
export function routeRisk(check: GateCheck | undefined, route: number[]): "red" | "green" | "unknown" {
 if(!check)return "unknown";
 if(routeGateKills(check,route).length)return "red";
 return check.complete && check.missingPositions===0 ? "green" : "unknown";
}

/** Latest observed hull per identified pilot, only from the supplied gate evidence. */
export function observedFleet(kills: GateKill[]): {shipTypeId:number|null;count:number;characterIds:number[]}[] {
 const pilots=new Map<number,number|null>();
 for(const kill of [...kills].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)))for(const a of kill.attackers??[])if(!pilots.has(a.characterId))pilots.set(a.characterId,a.shipTypeId);
 const groups=new Map<number|null,number[]>();for(const [id,hull] of pilots){const group=groups.get(hull)??[];group.push(id);groups.set(hull,group);}
 return [...groups].map(([shipTypeId,characterIds])=>({shipTypeId,count:characterIds.length,characterIds:characterIds.sort((a,b)=>a-b)})).sort((a,b)=>b.count-a.count || (a.shipTypeId??Infinity)-(b.shipTypeId??Infinity));
}

/** CCP groups: Capsule (29), Smart Bomb (72). Unresolved types never imply confirmed evidence. */
export function isSmartbombPodKill(kill: GateKill, groups: ReadonlyMap<number,number>): boolean | undefined {
 const victimGroup=groups.get(kill.shipTypeId);
 if(victimGroup===undefined)return undefined;
 if(victimGroup!==29)return false;
 if(kill.weaponTypeIds?.some(id=>groups.get(id)===72))return true;
 return kill.weaponTypeIds?.length && kill.weaponTypeIds.every(id=>groups.has(id)) ? false : undefined;
}