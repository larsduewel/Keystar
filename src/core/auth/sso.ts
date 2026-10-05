import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { base64UrlSha256, randomToken } from "@/core/crypto";
import { env, ssoCallbackUrl } from "@/core/env";

/**
 * EVE Online SSO (OAuth 2.0 authorization code flow with PKCE).
 * Docs: https://developers.eveonline.com/docs/services/sso/
 */

export interface TokenResponse {
  access_token: string;
  /** SSO may rotate it on refresh (store the new one), or in principle omit it (keep the old one). */
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface VerifiedCharacter {
  characterId: number;
  name: string;
  ownerHash: string;
  scopes: string[];
  expiresAt: Date;
}

export class SsoError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SsoError";
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  return { verifier, challenge: base64UrlSha256(verifier) };
}

export function buildAuthorizeUrl(params: { state: string; codeChallenge: string; scopes: string[] }): string {
  const e = env();
  const url = new URL("/v2/oauth/authorize", e.SSO_BASE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ssoCallbackUrl());
  url.searchParams.set("client_id", e.EVE_CLIENT_ID);
  if (params.scopes.length > 0) url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const e = env();
  const basic = Buffer.from(`${e.EVE_CLIENT_ID}:${e.EVE_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(new URL("/v2/oauth/token", e.SSO_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    let code: string | undefined;
    let description = res.statusText;
    try {
      const json = (await res.json()) as { error?: string; error_description?: string };
      code = json.error;
      description = json.error_description ?? json.error ?? description;
    } catch {
      // non-JSON error body
    }
    throw new SsoError(`SSO token request failed: ${description}`, code, res.status);
  }
  return parseTokenResponse(await res.json().catch(() => null));
}

/** Checks the fields Keystar relies on, so a malformed SSO answer fails here and not later. */
export function parseTokenResponse(body: unknown): TokenResponse {
  const r = (body ?? {}) as Record<string, unknown>;
  if (typeof r.access_token !== "string" || !r.access_token) throw new SsoError("SSO token response has no access token");
  if (typeof r.expires_in !== "number" || !(r.expires_in > 0)) throw new SsoError("SSO token response has no valid expiry");
  if (r.refresh_token !== undefined && r.refresh_token !== null && (typeof r.refresh_token !== "string" || !r.refresh_token)) {
    throw new SsoError("SSO token response has a malformed refresh token");
  }
  return {
    access_token: r.access_token,
    refresh_token: typeof r.refresh_token === "string" ? r.refresh_token : undefined,
    expires_in: r.expires_in,
    token_type: typeof r.token_type === "string" ? r.token_type : "Bearer",
  };
}

export function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: codeVerifier }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

/** Best effort revocation when a character is removed. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const e = env();
  const basic = Buffer.from(`${e.EVE_CLIENT_ID}:${e.EVE_CLIENT_SECRET}`).toString("base64");
  await fetch(new URL("/v2/oauth/revoke", e.SSO_BASE_URL), {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token_type_hint: "refresh_token", token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

let jwks: JWTVerifyGetKey | undefined;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) jwks = createRemoteJWKSet(new URL("/oauth/jwks", env().SSO_BASE_URL));
  return jwks;
}

/**
 * Validates an SSO access token (JWT) and extracts the character. Validation
 * follows CCP's guidance: signature via JWKS, issuer, audience contains both
 * our client id and "EVE Online", and expiry.
 */
export async function verifyAccessToken(
  accessToken: string,
  opts: { keySet?: JWTVerifyGetKey; clientId?: string; issuerHost?: string } = {},
): Promise<VerifiedCharacter> {
  const clientId = opts.clientId ?? env().EVE_CLIENT_ID;
  const issuerHost = opts.issuerHost ?? new URL(env().SSO_BASE_URL).host;
  const { payload } = await jwtVerify(accessToken, opts.keySet ?? getJwks(), {
    issuer: [issuerHost, `https://${issuerHost}`],
    algorithms: ["RS256", "ES256"],
  });

  const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!aud.includes(clientId) || !aud.includes("EVE Online")) {
    throw new SsoError("Token audience mismatch");
  }

  const match = /^CHARACTER:EVE:(\d+)$/.exec(String(payload.sub ?? ""));
  if (!match) throw new SsoError("Token subject is not a character");

  const rawScopes = (payload as { scp?: string | string[] }).scp;
  const scopes = rawScopes === undefined ? [] : Array.isArray(rawScopes) ? rawScopes : [rawScopes];
  const name = String((payload as { name?: string }).name ?? "");
  const ownerHash = String((payload as { owner?: string }).owner ?? "");
  if (!name || !ownerHash) throw new SsoError("Token is missing name/owner claims");

  return {
    characterId: Number(match[1]),
    name,
    ownerHash,
    scopes,
    expiresAt: new Date((payload.exp ?? 0) * 1000),
  };
}
