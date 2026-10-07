import { securityClass } from "@/modules/map/model";
import type { Universe } from "./universe";

/**
 * Stargate routes, weighted like EVE's own autopilot
 * (https://developers.eveonline.com/docs/guides/route-calculation/): every
 * system entered costs 1 on "shorter"; on "safer", high-sec costs 0.9, low-sec
 * e^(0.15·penalty) and null-sec twice that, so a route only leaves high-sec
 * when there is no high-sec way around ("less secure" mirrors it). Pure.
 */
export const PREFERENCES = ["shortest", "safer", "insecure"] as const;
export type RoutePreference = (typeof PREFERENCES)[number];

/** EVE's default security penalty (the in-game slider runs 0–100). */
export const DEFAULT_SECURITY_PENALTY = 50;

/**
 * Zarzakh's emanation lock keeps anyone who jumps in to the gate they came
 * through for six hours, so no route can pass through it.
 */
export const NO_TRANSIT = new Set([30_100_000]);

export function systemCost(preference: RoutePreference, security: number, penalty = DEFAULT_SECURITY_PENALTY): number {
  if (preference === "shortest") return 1;
  const cost = Math.exp(0.15 * penalty);
  const sec = securityClass(security);
  if (sec === "null") return 2 * cost;
  if (preference === "safer") return sec === "high" ? 0.9 : cost;
  return sec === "low" ? 0.9 : cost;
}

/** Binary min-heap of [cost, jumps, system]; ties go to fewer jumps. */
class Queue {
  private items: [number, number, number][] = [];
  get size() {
    return this.items.length;
  }
  private less(a: [number, number, number], b: [number, number, number]) {
    return a[0] < b[0] - 1e-9 || (Math.abs(a[0] - b[0]) <= 1e-9 && a[1] < b[1]);
  }
  push(item: [number, number, number]) {
    const h = this.items;
    h.push(item);
    for (let i = h.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (!this.less(h[i], h[parent])) break;
      [h[i], h[parent]] = [h[parent], h[i]];
      i = parent;
    }
  }
  pop(): [number, number, number] | undefined {
    const h = this.items;
    const top = h[0];
    const last = h.pop();
    if (h.length && last) {
      h[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
}

export interface RouteOptions {
  preference: RoutePreference;
  /** Systems to route around (never the start or destination). */
  avoid?: ReadonlySet<number>;
  securityPenalty?: number;
}

/** The cheapest stargate route from `from` to `to`, both included; null when there is none. */
export function planRoute(u: Universe, from: number, to: number, opts: RouteOptions): number[] | null {
  if (!u.systems.has(from) || !u.systems.has(to)) return null;
  if (from === to) return [from];
  const avoid = opts.avoid ?? new Set<number>();
  const best = new Map<number, number>([[from, 0]]);
  const previous = new Map<number, number>();
  const queue = new Queue();
  queue.push([0, 0, from]);
  while (queue.size) {
    const [cost, jumps, id] = queue.pop()!;
    if (cost > (best.get(id) ?? Infinity) + 1e-9) continue;
    if (id === to) break;
    // Zarzakh and avoided systems can be where a route starts, never somewhere it passes through.
    if (id !== from && (NO_TRANSIT.has(id) || avoid.has(id))) continue;
    for (const next of u.neighbours.get(id) ?? []) {
      if (next !== to && avoid.has(next)) continue;
      const system = u.systems.get(next);
      if (!system) continue;
      const total = cost + systemCost(opts.preference, system.security, opts.securityPenalty);
      if (total < (best.get(next) ?? Infinity) - 1e-9) {
        best.set(next, total);
        previous.set(next, id);
        queue.push([total, jumps + 1, next]);
      }
    }
  }
  if (!previous.has(to)) return null;
  const route = [to];
  while (route[route.length - 1] !== from) route.push(previous.get(route[route.length - 1])!);
  return route.reverse();
}

/** Systems per security class along a route (the start excluded: those are the systems you enter). */
export function securityMix(u: Universe, route: readonly number[]): Record<"high" | "low" | "null", number> {
  const mix = { high: 0, low: 0, null: 0 };
  for (const id of route.slice(1)) {
    const s = u.systems.get(id);
    if (s) mix[securityClass(s.security)] += 1;
  }
  return mix;
}
