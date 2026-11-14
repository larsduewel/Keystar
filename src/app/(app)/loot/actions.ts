"use server";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/core/auth/dal";
import { getDb, lootOperations, fleetTrackers } from "@/core/db";
import { emptyLedger } from "@/modules/loot/types";
import { parseLoot, settlement } from "@/modules/loot/model";
const money = z.number().finite().min(0).max(1e15);
const name = z.string().trim().min(1).max(100);
const command = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("participant"),
    name,
    payee: z.string().trim().max(100),
    weight: z.number().finite().min(0).max(100),
  }),
  z.object({
    kind: z.literal("eligibility"),
    id: z.string().uuid(),
    eligible: z.boolean(),
  }),
  z.object({
    kind: z.literal("participantEdit"),
    id: z.string().uuid(),
    payee: name,
    weight: z.number().finite().min(0).max(100),
    paid: money,
  }),
  z.object({
    kind: z.literal("import"),
    text: z.string().min(1).max(200000),
    collector: z.string().trim().max(100),
    day: z.iso.date().optional(),
  }),
  z.object({
    kind: z.literal("item"),
    id: z.string().uuid(),
    status: z.enum(["collected", "handed", "sold", "retained", "excluded"]),
    proceeds: money.nullable(),
    retainedBy: z.string().uuid().nullable(),
    price: money.nullable(),
    killmailId: z.number().int().positive().nullable(),
    match: z.enum(["unmatched", "possible", "confirmed", "disputed"]),
  }),
  z.object({
    kind: z.literal("settings"),
    expenses: money,
    corpPercent: z.number().finite().min(0).max(100),
    basis: z.enum(["estimate", "sales"]),
    splitMode: z.enum(["equal", "atLoot"]).optional(),
    shared: z.boolean(),
  }),
  z.object({
    kind: z.literal("killmails"),
    ids: z
      .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
      .max(30),
  }),
  z.object({ kind: z.literal("removeKill"), id: z.number().int().positive() }),
  z.object({
    kind: z.literal("linkFleet"),
    characterId: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("sync") }),
  z.object({ kind: z.literal("close"), closed: z.boolean() }),
]);
export type LootCommand = z.infer<typeof command>;
export async function createLootOperation(input: {
  title: string;
  start: string;
  end: string;
  fleetId: number | null;
}) {
  const user = await assertPermission("loot.view");
  const data = z
    .object({
      title: name,
      start: z.iso.datetime(),
      end: z.iso.datetime(),
      fleetId: z.number().int().positive().nullable(),
    })
    .parse(input);
  const start = new Date(data.start),
    end = new Date(data.end);
  if (end <= start || end.getTime() - start.getTime() > 7 * 86400000)
    throw new Error("window");
  if (data.fleetId) {
    const trackers = await getDb()
      .select()
      .from(fleetTrackers)
      .where(
        and(
          eq(fleetTrackers.userId, user.id),
          eq(fleetTrackers.fleetId, data.fleetId),
        ),
      );
    if (!trackers.length && !user.can("fleet.view"))
      throw new Error("fleet access");
  }
  const id = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    const recent = await tx
      .select({ id: lootOperations.id })
      .from(lootOperations)
      .where(
        and(
          eq(lootOperations.ownerId, user.id),
          gte(lootOperations.createdAt, new Date(Date.now() - 86400000)),
        ),
      );
    if (recent.length >= 20) throw new Error("limit");
    const [op] = await tx
      .insert(lootOperations)
      .values({
        ownerId: user.id,
        title: data.title,
        startsAt: start,
        endsAt: end,
        fleetId: data.fleetId,
        ledger: { ...emptyLedger(), splitMode: "atLoot" },
      })
      .returning({ id: lootOperations.id });
    return op.id;
  });
  revalidatePath("/loot");
  return id;
}
export async function updateLootOperation(
  id: string,
  revision: number,
  input: LootCommand,
) {
  const user = await assertPermission("loot.view");
  z.string().uuid().parse(id);
  z.number().int().min(0).parse(revision);
  const c = command.parse(input);
  await getDb().transaction(async (tx) => {
    const [op] = await tx
      .select()
      .from(lootOperations)
      .where(eq(lootOperations.id, id))
      .for("update");
    if (!op || op.ownerId !== user.id) throw new Error("access");
    if (op.revision !== revision) throw new Error("conflict");
    if (op.closed && c.kind !== "close") throw new Error("closed");
    const ledger = op.ledger;
    let linkedFleetId = op.fleetId;
    if (c.kind === "linkFleet") {
      if (!user.characterIds.includes(c.characterId)) throw new Error("access");
      const [tracker] = await tx
        .select()
        .from(fleetTrackers)
        .where(
          and(
            eq(fleetTrackers.characterId, c.characterId),
            eq(fleetTrackers.userId, user.id),
          ),
        );
      if (!tracker?.fleetId || tracker.status !== "tracking")
        throw new Error("fleet access");
      linkedFleetId = tracker.fleetId;
      ledger.splitMode = "atLoot";
      // Visits from a previously linked fleet must never affect the new fleet's split.
      ledger.participants.forEach((p) => (p.attendance = []));
    }

    if (c.kind === "participant") {
      if (
        ledger.participants.length >= 256 ||
        ledger.participants.some(
          (p) => p.name.toLowerCase() === c.name.toLowerCase(),
        )
      )
        throw new Error("duplicate");
      ledger.participants.push({
        id: randomUUID(),
        name: c.name,
        characterId: null,
        payee: c.payee || c.name,
        weight: c.weight,
        paid: 0,
        source: "manual",
      });
    }
    if (c.kind === "eligibility") {
      const p = ledger.participants.find((p) => p.id === c.id);
      if (!p) throw new Error("participant");
      p.eligible = c.eligible;
    }
    if (c.kind === "participantEdit") {
      const p = ledger.participants.find((p) => p.id === c.id);
      if (!p) throw new Error("participant");
      Object.assign(p, { payee: c.payee, weight: c.weight, paid: c.paid });
    }
    if (c.kind === "import") {
      const rows = parseLoot(c.text, c.collector, c.day);
      if (!rows.length) throw new Error("empty");
      if (
        rows.some(
          (row) =>
            row.time &&
            (Date.parse(row.time) < op.startsAt.getTime() ||
              Date.parse(row.time) > op.endsAt.getTime()),
        )
      )
        throw new Error("window");
      const hash = createHash("sha256")
        .update(JSON.stringify(rows))
        .digest("hex");
      if (ledger.imports.includes(hash)) throw new Error("duplicate");
      const occurrences = new Map<string, number>();
      for (const row of rows) {
        const base = JSON.stringify([
          row.time,
          row.collector.toLowerCase(),
          row.name.toLowerCase(),
          row.quantity,
        ]);
        const n = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, n);
        const key = createHash("sha256")
          .update(row.time ? `${base}:${n}` : `${hash}:${base}:${n}`)
          .digest("hex");
        if (ledger.items.some((i) => i.importKey === key)) continue;
        ledger.items.push({
          ...row,
          id: randomUUID(),
          typeId: null,
          price: null,
          pricedAt: null,
          status: "collected",
          proceeds: null,
          retainedBy: null,
          killmailId: null,
          match: "unmatched",
          candidates: [],
          importKey: key,
        });
        if (
          !ledger.participants.some(
            (p) => p.name.toLowerCase() === row.collector.toLowerCase(),
          )
        )
          ledger.participants.push({
            id: randomUUID(),
            name: row.collector,
            characterId: null,
            payee: row.collector,
            weight: 1,
            paid: 0,
            source: "loot",
          });
      }
      if (
        ledger.items.length > 2000 ||
        ledger.participants.length > 256 ||
        ledger.imports.length >= 100
      )
        throw new Error("limit");
      ledger.imports.push(hash);
    }
    if (c.kind === "item") {
      const item = ledger.items.find((i) => i.id === c.id);
      if (!item) throw new Error("item");
      if (c.status === "sold" && c.proceeds === null)
        throw new Error("proceeds");
      if (
        c.status === "retained" &&
        !ledger.participants.some((p) => p.id === c.retainedBy)
      )
        throw new Error("recipient");
      if (c.match === "confirmed") {
        const kill = ledger.kills.find((k) => k.id === c.killmailId);
        const dropped =
          kill?.items
            .filter((d) => d.typeId === item.typeId)
            .reduce((s, d) => s + d.quantity, 0) ?? 0;
        const allocated = ledger.items
          .filter(
            (i) =>
              i.id !== item.id &&
              i.match === "confirmed" &&
              i.killmailId === c.killmailId &&
              i.typeId === item.typeId,
          )
          .reduce((s, i) => s + i.quantity, 0);
        if (item.time && kill && Date.parse(kill.time) > Date.parse(item.time))
          throw new Error("time");
        if (dropped < allocated + item.quantity) throw new Error("allocation");
      }
      Object.assign(item, {
        status: c.status,
        proceeds: c.status === "sold" ? c.proceeds : null,
        retainedBy: c.status === "retained" ? c.retainedBy : null,
        killmailId: c.killmailId,
        match: c.match,
      });
      if (c.price !== item.price) {
        item.price = c.price;
        item.pricedAt = new Date().toISOString();
      }
    }
    if (c.kind === "removeKill") {
      if (
        ledger.items.some(
          (i) => i.match === "confirmed" && i.killmailId === c.id,
        )
      )
        throw new Error("allocation");
      ledger.killIds = ledger.killIds.filter((id) => id !== c.id);
      ledger.kills = ledger.kills.filter((k) => k.id !== c.id);
    }
    if (c.kind === "settings")
      Object.assign(ledger, {
        expenses: c.expenses,
        corpPercent: c.corpPercent,
        basis: c.basis,
        splitMode: c.splitMode ?? ledger.splitMode ?? "equal",
      });
    if (c.kind === "killmails")
      ledger.killIds = [...new Set([...ledger.killIds, ...c.ids])];
    if (ledger.killIds.length > 100) throw new Error("limit");
    if (new Set(ledger.items.map((i) => i.name.toLowerCase())).size > 500)
      throw new Error("types limit");
    if (
      ledger.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0) > 1e15
    )
      throw new Error("value limit");
    if (c.kind === "close" && c.closed) {
      const totals = settlement(ledger);
      if (
        totals.unallocated ||
        totals.missing ||
        totals.shortfall ||
        !totals.shares.some((p) => p.weight > 0)
      )
        throw new Error("provisional");
    }
    ledger.audit.push({ at: new Date().toISOString(), action: c.kind });
    ledger.audit = ledger.audit.slice(-200);
    const sync = [
      "sync",
      "import",
      "participant",
      "killmails",
      "linkFleet",
    ].includes(c.kind);
    if (
      c.kind === "sync" &&
      op.syncedAt &&
      Date.now() - op.syncedAt.getTime() < 60000
    )
      throw new Error("cooldown");
    await tx
      .update(lootOperations)
      .set({
        ledger,
        fleetId: linkedFleetId,
        revision: op.revision + 1,
        updatedAt: new Date(),
        shared: c.kind === "settings" ? c.shared : op.shared,
        closed: c.kind === "close" ? c.closed : op.closed,
        syncStatus: sync ? "pending" : op.syncStatus,
      })
      .where(eq(lootOperations.id, id));
  });
  revalidatePath(`/loot/${id}`);
  revalidatePath("/loot");
}

/** Expected import failures are returned explicitly because production Next hides thrown messages. */
export async function importLootOperation(
  id: string,
  revision: number,
  input: Extract<LootCommand, { kind: "import" }>,
) {
  try {
    await updateLootOperation(id, revision, input);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const line = /^line:(\d+)$/.exec(message);
    if (line)
      return {
        ok: false as const,
        code: "line" as const,
        line: Number(line[1]),
      };
    const code = (
      ["date", "window", "duplicate", "conflict", "limit", "closed"] as const
    ).find((code) => code === message);
    return {
      ok: false as const,
      code: code ?? ("generic" as const),
      line: undefined,
    };
  }
}
