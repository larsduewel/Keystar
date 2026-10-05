import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import type { SkillsView } from "./filters";
import { SKILLQUEUE_SCOPE, SKILLS_PERMISSIONS, SKILLS_SCOPE } from "./module";
import type { QueueEntry } from "./queue";

export interface SkillsScope {
  /**
   * Corporation view (skills.view.corp): characters currently in the home corporation whose owner shares their
   * queue. Otherwise only the viewer's own characters.
   */
  corp: boolean;
  userId: string;
  homeCorporationId: number | null;
}

/** Whether the viewer can switch to the corporation view (needs a home corporation to isolate to). */
export function canViewCorpSkills(user: { can: (permission: string) => boolean }, homeCorporationId: number | null): boolean {
  return user.can(SKILLS_PERMISSIONS.viewCorp) && homeCorporationId !== null;
}

export function skillsScope(
  user: { id: string; can: (permission: string) => boolean },
  homeCorporationId: number | null,
  view: SkillsView,
): SkillsScope {
  return { corp: view === "corp" && canViewCorpSkills(user, homeCorporationId), userId: user.id, homeCorporationId };
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function list(values: number[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

/**
 * Characters the scope may show: own ones, or home-corporation ones that share their skills. Sharing means both
 * scopes: a character that dropped one of them is not shown to the corporation, so nothing read with it stays visible.
 */
function characterCond(scope: SkillsScope): SQL {
  if (!scope.corp) return sql`c.user_id = ${scope.userId}::uuid`;
  return sql`c.corporation_id = ${scope.homeCorporationId} AND t.scopes @> ARRAY[${SKILLQUEUE_SCOPE}, ${SKILLS_SCOPE}]::text[]
    AND t.status = 'active'`;
}

export interface Attributes {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
}

export interface SkillCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  /** Main character of the owning account (corporation view). */
  ownerName: string | null;
  isOwn: boolean;
  /** The queue scope is granted and the token works. */
  queueEnabled: boolean;
  skillsEnabled: boolean;
  tokenInvalid: boolean;
  totalSp: number | null;
  unallocatedSp: number | null;
  attributes: Attributes | null;
  bonusRemaps: number | null;
  lastRemapDate: Date | null;
  accruedRemapCooldownDate: Date | null;
  queueSyncedAt: Date | null;
  queueError: string | null;
}

export interface QueueRow extends QueueEntry {
  characterId: number;
  skillName: string | null;
  groupName: string | null;
}

export interface SkillsOverview {
  characters: SkillCharacter[];
  queues: Map<number, QueueRow[]>;
}

/**
 * Characters in scope with their totals, attributes and stored queue. `characterIds` narrows the list (ids outside
 * the scope are ignored).
 */
export async function getSkillsOverview(scope: SkillsScope, characterIds: number[] = []): Promise<SkillsOverview> {
  const db = getDb();
  const narrow = characterIds.length ? sql`AND c.character_id IN (${list(characterIds)})` : sql``;
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, c.corporation_id, c.user_id, mc.name AS owner_name, t.scopes, t.status AS token_status,
           s.total_sp, s.unallocated_sp, s.charisma, s.intelligence, s.memory, s.perception, s.willpower,
           s.bonus_remaps, s.last_remap_date, s.accrued_remap_cooldown_date, s.queue_synced_at,
           j.last_status AS queue_status, j.last_error AS queue_error
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN skills_character s ON s.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'skills.queue' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE ${characterCond(scope)} ${narrow}
    ORDER BY (c.user_id = ${scope.userId}::uuid) DESC,
             c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);

  const characters: SkillCharacter[] = rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const active = r.token_status === "active";
    const skillsEnabled = active && scopes.includes(SKILLS_SCOPE);
    // Totals, attributes and remaps come from the skills scope: shown only while it is granted.
    const hasAttributes = skillsEnabled && r.charisma !== null && r.charisma !== undefined;
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      corporationId: num(r.corporation_id),
      ownerName: str(r.owner_name),
      isOwn: r.user_id === scope.userId,
      queueEnabled: active && scopes.includes(SKILLQUEUE_SCOPE),
      skillsEnabled,
      tokenInvalid: r.token_status === "invalid",
      totalSp: skillsEnabled ? numOrNull(r.total_sp) : null,
      unallocatedSp: skillsEnabled ? numOrNull(r.unallocated_sp) : null,
      attributes: hasAttributes
        ? {
            charisma: num(r.charisma),
            intelligence: num(r.intelligence),
            memory: num(r.memory),
            perception: num(r.perception),
            willpower: num(r.willpower),
          }
        : null,
      bonusRemaps: skillsEnabled ? numOrNull(r.bonus_remaps) : null,
      lastRemapDate: skillsEnabled ? toDate(r.last_remap_date) : null,
      accruedRemapCooldownDate: skillsEnabled ? toDate(r.accrued_remap_cooldown_date) : null,
      queueSyncedAt: toDate(r.queue_synced_at),
      queueError: r.queue_status === "error" ? str(r.queue_error) : null,
    };
  });

  // A queue is only shown while it is shared: turning the scope off hides it at once, also from the corporation view.
  const shown = characters.filter((c) => c.queueEnabled).map((c) => c.characterId);
  const queues = new Map<number, QueueRow[]>();
  if (shown.length) {
    const queueRows = await db.execute<Record<string, unknown>>(sql`
      SELECT q.character_id, q.queue_position, q.skill_id, q.finished_level, q.start_date, q.finish_date,
             q.training_start_sp, q.level_start_sp, q.level_end_sp,
             ty.name AS skill_name, g.name AS group_name
      FROM skills_queue q
      LEFT JOIN eve_types ty ON ty.type_id = q.skill_id
      LEFT JOIN eve_groups g ON g.group_id = ty.group_id
      WHERE q.character_id IN (${list(shown)})
      ORDER BY q.character_id, q.queue_position`);
    for (const r of queueRows) {
      const id = num(r.character_id);
      const entry: QueueRow = {
        characterId: id,
        queuePosition: num(r.queue_position),
        skillId: num(r.skill_id),
        finishedLevel: num(r.finished_level),
        startDate: toDate(r.start_date),
        finishDate: toDate(r.finish_date),
        trainingStartSp: numOrNull(r.training_start_sp),
        levelStartSp: numOrNull(r.level_start_sp),
        levelEndSp: numOrNull(r.level_end_sp),
        skillName: str(r.skill_name),
        groupName: str(r.group_name),
      };
      const queue = queues.get(id);
      if (queue) queue.push(entry);
      else queues.set(id, [entry]);
    }
  }
  return { characters, queues };
}

export interface SkillsAccessStatus {
  characterId: number;
  name: string;
  grantedScopes: string[];
  /** Both skills scopes are granted. */
  granted: boolean;
  /** Switched off in Keystar while the active token still holds both scopes: can be switched back on without a login. */
  switchedOff: boolean;
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Something is stored for this character (queue or trained skills). */
  hasData: boolean;
}

/** The viewer's characters with their skills access, for the settings page. */
export async function getSkillsAccess(userId: string): Promise<SkillsAccessStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error,
           (EXISTS (SELECT 1 FROM skills_character s WHERE s.character_id = c.character_id)
             OR EXISTS (SELECT 1 FROM skills_queue q WHERE q.character_id = c.character_id)) AS has_data
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'skills.queue' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const disabled = Array.isArray(r.disabled_scopes) ? (r.disabled_scopes as string[]) : [];
    const granted = scopes.includes(SKILLQUEUE_SCOPE) && scopes.includes(SKILLS_SCOPE);
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      grantedScopes: scopes,
      granted,
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff:
        !granted &&
        r.token_status === "active" &&
        [SKILLQUEUE_SCOPE, SKILLS_SCOPE].every((s) => scopes.includes(s) || disabled.includes(s)) &&
        [SKILLQUEUE_SCOPE, SKILLS_SCOPE].some((s) => disabled.includes(s)),
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: toDate(r.last_success_at),
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      hasData: Boolean(r.has_data),
    };
  });
}
