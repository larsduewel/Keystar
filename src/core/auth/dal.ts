import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { characters, getDb, users } from "@/core/db";
import { allPermissions } from "@/core/modules/registry";
import { permissionsForRole } from "@/core/rbac/permissions";
import type { Role } from "@/core/rbac/roles";
import { getSettings } from "@/core/settings";
import { SESSION_COOKIE, validateSessionToken } from "./session";

/**
 * Data Access Layer: the single place pages, route handlers and server
 * actions get the signed-in user and check permissions.
 */
export interface CurrentUserCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  allianceId: number | null;
}

export interface CurrentUser {
  id: string;
  role: Role;
  main: CurrentUserCharacter | null;
  /** Main character first, then alphabetical. */
  characters: CurrentUserCharacter[];
  characterIds: number[];
  /** Last version this account was shown the welcome tour or What's new for (`users.seen_version`). */
  seenVersion: string | null;
  permissions: string[];
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || user.isDisabled) return null;

  const chars = await db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      corporationId: characters.corporationId,
      allianceId: characters.allianceId,
    })
    .from(characters)
    .where(eq(characters.userId, user.id))
    .orderBy(asc(characters.name));

  const settings = await getSettings();
  const granted = permissionsForRole(user.role, allPermissions(), settings["permissions.overrides"]);
  const main = chars.find((c) => c.characterId === user.mainCharacterId) ?? chars[0] ?? null;
  // Main first, the rest by name.
  if (main) chars.sort((a, b) => Number(b === main) - Number(a === main));

  return {
    id: user.id,
    role: user.role,
    main,
    characters: chars,
    characterIds: chars.map((c) => c.characterId),
    seenVersion: user.seenVersion,
    permissions: [...granted].sort(),
    can: (p) => granted.has(p),
    canAny: (...ps) => ps.some((p) => granted.has(p)),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Requires any of the given permissions; otherwise shows the access denied page. */
export async function requirePermission(...anyOf: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canAny(...anyOf)) redirect("/forbidden");
  return user;
}

/** For server actions: returns the user or throws (no redirect side effects). */
export async function assertPermission(...anyOf: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!user.canAny(...anyOf)) throw new Error("You do not have permission to do that");
  return user;
}
