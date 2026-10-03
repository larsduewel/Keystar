import { eq, sql } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/core/crypto";
import { esiTokens, getDb } from "@/core/db";
import { refreshAccessToken, SsoError, verifyAccessToken } from "@/core/auth/sso";

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

/**
 * Returns a valid ESI access token for a character, refreshing it through SSO
 * when it expires within a minute. Refreshes are serialised per character
 * in-process and guarded by a row lock across processes.
 */
export function getAccessToken(characterId: number, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const pending = inflight.get(characterId);
  if (pending) return pending;
  const promise = loadOrRefresh(characterId, opts.forceRefresh ?? false).finally(() => inflight.delete(characterId));
  inflight.set(characterId, promise);
  return promise;
}

async function loadOrRefresh(characterId: number, forceRefresh: boolean): Promise<string> {
  const db = getDb();
  const outcome = await db.transaction(async (tx): Promise<{ token: string } | { revoked: string }> => {
    const rows = await tx
      .select()
      .from(esiTokens)
      .where(eq(esiTokens.characterId, characterId))
      .for("update");
    const row = rows[0];
    if (!row) throw new TokenInvalidError(characterId, "No ESI token stored for character");
    if (row.status !== "active") throw new TokenInvalidError(characterId, row.lastError ?? "Token is invalid");

    const stillValid =
      row.accessTokenEnc && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid && !forceRefresh) return { token: decryptToken(row.accessTokenEnc!) };

    try {
      const res = await refreshAccessToken(decryptToken(row.refreshTokenEnc));
      const verified = await verifyAccessToken(res.access_token);
      if (verified.characterId !== characterId) throw new SsoError("Refreshed token belongs to another character");
      await tx
        .update(esiTokens)
        .set({
          accessTokenEnc: encryptToken(res.access_token),
          accessTokenExpiresAt: new Date(Date.now() + res.expires_in * 1000),
          refreshTokenEnc: encryptToken(res.refresh_token),
          ...refreshedScopes(verified.scopes, row.disabledScopes),
          lastRefreshedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(esiTokens.characterId, characterId));
      return { token: res.access_token };
    } catch (err) {
      // Only invalid_grant means this token is dead (revoked by the player or CCP).
      // Others, e.g. invalid_client from a misconfigured secret, must not wipe every token.
      if (err instanceof SsoError && err.code === "invalid_grant") {
        await tx
          .update(esiTokens)
          .set({ status: "invalid", lastError: err.message, accessTokenEnc: null, updatedAt: sql`now()` })
          .where(eq(esiTokens.characterId, characterId));
        // Return instead of throwing: throwing here would roll back the update above.
        return { revoked: err.message };
      }
      throw err;
    }
  });
  if ("revoked" in outcome) throw new TokenInvalidError(characterId, outcome.revoked);
  return outcome.token;
}

export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((s) => granted.includes(s));
}
