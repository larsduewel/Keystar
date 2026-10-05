import { and, eq, sql } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/core/crypto";
import { esiTokens, getDb } from "@/core/db";
import { refreshAccessToken, SsoError, verifyAccessToken, type TokenResponse } from "@/core/auth/sso";

export class TokenInvalidError extends Error {
  constructor(
    readonly characterId: number,
    message: string,
  ) {
    super(message);
    this.name = "TokenInvalidError";
  }
}

const inflight = new Map<number, Promise<string>>();

/**
 * Scopes to store after a refresh: what the new token holds, minus opt-in
 * scopes switched off in Keystar (they stay off; see core/auth/scope-switch.ts).
 * Switched-off scopes the token no longer holds are forgotten.
 */
export function refreshedScopes(tokenScopes: readonly string[], disabled: readonly string[]) {
  return {
    scopes: tokenScopes.filter((s) => !disabled.includes(s)),
    disabledScopes: disabled.filter((s) => tokenScopes.includes(s)),
  };
}

/** Advisory lock class for token refreshes; the second key is the character id (ESI ids are int32). */
const REFRESH_LOCK = 727_277;

/**
 * Returns a valid ESI access token for a character, refreshing it through SSO
 * when it expires within a minute. Refreshes are serialised per character
 * in-process and by an advisory lock across processes.
 */
export function getAccessToken(characterId: number, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const pending = inflight.get(characterId);
  if (pending) return pending;
  const promise = loadOrRefresh(characterId, opts.forceRefresh ?? false).finally(() => inflight.delete(characterId));
  inflight.set(characterId, promise);
  return promise;
}

/** The stored access token, unless it is missing or expires within a minute. */
function usableAccessToken(row: typeof esiTokens.$inferSelect): string | null {
  const valid = row.accessTokenEnc && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  return valid ? decryptToken(row.accessTokenEnc!) : null;
}

type RefreshStep =
  | { token: string }
  | { revoked: string }
  | { superseded: true }
  | { refreshed: { accessToken: string; expiresIn: number; refreshTokenEnc: string } };

/*
 * A refresh runs in three steps so that no network call holds the esi_tokens row lock, and the refresh token SSO
 * hands out is stored before anything else can fail (SSO may rotate it and retire the old one):
 *   1. under the advisory lock: read the row, refresh through SSO, store the new refresh token and commit;
 *   2. without any lock: verify the new access token (may fetch CCP's JWKS);
 *   3. briefly lock the row and store the access token and its scopes.
 * Writes are conditional on the refresh token being the one read (or stored) before: a login that replaced the
 * token in the meantime wins, and a refresh token is never written over a newer one.
 */
async function loadOrRefresh(characterId: number, forceRefresh: boolean, attempt = 0): Promise<string> {
  const db = getDb();
  const step = await db.transaction(async (tx): Promise<RefreshStep> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${REFRESH_LOCK}, ${characterId}::int)`);
    const [row] = await tx.select().from(esiTokens).where(eq(esiTokens.characterId, characterId));
    if (!row) throw new TokenInvalidError(characterId, "No ESI token stored for character");
    if (row.status !== "active") throw new TokenInvalidError(characterId, row.lastError ?? "Token is invalid");

    const current = usableAccessToken(row);
    if (current && !forceRefresh) return { token: current };

    const unchanged = and(eq(esiTokens.characterId, characterId), eq(esiTokens.refreshTokenEnc, row.refreshTokenEnc));
    let res: TokenResponse;
    try {
      res = await refreshAccessToken(decryptToken(row.refreshTokenEnc));
    } catch (err) {
      // Only invalid_grant means this token is dead (revoked by the player or CCP).
      // Others, e.g. invalid_client from a misconfigured secret, must not wipe every token.
      if (err instanceof SsoError && err.code === "invalid_grant") {
        const updated = await tx
          .update(esiTokens)
          .set({ status: "invalid", lastError: err.message, accessTokenEnc: null, updatedAt: sql`now()` })
          .where(unchanged)
          .returning({ characterId: esiTokens.characterId });
        // Return instead of throwing: throwing here would roll back the update above.
        return updated.length ? { revoked: err.message } : { superseded: true };
      }
      throw err;
    }

    // Keep the old refresh token if SSO sent none: without one the token could never be refreshed again.
    const refreshTokenEnc = res.refresh_token ? encryptToken(res.refresh_token) : row.refreshTokenEnc;
    const stored = await tx
      .update(esiTokens)
      .set({ refreshTokenEnc, updatedAt: new Date() })
      .where(and(unchanged, eq(esiTokens.status, "active")))
      .returning({ characterId: esiTokens.characterId });
    if (!stored.length) return { superseded: true };
    return { refreshed: { accessToken: res.access_token, expiresIn: res.expires_in, refreshTokenEnc } };
  });

  if ("token" in step) return step.token;
  if ("revoked" in step) throw new TokenInvalidError(characterId, step.revoked);
  // The row changed during the SSO call (a new login, a removal): start over from what is stored now.
  if ("superseded" in step) {
    if (attempt >= 2) throw new SsoError("ESI token kept changing during refresh");
    return loadOrRefresh(characterId, false, attempt + 1);
  }

  const { accessToken, expiresIn, refreshTokenEnc } = step.refreshed;
  const verified = await verifyAccessToken(accessToken);
  if (verified.characterId !== characterId) throw new SsoError("Refreshed token belongs to another character");

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
    if (!row) throw new TokenInvalidError(characterId, "No ESI token stored for character");
    if (row.status !== "active") throw new TokenInvalidError(characterId, row.lastError ?? "Token is invalid");
    if (row.refreshTokenEnc !== refreshTokenEnc) {
      // Replaced since step 1. A login stores its own access token: use that one, not one from the grant it replaced.
      // Otherwise another refresh of the same grant is still verifying, and this token is as good as its.
      return usableAccessToken(row) ?? accessToken;
    }
    await tx
      .update(esiTokens)
      .set({
        accessTokenEnc: encryptToken(accessToken),
        accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        ...refreshedScopes(verified.scopes, row.disabledScopes),
        lastRefreshedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(esiTokens.characterId, characterId));
    return accessToken;
  });
}

export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((s) => granted.includes(s));
}
