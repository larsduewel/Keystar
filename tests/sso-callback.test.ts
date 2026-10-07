import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_COOKIE, sealOAuthState } from "@/core/auth/oauth-state";
import { FLASH_COOKIE, parseFlash } from "@/core/flash";

// The callback with EVE, the database and provisioning stubbed: only its routing decisions are under test.
const provisionFromSso = vi.fn();
vi.mock("@/core/auth/sso", () => ({
  exchangeCode: vi.fn(async () => ({ access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" })),
  verifyAccessToken: vi.fn(async () => picked),
}));
vi.mock("@/core/auth/provision", () => ({
  ProvisionError: class extends Error {},
  provisionFromSso: (...args: unknown[]) => provisionFromSso(...args),
}));
vi.mock("@/core/auth/session", () => ({
  SESSION_COOKIE: "ks_session",
  createSession: vi.fn(async () => "new-session"),
  sessionCookieOptions: () => ({ path: "/" }),
  validateSessionToken: vi.fn(async () => ({ userId: "user-1" })),
}));
vi.mock("@/core/db", () => ({
  characters: { characterId: "character_id", name: "name" },
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => [{ name: "Aria Vexmoor" }] }) }) }),
}));

let picked = { characterId: 2, name: "Thargus Audelaire", ownerHash: "h", scopes: ["s"], expiresAt: new Date() };

async function callback(expectedCharacterId?: number, intent: "link" | "link-corp" = "link-corp") {
  const { GET } = await import("@/app/auth/callback/route");
  const state = "s".repeat(24);
  const sealed = sealOAuthState({
    state,
    verifier: "v".repeat(43),
    intent,
    returnTo: "/characters",
    createdAt: Date.now(),
    expectedCharacterId,
  });
  const request = new NextRequest(`http://localhost:3000/auth/callback?code=c&state=${state}`, {
    headers: { cookie: `${OAUTH_COOKIE}=${sealed}; ks_session=old` },
  });
  return GET(request);
}

describe("SSO callback", () => {
  beforeEach(() => {
    provisionFromSso.mockReset().mockResolvedValue({
      userId: "user-1",
      characterId: 2,
      createdUser: false,
      role: "admin",
      newCharacter: false,
      lostOptionalScopes: [],
      addedOptionalScopes: [],
      tokenRemoved: false,
    });
    picked = { characterId: 2, name: "Thargus Audelaire", ownerHash: "h", scopes: ["s"], expiresAt: new Date() };
  });

  it("refuses a login with another character than the one being re-authorised", async () => {
    const res = await callback(1);
    expect(provisionFromSso).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/characters");
    expect(parseFlash(res.cookies.get(FLASH_COOKIE)?.value)).toMatchObject({
      kind: "linkFailed",
      code: "wrongCharacter",
      name: "Thargus Audelaire",
      expected: "Aria Vexmoor",
    });
  });

  it("stores the token when the expected character logs in", async () => {
    const res = await callback(2);
    expect(provisionFromSso).toHaveBeenCalledOnce();
    expect(parseFlash(res.cookies.get(FLASH_COOKIE)?.value)).toMatchObject({ kind: "corpGranted", name: "Thargus Audelaire" });
  });

  it("accepts any character on a plain link", async () => {
    await callback();
    expect(provisionFromSso).toHaveBeenCalledOnce();
    expect(provisionFromSso.mock.calls[0][0]).toMatchObject({ reauthorize: false });
  });

  it("tells provisioning when the character being re-authorised logged in", async () => {
    await callback(2);
    expect(provisionFromSso.mock.calls[0][0]).toMatchObject({ reauthorize: true });
  });

  it("says a plain link of a character already on the account changed nothing", async () => {
    picked = { ...picked, scopes: [] };
    const res = await callback(undefined, "link");
    expect(parseFlash(res.cookies.get(FLASH_COOKIE)?.value)).toMatchObject({ kind: "alreadyLinked", name: "Thargus Audelaire" });
  });

  it("confirms a re-authorisation that removed the character's access", async () => {
    picked = { ...picked, scopes: [] };
    provisionFromSso.mockResolvedValueOnce({
      userId: "user-1",
      characterId: 2,
      createdUser: false,
      role: "admin",
      newCharacter: false,
      lostOptionalScopes: [],
      addedOptionalScopes: [],
      tokenRemoved: true,
    });
    const res = await callback(2, "link");
    expect(parseFlash(res.cookies.get(FLASH_COOKIE)?.value)).toMatchObject({ kind: "accessRemoved", name: "Thargus Audelaire" });
  });
});
