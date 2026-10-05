import type { MapSystem } from "./model";

/** Rank exact names first, then prefixes, then substring matches across all spaces. */
export function matchingSystems(systems: MapSystem[], text: string, limit = 8): MapSystem[] {
  const query = text.trim().toLowerCase();
  if (!query) return [];
  const rank = (system: MapSystem) => {
    const name = system[1].toLowerCase();
    return name === query ? 0 : name.startsWith(query) ? 1 : 2;
  };
  return systems.filter(system => system[1].toLowerCase().includes(query))
    .sort((a, b) => rank(a) - rank(b) || a[1].localeCompare(b[1]))
    .slice(0, limit);
}