import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { eveEntities, eveGroups, eveTypes, getDb, mailLabels, mailLists, mailMessages } from "@/core/db";
import { CURSOR_FORMAT, formatLiveCursor, type LiveCursor } from "@/core/live-cursor";
import { BUILTIN_LABELS, labelColor } from "./esi";
import { collectLinks, mailPreview, parseEveHtml, type EveNode } from "./eve-html";
import { PAGE_SIZE, type MailFolder } from "./filters";
import { linkIds } from "./links";
import { MAIL_JOB_KEY, MAIL_SCOPE } from "./module";
import type { MailRecipient } from "./schema";

/*
 * Every query is filtered by the owning account (`user_id`), never by
 * character ids alone: mail belongs to the account that imported it, and no
 * role or permission reads another account's mail.
 */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const BUILTIN_LABEL_IDS = new Set<number>(Object.values(BUILTIN_LABELS));
const numArray = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);

export interface Mailbox {
  characterId: number;
  name: string;
  granted: boolean;
  /** Switched off in Keystar while the token still holds the scope: can be switched back on without an EVE login. */
  switchedOff: boolean;
  grantedScopes: string[];
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  mails: number;
  unread: number;
}

/** The viewer's characters with mail access, import status and counts. */
export async function getMailboxes(userId: string): Promise<Mailbox[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error, mm.n, mm.unread
    FROM characters c
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = ${MAIL_JOB_KEY} AND j.owner_type = 'character' AND j.owner_id = c.character_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE NOT m.is_read)::int AS unread
      FROM mail_messages m WHERE m.character_id = c.character_id AND m.user_id = c.user_id
    ) mm ON true
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      granted: scopes.includes(MAIL_SCOPE),
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff:
        r.token_status === "active" && Array.isArray(r.disabled_scopes) && (r.disabled_scopes as string[]).includes(MAIL_SCOPE),
      grantedScopes: scopes,
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: toDate(r.last_success_at),
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      mails: num(r.n),
      unread: num(r.unread),
    };
  });
}

function scopeWhere(userId: string, characterId: number | null, alias: string): SQL {
  const a = sql.raw(alias);
  return characterId === null
    ? sql`${a}.user_id = ${userId}::uuid`
    : sql`${a}.user_id = ${userId}::uuid AND ${a}.character_id = ${characterId}`;
}

/** SQL condition on `m` (mail_messages) for a folder. */
export function folderWhere(folder: MailFolder): SQL {
  switch (folder.kind) {
    case "inbox":
      return sql`m.labels @> ARRAY[${BUILTIN_LABELS.inbox}]::bigint[]`;
    case "sent":
      return sql`m.from_id = m.character_id`;
    case "corp":
      return sql`m.labels @> ARRAY[${BUILTIN_LABELS.corp}]::bigint[]`;
    case "alliance":
      return sql`m.labels @> ARRAY[${BUILTIN_LABELS.alliance}]::bigint[]`;
    case "lists":
      return sql`m.recipients @> '[{"type":"mailing_list"}]'::jsonb`;
    case "list":
      return sql`m.recipients @> ${JSON.stringify([{ id: folder.id, type: "mailing_list" }])}::jsonb`;
    case "label":
      // Custom labels are per character; the same name on several characters counts as one label.
      return sql`EXISTS (SELECT 1 FROM mail_labels l WHERE l.user_id = m.user_id AND l.character_id = m.character_id
        AND l.name = ${folder.name} AND l.label_id = ANY(m.labels))`;
    default:
      return sql`true`;
  }
}

export interface FolderCounts {
  unread: Record<"all" | "inbox" | "sent" | "corp" | "alliance" | "lists", number>;
  lists: { id: number; name: string; unread: number }[];
  labels: { name: string; color: string | null; unread: number }[];
}

/** Unread counts per folder, mailing list and custom label (a mail in several mailboxes counts once). */
export async function getFolderCounts(userId: string, characterId: number | null): Promise<FolderCounts> {
  const db = getDb();
  const unreadIn = (folder: MailFolder) => sql`COUNT(DISTINCT m.mail_id) FILTER (WHERE NOT m.is_read AND ${folderWhere(folder)})::int`;
  const [totals, lists, labels] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT ${unreadIn({ kind: "all" })} AS all, ${unreadIn({ kind: "inbox" })} AS inbox, ${unreadIn({ kind: "sent" })} AS sent,
             ${unreadIn({ kind: "corp" })} AS corp, ${unreadIn({ kind: "alliance" })} AS alliance, ${unreadIn({ kind: "lists" })} AS lists
      FROM mail_messages m WHERE ${scopeWhere(userId, characterId, "m")}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT ml.mailing_list_id AS id, MIN(ml.name) AS name, COUNT(DISTINCT m.mail_id) FILTER (WHERE NOT m.is_read)::int AS unread
      FROM mail_lists ml
      LEFT JOIN mail_messages m ON m.user_id = ml.user_id AND m.character_id = ml.character_id
        AND m.recipients @> jsonb_build_array(jsonb_build_object('id', ml.mailing_list_id, 'type', 'mailing_list'))
      WHERE ${scopeWhere(userId, characterId, "ml")}
      GROUP BY ml.mailing_list_id ORDER BY MIN(ml.name)`),
    db.execute<Record<string, unknown>>(sql`
      SELECT l.name, MIN(l.color) AS color, COUNT(DISTINCT m.mail_id) FILTER (WHERE NOT m.is_read)::int AS unread
      FROM mail_labels l
      LEFT JOIN mail_messages m ON m.user_id = l.user_id AND m.character_id = l.character_id AND l.label_id = ANY(m.labels)
      WHERE ${scopeWhere(userId, characterId, "l")} AND l.label_id NOT IN (1, 2, 4, 8) AND l.name <> ''
      GROUP BY l.name ORDER BY l.name`),
  ]);
  const t = totals[0] ?? {};
  return {
    unread: {
      all: num(t.all),
      inbox: num(t.inbox),
      sent: num(t.sent),
      corp: num(t.corp),
      alliance: num(t.alliance),
      lists: num(t.lists),
    },
    lists: lists.map((r) => ({ id: num(r.id), name: String(r.name), unread: num(r.unread) })),
    labels: labels.map((r) => ({ name: String(r.name), color: labelColor(str(r.color)), unread: num(r.unread) })),
  };
}

/** Unread mail across all of the viewer's mailboxes (a mail in several mailboxes counts once). */
export async function getUnreadTotal(userId: string): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    SELECT COUNT(DISTINCT mail_id)::int AS n FROM mail_messages WHERE user_id = ${userId}::uuid AND NOT is_read`);
  return num(row?.n);
}

export interface NamedEntity {
  name: string;
  category: string | null;
}

export interface MailListItem {
  mailId: number;
  /** The mailbox the row comes from (the first one if several of yours have it). */
  characterId: number;
  /** All of your characters that have this mail. */
  characterIds: number[];
  fromId: number;
  from: NamedEntity | null;
  subject: string;
  sentAt: Date;
  unread: boolean;
  /** Sent by the character whose mailbox it is. */
  sent: boolean;
  labels: number[];
  recipients: MailRecipient[];
  preview: string;
  hasBody: boolean;
}

/** One page of mail, newest first; a mail in several of your mailboxes is listed once. */
export async function getMailList(
  userId: string,
  opts: { characterId: number | null; folder: MailFolder; q: string; page: number },
): Promise<{ items: MailListItem[]; total: number }> {
  const like = opts.q ? `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const search = like ? sql`AND (m.subject ILIKE ${like} OR e.name ILIKE ${like})` : sql``;
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH matched AS (
      SELECT m.*, e.name AS from_name, e.category AS from_category
      FROM mail_messages m
      LEFT JOIN eve_entities e ON e.id = m.from_id
      WHERE ${scopeWhere(userId, opts.characterId, "m")} AND ${folderWhere(opts.folder)} ${search}
    ), deduped AS (
      SELECT DISTINCT ON (mail_id) mail_id, character_id, from_id, from_name, from_category, subject, sent_at, labels, recipients,
             LEFT(body, 1500) AS snippet, body IS NOT NULL AS has_body,
             bool_or(NOT is_read) OVER (PARTITION BY mail_id) AS unread,
             bool_or(from_id = character_id) OVER (PARTITION BY mail_id) AS sent,
             array_agg(character_id) OVER (PARTITION BY mail_id) AS character_ids
      FROM matched
      ORDER BY mail_id, is_read, character_id
    )
    SELECT *, COUNT(*) OVER ()::int AS total FROM deduped
    ORDER BY sent_at DESC, mail_id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(opts.page - 1) * PAGE_SIZE}`);
  const items = rows.map((r) => ({
    mailId: num(r.mail_id),
    characterId: num(r.character_id),
    characterIds: [...new Set(numArray(r.character_ids))].sort((a, b) => a - b),
    fromId: num(r.from_id),
    from: r.from_name == null ? null : { name: String(r.from_name), category: str(r.from_category) },
    subject: String(r.subject ?? ""),
    sentAt: toDate(r.sent_at) ?? new Date(0),
    unread: Boolean(r.unread),
    sent: Boolean(r.sent),
    labels: numArray(r.labels),
    recipients: (Array.isArray(r.recipients) ? r.recipients : []) as MailRecipient[],
    // A snippet can end inside a tag; drop the cut-off tag rather than show it.
    preview: mailPreview(str(r.snippet)?.replace(/<[^>]*$/, "") ?? ""),
    hasBody: Boolean(r.has_body),
  }));
  return { items, total: rows.length ? num(rows[0].total) : 0 };
}

/** Names for recipients: entities from /universe/names, mailing lists from the viewer's subscriptions. */
export async function getRecipientNames(userId: string, recipients: MailRecipient[]): Promise<Map<string, NamedEntity>> {
  const db = getDb();
  const entityIds = [...new Set(recipients.filter((r) => r.type !== "mailing_list").map((r) => r.id))];
  const listIds = [...new Set(recipients.filter((r) => r.type === "mailing_list").map((r) => r.id))];
  const [entities, lists] = await Promise.all([
    entityIds.length
      ? db.select({ id: eveEntities.id, name: eveEntities.name, category: eveEntities.category }).from(eveEntities).where(inArray(eveEntities.id, entityIds))
      : [],
    listIds.length
      ? db
          .selectDistinctOn([mailLists.mailingListId], { id: mailLists.mailingListId, name: mailLists.name })
          .from(mailLists)
          .where(and(eq(mailLists.userId, userId), inArray(mailLists.mailingListId, listIds)))
      : [],
  ]);
  const out = new Map<string, NamedEntity>();
  for (const e of entities) out.set(`entity:${e.id}`, { name: e.name, category: e.category });
  for (const l of lists) out.set(`mailing_list:${l.id}`, { name: l.name, category: "mailing_list" });
  return out;
}

export const recipientKey = (r: MailRecipient) => (r.type === "mailing_list" ? `mailing_list:${r.id}` : `entity:${r.id}`);

export interface LinkContext {
  types: Map<number, { name: string; groupId: number; categoryId: number | null }>;
  entities: Map<number, NamedEntity>;
}

export interface OpenMail {
  mailId: number;
  characterId: number;
  characterIds: number[];
  fromId: number;
  from: NamedEntity | null;
  subject: string;
  sentAt: Date;
  isRead: boolean;
  labels: { id: number; name: string; color: string | null }[];
  recipients: MailRecipient[];
  names: Map<string, NamedEntity>;
  body: EveNode[] | null;
  links: LinkContext;
}

/** One mail of the viewer, with everything needed to render it; null if it isn't theirs (or is gone). */
export async function getMail(userId: string, characterId: number, mailId: number): Promise<OpenMail | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.userId, userId), eq(mailMessages.characterId, characterId), eq(mailMessages.mailId, mailId)));
  if (!row) return null;

  const body = row.body === null ? null : parseEveHtml(row.body);
  const ids = linkIds(body ? collectLinks(body) : []);
  const [siblings, labelRows, from, names, types, entities] = await Promise.all([
    db
      .select({ characterId: mailMessages.characterId })
      .from(mailMessages)
      .where(and(eq(mailMessages.userId, userId), eq(mailMessages.mailId, mailId))),
    row.labels.length
      ? db
          .select({ labelId: mailLabels.labelId, name: mailLabels.name, color: mailLabels.color })
          .from(mailLabels)
          .where(and(eq(mailLabels.userId, userId), eq(mailLabels.characterId, characterId), inArray(mailLabels.labelId, row.labels)))
      : [],
    db.select({ name: eveEntities.name, category: eveEntities.category }).from(eveEntities).where(eq(eveEntities.id, row.fromId)),
    getRecipientNames(userId, row.recipients),
    ids.typeIds.length
      ? db
          .select({ typeId: eveTypes.typeId, name: eveTypes.name, groupId: eveTypes.groupId, categoryId: eveGroups.categoryId })
          .from(eveTypes)
          .leftJoin(eveGroups, eq(eveGroups.groupId, eveTypes.groupId))
          .where(inArray(eveTypes.typeId, ids.typeIds))
      : [],
    ids.itemIds.length
      ? db.select({ id: eveEntities.id, name: eveEntities.name, category: eveEntities.category }).from(eveEntities).where(inArray(eveEntities.id, ids.itemIds))
      : [],
  ]);
  const labelById = new Map(labelRows.map((l) => [l.labelId, { name: l.name, color: labelColor(l.color) }]));

  return {
    mailId,
    characterId,
    characterIds: siblings.map((s) => s.characterId).sort((a, b) => a - b),
    fromId: row.fromId,
    from: from[0] ? { name: from[0].name, category: from[0].category } : null,
    subject: row.subject,
    sentAt: row.sentAt,
    isRead: row.isRead,
    labels: row.labels.map((id) => ({ id, name: labelById.get(id)?.name ?? "", color: labelById.get(id)?.color ?? null })),
    recipients: row.recipients,
    names,
    body,
    links: {
      types: new Map(types.map((t) => [t.typeId, { name: t.name, groupId: t.groupId, categoryId: t.categoryId }])),
      entities: new Map(entities.map((e) => [e.id, { name: e.name, category: e.category }])),
    },
  };
}

/** Custom labels of the viewer's mailboxes, keyed `characterId:labelId` (built-in labels are folders). */
export async function getLabelMap(userId: string): Promise<Map<string, { name: string; color: string | null }>> {
  const rows = await getDb()
    .select({ characterId: mailLabels.characterId, labelId: mailLabels.labelId, name: mailLabels.name, color: mailLabels.color })
    .from(mailLabels)
    .where(eq(mailLabels.userId, userId));
  return new Map(
    rows
      .filter((r) => !BUILTIN_LABEL_IDS.has(r.labelId) && r.name)
      .map((r) => [`${r.characterId}:${r.labelId}`, { name: r.name, color: labelColor(r.color) }]),
  );
}

/** How old a mail may be and still be announced live (the first import of a mailbox brings older ones). */
const LIVE_MAX_AGE_HOURS = 3;
const LIVE_LIMIT = 10;

export interface LiveMail {
  mailId: number;
  /** The mailbox it arrived in: one of the viewer's characters. */
  characterId: number;
  characterName: string | null;
  fromId: number;
  fromName: string | null;
  /** /universe/names category of the sender, for the avatar. */
  fromCategory: string | null;
  subject: string;
  sentAt: string;
  /** Who it was addressed to: the character itself, its corporation or alliance, or a mailing list. */
  kind: "direct" | "corp" | "alliance" | "list";
  listName: string | null;
}

/**
 * Unread mail the worker stored after the cursor (oldest first), for the live
 * notifications. A mail in several of the viewer's mailboxes is announced once
 * (with the mailbox that got it first), and mail the viewer sent from one of
 * their own characters not at all.
 */
export async function getLiveMail(userId: string, since: LiveCursor): Promise<{ mails: LiveMail[]; cursor: string }> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT m.mail_id, m.character_id, c.name AS character_name, m.from_id, e.name AS from_name, e.category AS from_category,
           m.subject, m.sent_at, m.labels, m.recipients,
           to_char(m.first_seen_at AT TIME ZONE 'UTC', ${CURSOR_FORMAT}) AS seen,
           (SELECT ml.name FROM mail_lists ml, jsonb_array_elements(m.recipients) r
            WHERE ml.user_id = m.user_id AND ml.character_id = m.character_id
              AND r->>'type' = 'mailing_list' AND (r->>'id')::bigint = ml.mailing_list_id
            LIMIT 1) AS list_name
    FROM mail_messages m
    LEFT JOIN characters c ON c.character_id = m.character_id
    LEFT JOIN eve_entities e ON e.id = m.from_id
    WHERE m.user_id = ${userId}::uuid
      AND (m.first_seen_at, m.mail_id) > (${since.at}::timestamptz, ${since.id})
      AND m.sent_at > now() - make_interval(hours => ${LIVE_MAX_AGE_HOURS})
      AND NOT m.is_read
      -- Sent by one of the account's own characters, whether or not that character shares its mail.
      AND NOT EXISTS (SELECT 1 FROM characters own WHERE own.user_id = m.user_id AND own.character_id = m.from_id)
      AND NOT EXISTS (
        SELECT 1 FROM mail_messages o
        WHERE o.user_id = m.user_id AND o.mail_id = m.mail_id
          AND (o.first_seen_at, o.character_id) < (m.first_seen_at, m.character_id)
      )
    ORDER BY m.first_seen_at, m.mail_id
    LIMIT ${LIVE_LIMIT}`);
  const mails = rows.map((r): LiveMail => {
    const labels = numArray(r.labels);
    const recipients = (Array.isArray(r.recipients) ? r.recipients : []) as MailRecipient[];
    const kind = recipients.some((x) => x.type === "mailing_list")
      ? "list"
      : labels.includes(BUILTIN_LABELS.corp)
        ? "corp"
        : labels.includes(BUILTIN_LABELS.alliance)
          ? "alliance"
          : "direct";
    return {
      mailId: num(r.mail_id),
      characterId: num(r.character_id),
      characterName: str(r.character_name),
      fromId: num(r.from_id),
      fromName: str(r.from_name),
      fromCategory: str(r.from_category),
      subject: String(r.subject ?? ""),
      sentAt: (toDate(r.sent_at) ?? new Date(0)).toISOString(),
      kind,
      listName: str(r.list_name),
    };
  });
  const last = rows.at(-1);
  return { mails, cursor: formatLiveCursor(last ? { at: String(last.seen), id: num(last.mail_id) } : since) };
}
