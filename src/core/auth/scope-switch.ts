import { and, eq, sql } from "drizzle-orm";
import { esiTokens, getDb, type Db } from "@/core/db";
import { optionalScopes } from "@/core/modules/registry";

/*
 * In-app switch for opt-in scopes. EVE can't remove a single scope from a
 * token without a new login, so switching one off moves it from `scopes`
 * (what Keystar uses) to `disabled_scopes` (still in the token, unused). Every
 * reader of `esi_tokens.scopes` (job planning, pages, actions) then treats it
 * as not granted. Token refreshes keep it off; the next SSO consent clears the
 * list, and since re-authorise links only request the scopes in use, that
 * consent drops the scope from the token for good.
 */

export type ScopeSwitchResult = "ok" | "unknownScope" | "notHeld";

/** The database or a transaction, so callers can lock rows around a switch. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Stops Keystar using an opt-in scope the character's token holds. Idempotent. */
export async function disableOptionalScope(characterId: number, scope: string, db: DbOrTx = getDb()): Promise<ScopeSwitchResult> {
  if (!optionalScopes().includes(scope)) return "unknownScope";
  const updated = await db
    .update(esiTokens)
    .set({
      scopes: sql`array_remove(${esiTokens.scopes}, ${scope}::text)`,
      disabledScopes: sql`array_append(array_remove(${esiTokens.disabledScopes}, ${scope}::text), ${scope}::text)`,
      updatedAt: new Date(),
    })
    .where(and(eq(esiTokens.characterId, characterId), sql`${scope}::text = ANY(${esiTokens.scopes})`))
    .returning({ characterId: esiTokens.characterId });
  if (updated.length) return "ok";
  return (await isDisabled(db, characterId, scope)) ? "ok" : "notHeld";
}

/**
 * Turns a switched-off opt-in scope back on; only works while the token still
 * holds it and is valid (a revoked token needs the EVE login). Idempotent.
 */
export async function enableOptionalScope(characterId: number, scope: string, db: DbOrTx = getDb()): Promise<ScopeSwitchResult> {
  if (!optionalScopes().includes(scope)) return "unknownScope";
  const updated = await db
    .update(esiTokens)
    .set({
      disabledScopes: sql`array_remove(${esiTokens.disabledScopes}, ${scope}::text)`,
      scopes: sql`array_append(array_remove(${esiTokens.scopes}, ${scope}::text), ${scope}::text)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(esiTokens.characterId, characterId),
        eq(esiTokens.status, "active"),
        sql`${scope}::text = ANY(${esiTokens.disabledScopes})`,
      ),
    )
    .returning({ characterId: esiTokens.characterId });
  if (updated.length) return "ok";
  const [token] = await db
    .select({ scopes: esiTokens.scopes, status: esiTokens.status })
    .from(esiTokens)
    .where(eq(esiTokens.characterId, characterId));
  return token?.status === "active" && token.scopes.includes(scope) ? "ok" : "notHeld";
}

async function isDisabled(db: DbOrTx, characterId: number, scope: string): Promise<boolean> {
  const [token] = await db
    .select({ disabledScopes: esiTokens.disabledScopes })
    .from(esiTokens)
    .where(eq(esiTokens.characterId, characterId));
  return Boolean(token?.disabledScopes.includes(scope));
}
