import { and, asc, eq, sql } from "drizzle-orm";
import { audit } from "@/core/audit";
import { encryptToken } from "@/core/crypto";
import {
  characters,
  esiTokens,
  eveCorporations,
  getDb,
  mailLabels,
  mailLists,
  mailMessages,
  sessions,
  users,
  walletTransactions,
  type Db,
} from "@/core/db";
import { env } from "@/core/env";
import { getEsi } from "@/core/esi";
import { ensureNames, refreshCorporations } from "@/core/eve/resolver";
import { optionalScopes } from "@/core/modules/registry";
import type { Role } from "@/core/rbac/roles";
import { getSettings, setSetting } from "@/core/settings";
import { lockUsers } from "./manage-users";
import { policyRole, reconcileRole } from "./policy";
import type { TokenResponse, VerifiedCharacter } from "./sso";

export type SsoIntent = "login" | "join" | "link" | "link-corp";

export type ProvisionErrorCode = "signInFirst" | "linkedElsewhere" | "disabled";

export class ProvisionError extends Error {
  constructor(
    readonly code: ProvisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Removes a character whose EVE account changed (sold or transferred) from its
 * previous Keystar account. An account left without characters is retired:
 * disabled and signed out everywhere, so the previous owner can't keep using an
 * existing session. The account itself stays, so it still counts for the
 * first-user bootstrap and a newcomer can't become admin that way.
 */
export async function detachTransferredCharacter(
  tx: Tx,
  characterId: number,
  previousUserId: string,
  opts: { keepAccount: boolean },
): Promise<{ retired: boolean }> {
  await tx.delete(characters).where(eq(characters.characterId, characterId));
  // Wallet history and mail imported for the previous owner are theirs, not the new owner's.
  await tx
    .delete(walletTransactions)
    .where(and(eq(walletTransactions.characterId, characterId), eq(walletTransactions.userId, previousUserId)));
  await tx.delete(mailMessages).where(and(eq(mailMessages.characterId, characterId), eq(mailMessages.userId, previousUserId)));
  await tx.delete(mailLabels).where(and(eq(mailLabels.characterId, characterId), eq(mailLabels.userId, previousUserId)));
  await tx.delete(mailLists).where(and(eq(mailLists.characterId, characterId), eq(mailLists.userId, previousUserId)));
  const [next] = await tx
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(eq(characters.userId, previousUserId))
    .orderBy(asc(characters.characterId))
    .limit(1);
  const retired = !next && !opts.keepAccount;
  await tx
    .update(users)
    .set({
      mainCharacterId: sql`CASE WHEN ${users.mainCharacterId} = ${characterId} THEN ${next?.characterId ?? null}::bigint ELSE ${users.mainCharacterId} END`,
      ...(retired ? { isDisabled: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, previousUserId));
  if (retired) await tx.delete(sessions).where(eq(sessions.userId, previousUserId));
  return { retired };
}

export interface ProvisionResult {
  userId: string;
  characterId: number;
  createdUser: boolean;
  role: Role;
  /** The character wasn't on this account before (a new link or a first sign-in). */
  newCharacter: boolean;
  /** Opt-in scopes the character held before this login but EVE didn't grant again. */
  lostOptionalScopes: string[];
  /** Opt-in scopes this login granted that the character didn't use before. */
  addedOptionalScopes: string[];
}

/**
 * Turns a successful SSO round-trip into a user/character/token. Handles
 * new accounts, linking alts, re-authorising scopes and character transfers
 * (detected through the SSO owner hash).
 */
export async function provisionFromSso(params: {
  verified: VerifiedCharacter;
  tokens: TokenResponse;
  intent: SsoIntent;
  currentUserId: string | null;
}): Promise<ProvisionResult> {
  const { verified, tokens, intent, currentUserId } = params;
  const linking = intent === "link" || intent === "link-corp";
  if (linking && !currentUserId) throw new ProvisionError("signInFirst", "Sign in before linking another character.");

  const pub = await getEsi().get<{ corporation_id: number; alliance_id?: number }>(`/characters/${verified.characterId}`);
  const corporationId = pub.data.corporation_id;
  const allianceId = pub.data.alliance_id ?? null;

  const settings = await getSettings();
  let homeCorporationId = settings["corp.homeCorporationId"];
  await refreshCorporations(homeCorporationId ? [corporationId, homeCorporationId] : [corporationId]);
  await ensureNames([verified.characterId, corporationId, ...(allianceId ? [allianceId] : [])]);

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // Serialise sign-ins so two simultaneous first logins can't both become admin;
    // the user count below is read after the lock, so it sees the other commit.
    await lockUsers(tx);
    const [existing] = await tx.select().from(characters).where(eq(characters.characterId, verified.characterId));

    if (existing && existing.ownerHash !== verified.ownerHash) {
      // The character was sold/transferred: the old account loses it entirely.
      // Keep the account when it is linking the character back to itself.
      const { retired } = await detachTransferredCharacter(tx, verified.characterId, existing.userId, {
        keepAccount: linking && existing.userId === currentUserId,
      });
      await audit({
        action: "character.transferred",
        targetType: "character",
        targetId: verified.characterId,
        details: { previousUserId: existing.userId, name: verified.name, previousAccountRetired: retired },
      });
    }
    const owned = existing && existing.ownerHash === verified.ownerHash ? existing : undefined;

    // Only the very first account is bootstrapped as admin. Counting admins instead would hand admin to the
    // next sign-in, whoever that is, if the last admin were ever demoted.
    const [anyUser] = await tx.select({ id: users.id }).from(users).limit(1);
    const homeCorp = homeCorporationId
      ? (await tx.select().from(eveCorporations).where(eq(eveCorporations.corporationId, homeCorporationId)))[0]
      : undefined;
    const policy = policyRole({
      characterId: verified.characterId,
      corporationId,
      allianceId,
      adminCharacterIds: env().ADMIN_CHARACTER_IDS,
      hasUsers: Boolean(anyUser),
      homeCorporationId,
      homeAllianceId: homeCorp?.allianceId ?? null,
      autoApproveCorpMembers: settings["access.autoApproveCorpMembers"],
      autoApproveAllianceMembers: settings["access.autoApproveAllianceMembers"],
    });

    let userId: string;
    let createdUser = false;
    let role: Role;

    if (linking) {
      if (owned && owned.userId !== currentUserId) {
        throw new ProvisionError("linkedElsewhere", `${verified.name} is already linked to another Keystar account.`);
      }
      userId = currentUserId!;
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      role = u.role;
    } else if (owned) {
      userId = owned.userId;
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (u.isDisabled) throw new ProvisionError("disabled", "This account has been disabled by an administrator.");
      role = reconcileRole(u.role, policy);
      if (role !== u.role) {
        await audit({
          action: "user.role.auto",
          targetType: "user",
          targetId: userId,
          details: { from: u.role, to: role, character: verified.name },
        });
      }
    } else {
      role = policy;
      const [u] = await tx.insert(users).values({ role, mainCharacterId: verified.characterId }).returning();
      userId = u.id;
      createdUser = true;
    }

    await tx
      .insert(characters)
      .values({
        characterId: verified.characterId,
        userId,
        name: verified.name,
        corporationId,
        allianceId,
        ownerHash: verified.ownerHash,
        affiliationUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: characters.characterId,
        set: {
          userId,
          name: verified.name,
          corporationId,
          allianceId,
          ownerHash: verified.ownerHash,
          affiliationUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    let lostOptionalScopes: string[] = [];
    let addedOptionalScopes: string[] = [];
    if (verified.scopes.length > 0) {
      // EVE replaces a token's scopes on every login: note opt-in scopes this login dropped.
      const [previous] = owned
        ? await tx.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, verified.characterId))
        : [];
      lostOptionalScopes = optionalScopes().filter((s) => previous?.scopes.includes(s) && !verified.scopes.includes(s));
      addedOptionalScopes = optionalScopes().filter((s) => verified.scopes.includes(s) && !previous?.scopes.includes(s));
      const tokenValues = {
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        accessTokenEnc: encryptToken(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: verified.scopes,
        // A fresh EVE consent replaces in-app switches: the token now holds exactly what was asked for.
        disabledScopes: [],
        status: "active" as const,
        lastError: null,
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
      };
      await tx
        .insert(esiTokens)
        .values({ characterId: verified.characterId, ...tokenValues })
        .onConflictDoUpdate({ target: esiTokens.characterId, set: tokenValues });
    }

    await tx
      .update(users)
      .set({
        role,
        mainCharacterId: sql`COALESCE(${users.mainCharacterId}, ${verified.characterId})`,
        ...(linking ? {} : { lastLoginAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return {
      userId,
      characterId: verified.characterId,
      createdUser,
      role,
      newCharacter: owned?.userId !== userId,
      lostOptionalScopes,
      addedOptionalScopes,
    };
  });

  // The first admin's corporation becomes the home corporation if none is configured.
  if (!homeCorporationId && result.role === "admin") {
    homeCorporationId = corporationId;
    await setSetting("corp.homeCorporationId", corporationId, result.userId);
  }

  await audit({
    actorUserId: result.userId,
    actorName: verified.name,
    action: linking ? "character.linked" : result.createdUser ? "user.registered" : "user.login",
    targetType: "character",
    targetId: verified.characterId,
    details: { intent, scopes: verified.scopes.length, role: result.role },
  });

  return result;
}
