import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
import type {
  CorpHistoryEntry,
  DscanEntry,
  NormalizedStats,
  PilotHistory,
  PilotProfile,
  PilotScore,
} from "./types";

/**
 * Threat intelligence: scans of pasted pilot lists, a per-pilot profile cache
 * built from zKillboard, a work queue for the worker, contact standings and
 * Claude's written notes. See docs/architecture.md (Threat intel).
 */

export type ScanStatus = "running" | "ready";
export type BriefingStatus = "pending" | "done" | "skipped";

/** A pasted list, shareable by its unguessable id. Holds normalized names, never the raw paste. */
export const intelScans = pgTable(
  "intel_scans",
  {
    id: text("id").primaryKey(),
    createdBy: uuid("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Bumped whenever a pilot's data changes; pages poll it. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    names: text("names").array().notNull(),
    /** Names ESI does not know. */
    unresolved: text("unresolved").array().notNull().default([]),
    dscan: jsonb("dscan").$type<DscanEntry[]>(),
    /** When the d-scan was pasted; d-scan reads from before it are stale. */
    dscanAt: timestamp("dscan_at", { withTimezone: true }),
    systemId: bigint("system_id", { mode: "number" }),
    status: text("status").$type<ScanStatus>().notNull().default("running"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    pilotCount: integer("pilot_count").notNull().default(0),
    /** Whether the creator may use Claude (the automatic briefing respects it). */
    aiAllowed: boolean("ai_allowed").notNull().default(false),
    /** The creator's language: Claude writes the automatic briefing in it. */
    locale: text("locale").$type<Locale>().notNull().default("en"),
    briefingStatus: text("briefing_status").$type<BriefingStatus>().notNull().default("pending"),
  },
  (t) => [
    index("intel_scans_created_idx").on(t.createdAt),
    index("intel_scans_created_by_idx").on(t.createdBy, t.createdAt),
    index("intel_scans_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * One row per d-scan paste that needed ESI type lookups, for the per-user
 * limit on those lookups (bogus type ids spend the shared ESI error budget).
 * Pruned by intel.housekeeping.
 */
export const intelDscanLookups = pgTable(
  "intel_dscan_lookups",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intel_dscan_lookups_user_idx").on(t.userId, t.createdAt)],
);

/** Pilots of a scan with their affiliation at scan time and their score in the scan's context. */
export const intelScanPilots = pgTable(
  "intel_scan_pilots",
  {
    scanId: text("scan_id")
      .notNull()
      .references(() => intelScans.id, { onDelete: "cascade" }),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    corporationId: bigint("corporation_id", { mode: "number" }),
    allianceId: bigint("alliance_id", { mode: "number" }),
    factionId: bigint("faction_id", { mode: "number" }),
    /** Queued for zKillboard profiling (friendlies and very large lists are not by default). */
    profiled: boolean("profiled").notNull().default(false),
    history: jsonb("history").$type<PilotHistory>(),
    score: smallint("score"),
    tier: text("tier"),
    scoreDetail: jsonb("score_detail").$type<PilotScore>(),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.scanId, t.characterId] }),
    index("intel_scan_pilots_character_idx").on(t.characterId, t.scanId),
  ],
);

export type StatsStatus = "ok" | "none" | "error";
export type DeepStatus = "none" | "partial" | "complete" | "error";

/** Profile cache per character, with one timestamp per data source so each refreshes on its own. */
export const intelPilots = pgTable(
  "intel_pilots",
  {
    characterId: bigint("character_id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    corporationId: bigint("corporation_id", { mode: "number" }),
    allianceId: bigint("alliance_id", { mode: "number" }),
    factionId: bigint("faction_id", { mode: "number" }),
    affiliationAt: timestamp("affiliation_at", { withTimezone: true }),
    birthday: timestamp("birthday", { withTimezone: true }),
    securityStatus: doublePrecision("security_status"),
    corpHistory: jsonb("corp_history").$type<CorpHistoryEntry[]>(),
    corpHistoryAt: timestamp("corp_history_at", { withTimezone: true }),
    stats: jsonb("stats").$type<NormalizedStats>(),
    statsStatus: text("stats_status").$type<StatsStatus>(),
    statsAt: timestamp("stats_at", { withTimezone: true }),
    statsError: text("stats_error"),
    deepStatus: text("deep_status").$type<DeepStatus>().notNull().default("none"),
    deepAt: timestamp("deep_at", { withTimezone: true }),
    deepPages: smallint("deep_pages").notNull().default(0),
    /** Oldest killmail time the digest reaches back to. */
    deepReachedAt: timestamp("deep_reached_at", { withTimezone: true }),
    /** Newest killmail already stored, so a refresh can stop at known killmails. */
    newestKillmailId: bigint("newest_killmail_id", { mode: "number" }),
    profile: jsonb("profile").$type<PilotProfile>(),
    profileVersion: smallint("profile_version"),
    profileAt: timestamp("profile_at", { withTimezone: true }),
    lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intel_pilots_requested_idx").on(t.lastRequestedAt)],
);

/**
 * A compact digest of each pilot's recent killmails: one row per pilot and
 * killmail with only what scoring and the "latest kills" strip need.
 */
export const intelPilotKillmails = pgTable(
  "intel_pilot_killmails",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    killmailId: bigint("killmail_id", { mode: "number" }).notNull(),
    killmailTime: timestamp("killmail_time", { withTimezone: true }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    locationId: bigint("location_id", { mode: "number" }),
    isLoss: boolean("is_loss").notNull(),
    /** The pilot's own hull and weapon. */
    shipTypeId: integer("ship_type_id"),
    weaponTypeId: integer("weapon_type_id"),
    finalBlow: boolean("final_blow").notNull().default(false),
    damageDone: integer("damage_done").notNull().default(0),
    attackerCount: integer("attacker_count").notNull(),
    totalValue: doublePrecision("total_value").notNull().default(0),
    solo: boolean("solo").notNull().default(false),
    npc: boolean("npc").notNull().default(false),
    awox: boolean("awox").notNull().default(false),
    labels: text("labels").array().notNull().default([]),
    /** The victim on a kill, the final blow on a loss. */
    otherCharacterId: bigint("other_character_id", { mode: "number" }),
    otherCorporationId: bigint("other_corporation_id", { mode: "number" }),
    otherAllianceId: bigint("other_alliance_id", { mode: "number" }),
    otherShipTypeId: integer("other_ship_type_id"),
    /** Kills only: other player attackers (capped), for "flies with". */
    allyIds: bigint("ally_ids", { mode: "number" }).array().notNull().default([]),
    /** Losses only: modules fitted in slots, for cyno/cloak/tackle evidence. */
    fittedTypeIds: integer("fitted_type_ids").array().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.killmailId] }),
    index("intel_pilot_killmails_time_idx").on(t.characterId, t.killmailTime),
    index("intel_pilot_killmails_prune_idx").on(t.killmailTime),
  ],
);

/** Stage of a pilot's zKillboard work: statistics, newest page, older pages, a page of losses. */
export type QueueStage = 1 | 2 | 3 | 4;

/** Outstanding zKillboard work, one row per pilot, shared by every scan that asked for it. */
export const intelQueue = pgTable(
  "intel_queue",
  {
    characterId: bigint("character_id", { mode: "number" }).primaryKey(),
    stage: smallint("stage").$type<QueueStage>().notNull().default(1),
    page: smallint("page").notNull().default(1),
    priority: real("priority").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [index("intel_queue_order_idx").on(t.stage, t.priority, t.requestedAt)],
);

export type ContactOwner = "corporation" | "alliance";

/** The home corporation's and alliance's contacts (standings), replaced on every sync. */
export const intelContacts = pgTable(
  "intel_contacts",
  {
    ownerType: text("owner_type").$type<ContactOwner>().notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    contactId: bigint("contact_id", { mode: "number" }).notNull(),
    contactType: text("contact_type").notNull(),
    standing: doublePrecision("standing").notNull(),
    labelIds: bigint("label_ids", { mode: "number" }).array().notNull().default([]),
    isWatched: boolean("is_watched"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerType, t.ownerId, t.contactId] }),
    index("intel_contacts_contact_idx").on(t.contactId),
  ],
);

export type AiNoteKind = "briefing" | "dossier" | "dscan";

/** Briefings, dossiers and d-scan reads, with the facts they were written from. */
export const intelAiNotes = pgTable(
  "intel_ai_notes",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<AiNoteKind>().notNull(),
    scanId: text("scan_id").references(() => intelScans.id, { onDelete: "cascade" }),
    characterId: bigint("character_id", { mode: "number" }),
    factsHash: text("facts_hash").notNull(),
    /** "claude" or "template"; "pending" while Claude is writing it (never shown). */
    source: text("source").notNull(),
    /** Claude was called for this note, whatever came of it; the hourly budget counts these (ai/limits.ts). */
    claudeCalled: boolean("claude_called").notNull().default(false),
    model: text("model"),
    error: text("error"),
    /** Language of Claude's text (whoever asked for it); null for template drafts, written out per reader. */
    locale: text("locale").$type<Locale>(),
    content: jsonb("content").notNull(),
    facts: jsonb("facts").notNull(),
    usage: jsonb("usage"),
    /** Null for notes the worker wrote on its own. */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("intel_ai_notes_scan_idx").on(t.scanId, t.kind, t.createdAt),
    index("intel_ai_notes_character_idx").on(t.characterId, t.kind, t.createdAt),
    index("intel_ai_notes_user_idx").on(t.createdBy, t.createdAt),
    index("intel_ai_notes_claude_idx").on(t.claudeCalled, t.createdAt),
  ],
);
