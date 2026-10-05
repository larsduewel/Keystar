import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { appSettings, getDb, type Db } from "@/core/db";
import { ROLES } from "@/core/rbac/roles";

/**
 * Typed application settings stored as JSON rows in `app_settings`.
 * Add new settings here with a schema and a default.
 */
const settingSchemas = {
  "corp.homeCorporationId": z.number().int().positive().nullable(),
  "access.autoApproveCorpMembers": z.boolean(),
  "access.autoApproveAllianceMembers": z.boolean(),
  /** Refuse new accounts for characters that wouldn't be auto-approved (outside the corp/alliance). */
  "access.restrictToMembers": z.boolean(),
  "permissions.overrides": z.record(z.string(), z.enum(ROLES)),
  "mining.valuationSource": z.enum(["jita_buy", "jita_sell", "jita_split", "esi_average"]),
  "mining.valuationMode": z.enum(["current", "historical"]),
  "sync.paused": z.boolean(),
  "eve.serverStatus": z
    .object({ players: z.number(), serverVersion: z.string(), startTime: z.string(), checkedAt: z.string() })
    .nullable(),
  /** Demo mode only: role -> user id of the seeded demo accounts. */
  "demo.users": z.record(z.string(), z.string()),
  /** Set when the first admin finished the setup walkthrough (ISO timestamp). */
  "setup.completedAt": z.string().nullable(),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const SETTING_DEFAULTS: Settings = {
  "corp.homeCorporationId": null,
  "access.autoApproveCorpMembers": true,
  "access.autoApproveAllianceMembers": false,
  "access.restrictToMembers": false,
  "permissions.overrides": {},
  "mining.valuationSource": "jita_buy",
  "mining.valuationMode": "current",
  "sync.paused": false,
  "eve.serverStatus": null,
  "demo.users": {},
  "setup.completedAt": null,
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const KEYS = Object.keys(settingSchemas) as SettingKey[];

export async function getSettings(): Promise<Settings> {
  const rows = await getDb().select().from(appSettings).where(inArray(appSettings.key, KEYS));
  const result: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    const key = row.key as SettingKey;
    const parsed = settingSchemas[key].safeParse(row.value);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as Settings;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const rows = await getDb()
    .select()
    .from(appSettings)
    .where(sql`${appSettings.key} = ${key}`);
  const parsed = rows[0] ? settingSchemas[key].safeParse(rows[0].value) : undefined;
  return (parsed?.success ? parsed.data : SETTING_DEFAULTS[key]) as Settings[K];
}

/** Pass `tx` to save the setting together with its audit entry (see `auditInTx`). */
export async function setSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
  updatedBy?: string | null,
  tx: Db | Tx = getDb(),
): Promise<void> {
  const parsed = settingSchemas[key].parse(value);
  await tx
    .insert(appSettings)
    .values({ key, value: parsed as object, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: parsed as object, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}
