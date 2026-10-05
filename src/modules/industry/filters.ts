import { isIndustryActivity, type IndustryActivity, type JobState } from "./activities";

/**
 * Industry jobs filters, kept in the URL so views are shareable and the server can render them. Isomorphic.
 */
export interface IndustryFilters {
  state: JobState;
  characters: number[];
  activities: IndustryActivity[];
  systems: number[];
  /** Stations and structures (`location_id` of the job, ESI's `facility_id`). */
  locations: number[];
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function idList(v: string | string[] | undefined): number[] {
  const raw = Array.isArray(v) ? v.join(",") : (v ?? "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  ].slice(0, 500);
}

export function parseIndustryFilters(params: RawParams): IndustryFilters {
  const state = first(params.state);
  const activities = [...new Set((first(params.activities) ?? "").split(",").filter(isIndustryActivity))];
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(first(params.page))) || 1));
  return {
    state: state === "finished" || state === "all" ? state : "running",
    characters: idList(params.chars),
    activities,
    systems: idList(params.systems),
    locations: idList(params.locations),
    page,
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function industryQueryString(f: IndustryFilters, overrides: Partial<IndustryFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.state !== "running") p.set("state", v.state);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  if (v.activities.length) p.set("activities", v.activities.join(","));
  if (v.systems.length) p.set("systems", v.systems.join(","));
  if (v.locations.length) p.set("locations", v.locations.join(","));
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}
