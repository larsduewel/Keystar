/**
 * Tunables for threat intel. Times are in milliseconds unless the name says
 * otherwise. Changing PROFILE_VERSION makes the worker rebuild every cached
 * profile from stored data (no zKillboard refetch).
 */

/** Longest paste accepted (characters). */
export const MAX_INPUT_CHARS = 100_000;
/** Most pilots one scan resolves (ESI /universe/ids takes 500 names per request). */
export const MAX_PILOTS = 500;
/** Most pilots one scan profiles on zKillboard automatically; the rest can be profiled on request. */
export const MAX_PROFILED = 150;
/** Scans one user may start per RATE_WINDOW_MS. */
export const SCAN_RATE_LIMIT = 20;
export const SCAN_RATE_WINDOW_MS = 10 * 60_000;
/**
 * D-scans: unknown type ids looked up on ESI per paste, pastes with lookups one
 * user may make per DSCAN_LOOKUP_WINDOW_MS, and the ESI error budget lookups
 * leave alone (the client pauses below 20; ESI allows 100 per window).
 */
export const DSCAN_MAX_LOOKUPS = 50;
export const DSCAN_LOOKUP_LIMIT = 20;
export const DSCAN_LOOKUP_WINDOW_MS = 10 * 60_000;
export const DSCAN_ERROR_HEADROOM = 50;

/** Recency weighting: a kill this many days old counts half. */
export const DECAY_HALF_LIFE_DAYS = 14;
/** Fights with the home corporation stay relevant longer. */
export const HISTORY_HALF_LIFE_DAYS = 45;
/** Killmails in the same system with gaps up to this long form one engagement. */
export const ENGAGEMENT_GAP_MINUTES = 30;
/** Engagements shown (and expanded) per scan, newest first. */
export const MAX_ENGAGEMENTS = 20;

/** Cached data is fresh for … */
export const AFFILIATION_TTL_MS = 60 * 60_000;
export const STATS_TTL_MS = 60 * 60_000;
export const DEEP_TTL_MS = 60 * 60_000;
export const CORP_HISTORY_TTL_MS = 24 * 60 * 60_000;

/** The deep pass reads newer killmails until it reaches this far back … */
export const DEEP_TARGET_DAYS = 30;
/** … but never more than this many pages of 200. */
export const DEEP_MAX_PAGES = 3;

/** Bump when the profile shape or its derivation changes. */
export const PROFILE_VERSION = 3;

/** Worker: seconds of zKillboard work per run, and retries per pilot. */
export const WORKER_BUDGET_MS = 40_000;
export const MAX_ATTEMPTS = 3;
/** A scan counts as ready once this many top pilots have their newest killmails. */
export const BRIEF_TOP = 15;
/** Recently scanned pilots are rescored when their data changes. */
export const RESCORE_WINDOW_MS = 24 * 60 * 60_000;

/** Retention. */
export const DIGEST_RETENTION_DAYS = 90;
export const DIGEST_KEEP_NEWEST = 10;
export const PILOT_RETENTION_DAYS = 180;
export const SCAN_RETENTION_DAYS = 365;

/** Claude calls per user and per instance in a rolling hour (each call costs money on the instance's key). */
export const USER_HOURLY_LIMIT = 20;
export const INSTANCE_HOURLY_LIMIT = 120;

/** Recently seen hostiles feed. */
export const FEED_DAYS = 7;
