import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAuthorizeUrl, createPkcePair, parseTokenResponse, verifyAccessToken } from "@/core/auth/sso";
import { base64UrlSha256 } from "@/core/crypto";

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey as CryptoKey;
  const jwk = (await exportJWK(pair.publicKey)) as JWK;
  jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: "JWT-Signature-Key", alg: "RS256", use: "sig" }] });
});

async function token(claims: Record<string, unknown>, opts: { exp?: string; aud?: string[]; iss?: string } = {}) {
  return new SignJWT({ name: "Aria Vexmoor", owner: "owner-hash", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "JWT-Signature-Key" })
    .setSubject("CHARACTER:EVE:2120000001")
    .setIssuer(opts.iss ?? "https://login.eveonline.com")
    .setAudience(opts.aud ?? ["test-client-id", "EVE Online"])
    .setExpirationTime(opts.exp ?? "20m")
    .sign(privateKey);
}

describe("EVE SSO", () => {
  it("validates a token and extracts the character", async () => {
    const v = await verifyAccessToken(await token({ scp: ["esi-industry.read_character_mining.v1", "a"] }), { keySet: jwks });
    expect(v.characterId).toBe(2120000001);
    expect(v.name).toBe("Aria Vexmoor");
    expect(v.ownerHash).toBe("owner-hash");
    expect(v.scopes).toEqual(["esi-industry.read_character_mining.v1", "a"]);
  });

  it("accepts a single scope string and no scopes", async () => {
    expect((await verifyAccessToken(await token({ scp: "one" }), { keySet: jwks })).scopes).toEqual(["one"]);
    expect((await verifyAccessToken(await token({}), { keySet: jwks })).scopes).toEqual([]);
  });

  it("accepts the bare-host issuer form", async () => {
    const v = await verifyAccessToken(await token({}, { iss: "login.eveonline.com" }), { keySet: jwks });
    expect(v.characterId).toBe(2120000001);
  });

  it("rejects wrong audience, issuer and expired tokens", async () => {
    await expect(verifyAccessToken(await token({}, { aud: ["other-client", "EVE Online"] }), { keySet: jwks })).rejects.toThrow();
    await expect(verifyAccessToken(await token({}, { aud: ["test-client-id"] }), { keySet: jwks })).rejects.toThrow();
    await expect(verifyAccessToken(await token({}, { iss: "https://evil.example" }), { keySet: jwks })).rejects.toThrow();
    await expect(verifyAccessToken(await token({}, { exp: "-1m" }), { keySet: jwks })).rejects.toThrow();
  });

  it("checks the SSO token response", () => {
    expect(parseTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 1199, token_type: "Bearer" })).toEqual({
      access_token: "a",
      refresh_token: "r",
      expires_in: 1199,
      token_type: "Bearer",
    });
    expect(parseTokenResponse({ access_token: "a", expires_in: 1199 }).refresh_token).toBeUndefined();
    expect(() => parseTokenResponse(null)).toThrow(/no access token/);
    expect(() => parseTokenResponse({ access_token: "", expires_in: 1199 })).toThrow(/no access token/);
    expect(() => parseTokenResponse({ access_token: "a" })).toThrow(/no valid expiry/);
    expect(() => parseTokenResponse({ access_token: "a", expires_in: 1199, refresh_token: 5 })).toThrow(/malformed refresh token/);
  });

  it("builds a PKCE authorize URL", () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(base64UrlSha256(verifier));
    const url = new URL(buildAuthorizeUrl({ state: "st", codeChallenge: challenge, scopes: ["a", "b"] }));
    expect(url.origin + url.pathname).toBe("https://login.eveonline.com/v2/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("a b");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/callback");
    // Identity-only login sends no scope parameter at all.
    expect(new URL(buildAuthorizeUrl({ state: "st", codeChallenge: challenge, scopes: [] })).searchParams.has("scope")).toBe(false);
  });
});
