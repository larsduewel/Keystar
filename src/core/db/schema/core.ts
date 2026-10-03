import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Role } from "@/core/rbac/roles";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** A Keystar account. One user owns one or more EVE characters. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  mainCharacterId: bigint("main_character_id", { mode: "number" }),
  role: text("role").$type<Role>().notNull().default("guest"),
  isDisabled: boolean("is_disabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

export const characters = pgTable(
  "characters",
  {
    characterId: bigint("character_id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    allianceId: bigint("alliance_id", { mode: "number" }),
    /** SSO owner hash; changes when a character is transferred to another account. */
    ownerHash: text("owner_hash").notNull(),
    affiliationUpdatedAt: timestamp("affiliation_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("characters_user_idx").on(t.userId), index("characters_corp_idx").on(t.corporationId)],
);

export type TokenStatus = "active" | "invalid";

/**
 * ESI refresh tokens ("ESI keys"), one per character. Tokens are AES-256-GCM
 * encrypted at rest with a key derived from APP_SECRET.
 */
export const esiTokens = pgTable("esi_tokens", {
  characterId: bigint("character_id", { mode: "number" })
    .primaryKey()
    .references(() => characters.characterId, { onDelete: "cascade" }),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  /** Scopes Keystar uses: the token's scopes minus `disabledScopes`. */
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  /**
   * Opt-in scopes the token still holds but the user switched off in Keystar
   * (EVE can't drop a single scope without a new login). Cleared by the next SSO consent.
   */
  disabledScopes: text("disabled_scopes").array().notNull().default(sql`'{}'::text[]`),
  status: text("status").$type<TokenStatus>().notNull().default("active"),
  lastError: text("last_error"),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session cookie value; the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalised so the log stays readable after users are deleted. */
    actorName: text("actor_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** In-game corporation roles of a character (from /characters/{id}/roles). */
export const characterCorpRoles = pgTable("character_corp_roles", {
  characterId: bigint("character_id", { mode: "number" })
    .primaryKey()
    .references(() => characters.characterId, { onDelete: "cascade" }),
  roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** In-game corporation roster (from /corporations/{id}/members) used for audits. */
export const corporationMembers = pgTable(
  "corporation_members",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.characterId] })],
);
