import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import type { EsiFleet, EsiFleetMember, EsiFleetWing } from "./logic";
import { toWings } from "./logic";
import { fleetMembers, fleets, fleetAttendance } from "./schema";

/**
 * Stores one poll of a fleet: the fleet itself, everyone currently in it, and
 * marks members who were in the previous poll but not this one as left.
 */
export async function recordFleetSnapshot(
  db: Db,
  snapshot: {
    fleetId: number;
    bossCharacterId: number;
    fleet: EsiFleet;
    members: EsiFleetMember[];
    wings: EsiFleetWing[];
  },
  now: Date,
): Promise<void> {
  const { fleetId } = snapshot;
  await db.transaction(async (tx) => {
    await tx
      .insert(fleets)
      .values({
        fleetId,
        bossCharacterId: snapshot.bossCharacterId,
        motd: snapshot.fleet.motd ?? "",
        isFreeMove: snapshot.fleet.is_free_move,
        wings: toWings(snapshot.wings),
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: fleets.fleetId,
        set: {
          bossCharacterId: snapshot.bossCharacterId,
          motd: sql`excluded.motd`,
          isFreeMove: sql`excluded.is_free_move`,
          wings: sql`excluded.wings`,
          lastSeenAt: now,
          endedAt: null,
        },
      });

    if (snapshot.members.length) {
      await tx
        .insert(fleetMembers)
        .values(
          snapshot.members.map((m) => ({
            fleetId,
            characterId: m.character_id,
            joinTime: new Date(m.join_time),
            role: m.role,
            wingId: m.wing_id,
            squadId: m.squad_id,
            shipTypeId: m.ship_type_id,
            solarSystemId: m.solar_system_id,
            takesFleetWarp: m.takes_fleet_warp,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [fleetMembers.fleetId, fleetMembers.characterId],
          set: {
            joinTime: sql`excluded.join_time`,
            role: sql`excluded.role`,
            wingId: sql`excluded.wing_id`,
            squadId: sql`excluded.squad_id`,
            shipTypeId: sql`excluded.ship_type_id`,
            solarSystemId: sql`excluded.solar_system_id`,
            takesFleetWarp: sql`excluded.takes_fleet_warp`,
            lastSeenAt: now,
            leftAt: null,
          },
        });
    }

    if (snapshot.members.length)
      await tx
        .insert(fleetAttendance)
        .values(
          snapshot.members.map((m) => ({
            fleetId,
            characterId: m.character_id,
            joinedAt: new Date(m.join_time),
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            fleetAttendance.fleetId,
            fleetAttendance.characterId,
            fleetAttendance.joinedAt,
          ],
          set: { lastSeenAt: now, leftAt: null, endReason: null },
        });
    await tx
      .update(fleetAttendance)
      .set({ leftAt: now, endReason: "left" })
      .where(
        and(
          eq(fleetAttendance.fleetId, fleetId),
          isNull(fleetAttendance.leftAt),
          lt(fleetAttendance.lastSeenAt, now),
        ),
      );

    // Everyone not in this poll has left since the previous one.
    await tx
      .update(fleetMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(fleetMembers.fleetId, fleetId),
          isNull(fleetMembers.leftAt),
          lt(fleetMembers.lastSeenAt, now),
        ),
      );
  });
}

/** Marks a fleet and everyone still in it as gone (the boss left or tracking stopped). */
export async function closeFleet(
  db: Db,
  fleetId: number,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(fleetAttendance)
      .set({
        leftAt: sql`${fleetAttendance.lastSeenAt}`,
        endReason: "tracking_stopped",
      })
      .where(
        and(
          eq(fleetAttendance.fleetId, fleetId),
          isNull(fleetAttendance.leftAt),
        ),
      );
    await tx
      .update(fleets)
      .set({ endedAt: now })
      .where(and(eq(fleets.fleetId, fleetId), isNull(fleets.endedAt)));
    await tx
      .update(fleetMembers)
      .set({ leftAt: now })
      .where(
        and(eq(fleetMembers.fleetId, fleetId), isNull(fleetMembers.leftAt)),
      );
  });
}
