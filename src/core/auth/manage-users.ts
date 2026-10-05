import { and, eq, notExists, or, sql } from "drizzle-orm";
import { auditInTx, type AuditEntry } from "@/core/audit";
import { characters, eveCorporations, getDb, sessions, users, type Db } from "@/core/db";
import { allPermissions } from "@/core/modules/registry";
import { permissionsForRole } from "@/core/rbac/permissions";
import { assignableRoles, canManageRole, type Role } from "@/core/rbac/roles";
import { getSettings } from "@/core/settings";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Advisory lock id that serialises provisioning (first-admin bootstrap, linking) and role or access changes. */
const USERS_LOCK = 727_275;

/** Takes the transaction-scoped lock shared by sign-in provisioning and user management. */
export async function lockUsers(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${USERS_LOCK})`);
}

export type UserAccessChange = { role: Role } | { isDisabled: boolean };

/** Why `changeUserAccess` refused a change; the UI translates the code. */
export type UserAccessErrorCode = "self" | "forbidden" | "notFound" | "higherRole" | "unassignable";

export class UserAccessError extends Error {
  constructor(
    readonly code: UserAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UserAccessError";
  }
}

/**
 * Applies a manager's change to another user's role or disabled flag; disabling
 * also signs the user out everywhere.
 *
 * The caller has checked the permission against the actor as read at the start
 * of the request. Here the actor and the target are read again under the users
 * lock and `users.manage` is checked again, so concurrent changes are judged
 * against what the others committed: two admins demoting or disabling each other
 * at once can't both succeed, an enabled admin always remains, and a manager
 * demoted mid-request can't finish the change. With `onlyFromRole`, a target
 * whose role is no longer that one is left alone (`changed: false`). `audit`
 * builds the audit entry, written in the same transaction as the change.
 */
export async function changeUserAccess(
  actorId: string,
  targetId: string,
  change: UserAccessChange,
  opts: { onlyFromRole?: Role; audit?: (from: Role) => AuditEntry } = {},
): Promise<{ from: Role; changed: boolean }> {
  if (actorId === targetId) throw new UserAccessError("self", "You can't change your own access");
  const overrides = (await getSettings())["permissions.overrides"];
  return getDb().transaction(async (tx) => {
    await lockUsers(tx);
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
    if (!actor || actor.isDisabled || !permissionsForRole(actor.role, allPermissions(), overrides).has("users.manage")) {
      throw new UserAccessError("forbidden", "You do not have permission to do that");
    }
    const [target] = await tx.select().from(users).where(eq(users.id, targetId));
    if (!target) throw new UserAccessError("notFound", "User not found");
    if (opts.onlyFromRole && target.role !== opts.onlyFromRole) return { from: target.role, changed: false };
    if (!canManageRole(actor.role, target.role)) throw new UserAccessError("higherRole", "You can only manage users below your own role");
    if ("role" in change && !assignableRoles(actor.role).includes(change.role)) {
      throw new UserAccessError("unassignable", "You can't assign that role");
    }
    await tx
      .update(users)
      .set({ ...change, updatedAt: new Date() })
      .where(eq(users.id, targetId));
    if ("isDisabled" in change && change.isDisabled) await tx.delete(sessions).where(eq(sessions.userId, targetId));
    if (opts.audit) await auditInTx(tx, opts.audit(target.role));
    return { from: target.role, changed: true };
  });
}

/**
 * Enabled guests none of whose characters is in the home corporation (or its
 * alliance, when alliance members are auto-approved): the accounts that
 * restricting sign-ups to members would have refused. Empty while no home
 * corporation is configured, since then nobody counts as a member.
 */
export async function outsideGuestIds(): Promise<string[]> {
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  if (!home) return [];
  const db = getDb();
  const [corp] = await db
    .select({ allianceId: eveCorporations.allianceId })
    .from(eveCorporations)
    .where(eq(eveCorporations.corporationId, home));
  const homeAlliance = settings["access.autoApproveAllianceMembers"] ? (corp?.allianceId ?? null) : null;
  const member = homeAlliance
    ? or(eq(characters.corporationId, home), eq(characters.allianceId, homeAlliance))
    : eq(characters.corporationId, home);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "guest"),
        eq(users.isDisabled, false),
        notExists(
          db
            .select({ one: sql`1` })
            .from(characters)
            .where(and(eq(characters.userId, users.id), member)),
        ),
      ),
    );
  return rows.map((r) => r.id);
}
