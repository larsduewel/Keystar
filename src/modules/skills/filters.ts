/**
 * Skills page filters, kept in the URL. Isomorphic.
 */

/** Whose queues a viewer with corporation access looks at; everyone else always sees their own. */
export type SkillsView = "own" | "corp";

export interface SkillsFilters {
  view: SkillsView;
  characters: number[];
}

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function idList(v: string | string[] | undefined): number[] {
  return [...new Set((first(v) ?? "").split(",").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 500);
}

export function parseSkillsFilters(params: Params): SkillsFilters {
  return { view: first(params.view) === "corp" ? "corp" : "own", characters: idList(params.chars) };
}

/** Serialises filters back into a query string, omitting defaults. */
export function skillsQueryString(f: SkillsFilters, overrides: Partial<SkillsFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.view !== "own") p.set("view", v.view);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  return p.toString();
}
