import type { MapSystem } from "@/modules/map/model";
import type { MapGate } from "@/modules/map/travel";

/**
 * The stargate network from CCP's static data (the same files the map uses,
 * public/data/map-*.json). Pure: build it from the parsed files; server code
 * gets the shared instance from universe-data.ts.
 */
export interface UniverseSystem {
  id: number;
  name: string;
  security: number;
}

export interface Gate {
  id: number;
  systemId: number;
  destinationId: number;
  /** Position in the system, metres. */
  x: number;
  y: number;
  z: number;
}

export interface Universe {
  systems: Map<number, UniverseSystem>;
  /** Lower-case name → system id. */
  byName: Map<string, number>;
  /** Stargates per system. */
  gates: Map<number, Gate[]>;
  /** Systems one jump away. */
  neighbours: Map<number, number[]>;
}

export function buildUniverse(systems: readonly MapSystem[], gates: readonly MapGate[]): Universe {
  const u: Universe = {
    systems: new Map(),
    byName: new Map(),
    gates: new Map(),
    neighbours: new Map(),
  };
  for (const [id, name, security] of systems) {
    u.systems.set(id, { id, name, security });
    u.byName.set(name.toLowerCase(), id);
  }
  for (const [id, systemId, destinationId, , x, y, z] of gates) {
    const list = u.gates.get(systemId) ?? [];
    list.push({ id, systemId, destinationId, x, y, z });
    u.gates.set(systemId, list);
    const next = u.neighbours.get(systemId) ?? [];
    if (!next.includes(destinationId)) next.push(destinationId);
    u.neighbours.set(systemId, next);
  }
  return u;
}

/** A system by exact name (any case) or id; null when it has no stargates. */
export function findSystem(u: Universe, query: string): UniverseSystem | null {
  const q = query.trim();
  if (!q) return null;
  const id = /^\d+$/.test(q) ? Number(q) : u.byName.get(q.toLowerCase());
  const system = id === undefined ? undefined : u.systems.get(id);
  return system && u.gates.has(system.id) ? system : null;
}

/** The stargate in `systemId` that leads to `destinationId`. */
export function gateTo(u: Universe, systemId: number, destinationId: number): Gate | null {
  return u.gates.get(systemId)?.find((g) => g.destinationId === destinationId) ?? null;
}

/** Jumps from `origin` to every system within `maxJumps` (breadth first, origin included at 0). */
export function jumpsWithin(u: Universe, origin: number, maxJumps: number): Map<number, number> {
  const seen = new Map<number, number>([[origin, 0]]);
  let frontier = [origin];
  for (let depth = 1; depth <= maxJumps && frontier.length; depth++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const n of u.neighbours.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.set(n, depth);
        next.push(n);
      }
    }
    frontier = next;
  }
  return seen;
}
