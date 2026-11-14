import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  getDb,
  closeDb,
  fleetAttendance,
  fleets,
  fleetMembers,
} from "@/core/db";
import { runMigrations } from "@/scripts/migrate";
import { recordFleetSnapshot, closeFleet } from "@/modules/fleet/sync";
const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)("fleet attendance persistence", () => {
  const fleetId = 987654321234;
  const snapshot = (join: string | null) => ({
    fleetId,
    bossCharacterId: 1,
    fleet: {
      is_free_move: false,
      is_registered: false,
      is_voice_enabled: false,
      motd: "",
    },
    wings: [],
    members: join
      ? [
          {
            character_id: 1,
            join_time: `2026-11-14T${join}:00Z`,
            role: "squad_member" as const,
            role_name:"Squad Member",
            ship_type_id: 1,
            solar_system_id: 1,
            squad_id: 1,
            wing_id: 1,
            takes_fleet_warp: true,
          },
        ]
      : [],
  });
  const at = (clock: string) => new Date(`2026-11-14T${clock}:00Z`);
  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
    await getDb()
      .delete(fleetAttendance)
      .where(eq(fleetAttendance.fleetId, fleetId));
  });
  afterAll(async () => {
    if (!enabled) return;
    await getDb()
      .delete(fleetAttendance)
      .where(eq(fleetAttendance.fleetId, fleetId));
    await getDb().delete(fleetMembers).where(eq(fleetMembers.fleetId, fleetId));
    await getDb().delete(fleets).where(eq(fleets.fleetId, fleetId));
    await closeDb();
  });
  it("preserves separate visits instead of overwriting the first join and leave", async () => {
    await recordFleetSnapshot(getDb(), snapshot("18:00"), at("18:01"));
    await recordFleetSnapshot(getDb(), snapshot(null), at("18:05"));
    await recordFleetSnapshot(getDb(), snapshot("18:10"), at("18:11"));
    const rows = await getDb()
      .select()
      .from(fleetAttendance)
      .where(eq(fleetAttendance.fleetId, fleetId))
      .orderBy(fleetAttendance.joinedAt);
    expect(rows).toHaveLength(2);
    expect(rows[0].joinedAt).toEqual(at("18:00"));
    expect(rows[0].leftAt).toEqual(at("18:05"));
    expect(rows[1].joinedAt).toEqual(at("18:10"));
    expect(rows[1].leftAt).toBeNull();
  });
  it("does not claim continued attendance after tracking stops", async () => {
    await closeFleet(getDb(), fleetId, at("18:15"));
    const rows = await getDb()
      .select()
      .from(fleetAttendance)
      .where(eq(fleetAttendance.fleetId, fleetId))
      .orderBy(fleetAttendance.joinedAt);
    expect(rows[1].leftAt).toEqual(at("18:11"));
    expect(rows[1].endReason).toBe("tracking_stopped");
  });
});
