import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";

/**
 * Position in a live stream (new killmails, new mail): `first_seen_at` plus
 * the row's id, since one insert stores many rows with the same timestamp.
 * Written `<ISO time>_<id>`.
 */
export interface LiveCursor {
  at: string;
  id: number;
}

/** Postgres timestamps keep microseconds; the cursor carries all of them so `>` never repeats a row. */
export const CURSOR_FORMAT = `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`;
const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)_(\d{1,15})$/;

export const formatLiveCursor = (c: LiveCursor) => `${c.at}_${c.id}`;

/** A cursor from the browser, or null unless it is well formed and names a real instant. */
export function parseLiveCursor(value: string | null | undefined): LiveCursor | null {
  const m = value ? CURSOR_PATTERN.exec(value) : null;
  if (!m) return null;
  const [, at, id] = m;
  const parsed = new Date(at!);
  // Out-of-range parts (month 13, 30 February, …) either fail to parse or roll over.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== at!.slice(0, 19)) return null;
  return { at: at!, id: Number(id) };
}

/** Database time as a live cursor: announce what arrives after this. */
export async function liveCursorNow(): Promise<string> {
  const [row] = await getDb().execute<{ now: string }>(sql`SELECT to_char(now() AT TIME ZONE 'UTC', ${CURSOR_FORMAT}) AS now`);
  return formatLiveCursor({ at: String(row?.now), id: 0 });
}
