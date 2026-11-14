import { randomUUID } from "node:crypto";
import { and, sql, eq, gte, or, isNotNull, lte, inArray } from "drizzle-orm";
import {
  lootOperations,
  fleetMembers,
  fleetAttendance,
  eveEntities,
  typeValues,
  getDb,
} from "@/core/db";
import { env } from "@/core/env";
import { ensureNames } from "@/core/eve/resolver";
import {
  resolveTypeNames,
  jitaPrices,
} from "@/modules/trade/appraisal/appraise";
import { matchLoot, flattenedLootItems } from "./model";
import { ZkillClient, type ZkillKillmail } from "@/modules/killboard/zkill";
import type { JobDefinition } from "@/core/sync/types";
export const lootJob: JobDefinition = {
  key: "loot.sync",
  label: (t) => t.loot.syncJob,
  module: "loot",
  owner: "global",
  intervalSeconds: 30,
  async run({ db, esi, log }) {
    const operations = await db
      .select()
      .from(lootOperations)
      .where(
        and(
          eq(lootOperations.closed, false),
          or(
            eq(lootOperations.syncStatus, "pending"),
            and(
              isNotNull(lootOperations.fleetId),
              gte(lootOperations.endsAt, new Date(Date.now() - 120000)),
            ),
          ),
        ),
      )
      .orderBy(sql`${lootOperations.syncedAt} ASC NULLS FIRST`)
      .limit(3);
    for (const op of operations)
      try {
        const ledger = op.ledger;
        if (op.fleetId) {
          const rows = await db
            .select({
              characterId: fleetMembers.characterId,
              name: eveEntities.name,
            })
            .from(fleetMembers)
            .leftJoin(eveEntities, eq(eveEntities.id, fleetMembers.characterId))
            .where(
              and(
                eq(fleetMembers.fleetId, op.fleetId),
                gte(fleetMembers.lastSeenAt, op.startsAt),
                lte(fleetMembers.firstSeenAt, op.endsAt),
              ),
            );
          for (const row of rows)
            if (
              row.name &&
              !ledger.participants.some(
                (p) =>
                  p.characterId === row.characterId ||
                  p.name.toLowerCase() === row.name!.toLowerCase(),
              )
            )
              ledger.participants.push({
                id: randomUUID(),
                name: row.name,
                characterId: row.characterId,
                payee: row.name,
                weight: 1,
                paid: 0,
                source: "fleet",
              });
        }
        const unresolved = ledger.participants.filter(
          (p) => p.characterId === null,
        );
        if (unresolved.length) {
          const res = await esi.post<{
            characters?: { id: number; name: string }[];
          }>(
            "/universe/ids",
            unresolved.map((p) => p.name),
          );
          for (const p of unresolved) {
            const found = res.data.characters?.find(
              (c) => c.name.toLowerCase() === p.name.toLowerCase(),
            );
            if (found) p.characterId = found.id;
          }
        }
        if (op.fleetId) {
          const visits = await db
            .select()
            .from(fleetAttendance)
            .where(
              and(
                eq(fleetAttendance.fleetId, op.fleetId),
                lte(fleetAttendance.joinedAt, op.endsAt),
                gte(fleetAttendance.lastSeenAt, op.startsAt),
              ),
            );
          ledger.attendanceFrom = visits.length
            ? new Date(
                Math.min(...visits.map((v) => v.firstSeenAt.getTime())),
              ).toISOString()
            : undefined;
          for (const participant of ledger.participants)
            participant.attendance = visits
              .filter((v) => v.characterId === participant.characterId)
              .map((v) => ({
                joined: v.joinedAt.toISOString(),
                lastSeen: v.lastSeenAt.toISOString(),
                left: v.leftAt?.toISOString() ?? null,
                stopped: v.endReason === "tracking_stopped",
              }));
        }
        const names = [
          ...new Set(
            ledger.items.filter((i) => i.typeId === null).map((i) => i.name),
          ),
        ];
        const types = names.length
          ? await resolveTypeNames(names)
          : new Map<string, number>();
        for (const item of ledger.items)
          if (!item.typeId)
            item.typeId = types.get(item.name.toLowerCase()) ?? null;
        const ids = [
          ...new Set(
            ledger.items
              .filter((i) => i.price === null && i.typeId)
              .map((i) => i.typeId!),
          ),
        ];
        if (ids.length) await jitaPrices(ids);
        const snapshots = ids.length
          ? await db
              .select()
              .from(typeValues)
              .where(
                and(
                  inArray(typeValues.typeId, ids),
                  eq(typeValues.source, "jita_sell"),
                  eq(typeValues.basis, "direct"),
                ),
              )
          : [];
        const prices = new Map(snapshots.map((p) => [p.typeId, p]));
        for (const item of ledger.items)
          if (item.price === null && item.typeId) {
            const snapshot = prices.get(item.typeId);
            const sell = snapshot?.unitPrice ?? null;
            if (sell !== null && sell * item.quantity <= 1e15) {
              item.price = sell;
              item.pricedAt = snapshot!.updatedAt.toISOString();
            }
          }
        const client = new ZkillClient({
          userAgent: `KeyStar fleet loot (${env().ESI_CONTACT}; +${env().SOURCE_URL})`,
          minIntervalMs: 200,
        });
        let killFailed = false;
        for (const id of ledger.killIds
          .filter((id) => !ledger.kills.some((k) => k.id === id))
          .slice(0, 5)) {
          try {
            const listing = await client.getJson(`/api/killID/${id}/`);
            const reference = Array.isArray(listing)
              ? listing.find((k) => k?.killmail_id === id)
              : null;
            if (
              !reference?.zkb?.hash ||
              !/^[-a-zA-Z0-9]+$/.test(reference.zkb.hash)
            )
              throw new Error("killmail unavailable");
            const res = await esi.get<
              Omit<ZkillKillmail, "killmail_id" | "zkb">
            >(`/killmails/${id}/${reference.zkb.hash}/`);
            const kill = res.data,
              time = Date.parse(kill.killmail_time);
            if (
              !Number.isFinite(time) ||
              time < op.startsAt.getTime() ||
              time > op.endsAt.getTime()
            )
              throw new Error("killmail outside operation");
            const drops = new Map<number, number>();
            for (const item of flattenedLootItems(kill.victim.items ?? []))
              if ((item.quantity_dropped ?? 0) > 0)
                drops.set(
                  item.item_type_id,
                  (drops.get(item.item_type_id) ?? 0) + item.quantity_dropped!,
                );
            ledger.kills.push({
              id,
              time: kill.killmail_time,
              victim: kill.victim.character_id ?? null,
              items: [...drops].map(([typeId, quantity]) => ({
                typeId,
                quantity,
              })),
            });
          } catch (error) {
            killFailed = true;
            log.warn("Loot killmail unavailable", { id, error: String(error) });
          }
        }
        ledger.items = matchLoot(ledger.items, ledger, op.endsAt.getTime());
        await ensureNames(
          ledger.participants.flatMap((p) =>
            p.characterId ? [p.characterId] : [],
          ),
        );
        const outstanding = ledger.killIds.some(
          (id) => !ledger.kills.some((k) => k.id === id),
        );
        await db
          .update(lootOperations)
          .set({
            ledger,
            syncStatus: killFailed
              ? "failed"
              : outstanding
                ? "pending"
                : "ready",
            syncedAt: new Date(),
            revision: op.revision + 1,
          })
          .where(
            and(
              eq(lootOperations.id, op.id),
              eq(lootOperations.revision, op.revision),
              eq(lootOperations.closed, false),
            ),
          );
      } catch (error) {
        log.warn("Fleet loot sync failed", { id: op.id, error: String(error) });
        await getDb()
          .update(lootOperations)
          .set({ syncStatus: "failed", syncedAt: new Date() })
          .where(
            and(
              eq(lootOperations.id, op.id),
              eq(lootOperations.revision, op.revision),
            ),
          );
      }
    return { summary: `Checked ${operations.length} loot operations` };
  },
};
