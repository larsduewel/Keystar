/** Tunables of the gate check. Isomorphic: no server imports. */

/** A kill this close to a stargate counts as a kill at that gate (on grid, where camps sit). */
export const GATE_RADIUS_METRES = 150_000;

/** Player attackers kept per killmail (by damage); big fleet fights need no more to tell who was there. */
export const MAX_ATTACKERS = 100;

/** How long kills at gates are kept: the history camp predictions are built from. */
export const GATE_HISTORY_DAYS = 60;
/** How long kills away from gates are kept (system activity, "seen nearby"). */
export const OTHER_KILL_DAYS = 7;
/** How far back predictions look (within GATE_HISTORY_DAYS). */
export const PREDICTION_DAYS = 30;

/** Recent kills are those of the last two hours (kills reach zKillboard up to half an hour late). */
export const WINDOW_HOURS = 2;

/** Rough time per jump (align, warp, jump) for the arrival time at each gate, departing now. */
export const SECONDS_PER_JUMP = 60;

/** The live feed counts as up to date while it caught up this recently (it polls every 10 s). */
export const FEED_FRESH_MS = 3 * 60_000;
/** Past this, the feed is offline and "no kills" means nothing. */
export const FEED_STALE_MS = 15 * 60_000;

/** Kills at a route gate this recent mean the camp is most likely still there. */
export const ACTIVE_CAMP_MS = 30 * 60_000;

/** Pilots seen at a gate on at least this many different days count as regulars there. */
export const REGULAR_MIN_DAYS = 2;
/** A regular's kill anywhere within this many jumps and this long ago means they are about. */
export const NEARBY_JUMPS = 5;
export const NEARBY_MS = 2 * 3600_000;

/** Highest number of avoided systems a route takes. */
export const MAX_AVOID = 30;

/** CONCORD on a killmail means the attackers were CONCORDed: a suicide gank. */
export const CONCORD_FACTION_ID = 500_006;
export const CONCORD_CORPORATION_ID = 1_000_125;
