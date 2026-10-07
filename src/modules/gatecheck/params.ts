import { MAX_AVOID } from "./constants";
import { PREFERENCES, type RoutePreference } from "./route";
import { findSystem, type Universe, type UniverseSystem } from "./universe";

/** The gate check's form, kept in the URL (`/gatecheck?from=Jita&to=Amamake&pref=safer`). Pure. */
export interface GatecheckQuery {
  from: string;
  to: string;
  preference: RoutePreference;
  /** Avoided systems as typed (names, comma separated). */
  avoid: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : (v?.[0] ?? "")).slice(0, 400);

export function parseQuery(params: Params): GatecheckQuery {
  const pref = one(params.pref);
  return {
    from: one(params.from).trim(),
    to: one(params.to).trim(),
    preference: (PREFERENCES as readonly string[]).includes(pref) ? (pref as RoutePreference) : "shortest",
    avoid: one(params.avoid).trim(),
  };
}

export interface ResolvedQuery {
  from: UniverseSystem | null;
  to: UniverseSystem | null;
  avoid: UniverseSystem[];
  /** Avoid entries that are no known-space system with stargates. */
  unknownAvoid: string[];
}

export function resolveQuery(u: Universe, q: GatecheckQuery): ResolvedQuery {
  const avoid: UniverseSystem[] = [];
  const unknownAvoid: string[] = [];
  for (const name of q.avoid
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_AVOID)) {
    const s = findSystem(u, name);
    if (s) {
      if (!avoid.some((a) => a.id === s.id)) avoid.push(s);
    } else unknownAvoid.push(name);
  }
  return {
    from: findSystem(u, q.from),
    to: findSystem(u, q.to),
    avoid,
    unknownAvoid,
  };
}

/** The URL of a gate check with some fields changed (avoid one more system, another preference …). */
export function gatecheckHref(q: GatecheckQuery, change: Partial<GatecheckQuery> = {}): string {
  const next = { ...q, ...change };
  const params = new URLSearchParams();
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.preference !== "shortest") params.set("pref", next.preference);
  if (next.avoid) params.set("avoid", next.avoid);
  const query = params.toString();
  return query ? `/gatecheck?${query}` : "/gatecheck";
}
