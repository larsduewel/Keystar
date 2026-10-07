import { describe, expect, it } from "vitest";
import {
  allPermissions,
  allScopeRequirements,
  applicationScopes,
  characterScopes,
  corporationScopes,
  esiHealth,
  memberScopeRequirements,
  optionalScopePermission,
  optionalScopes,
  parseOptionalScopes,
  reauthorizeHref,
  scopesForIntent,
} from "@/core/modules/registry";
import { FLEET_SCOPE } from "@/modules/fleet/logic";
import { IMPLANTS_SCOPE, SKILLQUEUE_SCOPE, SKILLS_SCOPE } from "@/modules/skills/module";
import { INDUSTRY_JOBS_SCOPE, STRUCTURES_SCOPE } from "@/modules/industry/module";
import { MARKET_ORDERS_SCOPE } from "@/modules/market/module";
import { MINING_LEDGER_SCOPE, MINING_MANAGE_HREF } from "@/modules/mining/module";
import { MAIL_SCOPE } from "@/modules/social/module";
import { WALLET_SCOPE } from "@/modules/wallet/module";

const MINING = MINING_LEDGER_SCOPE;
const CORP_MINING = "esi-industry.read_corporation_mining.v1";

function params(href: string) {
  return new URL(href, "http://x").searchParams;
}

describe("optional scopes", () => {
  it("keeps opt-in scopes out of the member and corporation sets", () => {
    expect(optionalScopes()).toEqual([
      IMPLANTS_SCOPE,
      FLEET_SCOPE,
      INDUSTRY_JOBS_SCOPE,
      MINING,
      MAIL_SCOPE,
      MARKET_ORDERS_SCOPE,
      SKILLQUEUE_SCOPE,
      SKILLS_SCOPE,
      STRUCTURES_SCOPE,
      WALLET_SCOPE,
    ]);
    for (const scope of optionalScopes()) {
      expect(characterScopes()).not.toContain(scope);
      expect(corporationScopes()).not.toContain(scope);
      expect(memberScopeRequirements().some((s) => s.scope === scope)).toBe(false);
    }
  });

  it("asks for no scope when registering or linking: every character scope is opt-in", () => {
    // The privacy promise on /join and the login page. A module adding a mandatory character scope breaks it.
    expect(characterScopes()).toEqual([]);
    expect(memberScopeRequirements()).toEqual([]);
    for (const s of allScopeRequirements().filter((r) => r.level === "character")) {
      expect(s.optional, s.scope).toBe(true);
      expect(s.manageHref, s.scope).toBeDefined();
      expect(s.managePermission, s.scope).toBeDefined();
      expect(s.label, s.scope).toBeDefined();
    }
    expect(scopesForIntent("join")).toEqual([]);
    expect(scopesForIntent("link")).toEqual([]);
    expect(scopesForIntent("link-corp")).not.toContain(MINING);
  });

  it("lists every scope for the EVE developer application", () => {
    expect(applicationScopes()).toEqual(expect.arrayContaining([MINING, CORP_MINING, WALLET_SCOPE, MAIL_SCOPE, FLEET_SCOPE]));
  });

  it("adds known opt-in scopes only when linking", () => {
    expect(scopesForIntent("login", [WALLET_SCOPE])).toEqual([]);
    expect(scopesForIntent("join", [WALLET_SCOPE, MINING])).toEqual([]);
    expect(scopesForIntent("link", [WALLET_SCOPE])).toEqual([WALLET_SCOPE]);
    expect(scopesForIntent("link", [MINING])).toEqual([MINING]);
    expect(scopesForIntent("link-corp", [WALLET_SCOPE])).toEqual(expect.arrayContaining([CORP_MINING, WALLET_SCOPE]));
    expect(scopesForIntent("link", ["esi-mail.send_mail.v1", "bogus"])).toEqual([]);
  });

  it("re-authorises without dropping corporation or opt-in scopes", () => {
    const plain = params(reauthorizeHref([]));
    expect(plain.get("intent")).toBe("link");
    expect(plain.get("with")).toBeNull();

    expect(params(reauthorizeHref([MINING])).get("with")).toBe(MINING);

    const corp = params(reauthorizeHref([CORP_MINING, WALLET_SCOPE]));
    expect(corp.get("intent")).toBe("link-corp");
    expect(corp.get("with")).toBe(WALLET_SCOPE);
  });

  it("adds and removes opt-in scopes", () => {
    const add = params(reauthorizeHref([], { add: [WALLET_SCOPE], returnTo: "/mining/pnl/settings" }));
    expect(add.get("with")).toBe(WALLET_SCOPE);
    expect(add.get("returnTo")).toBe("/mining/pnl/settings");
    const stop = params(reauthorizeHref([WALLET_SCOPE], { remove: [WALLET_SCOPE] }));
    expect(stop.get("with")).toBeNull();
    // Deliberately dropped, so the callback doesn't warn about losing it.
    expect(stop.get("drop")).toBe(WALLET_SCOPE);
    expect(params(reauthorizeHref([], { remove: [WALLET_SCOPE] })).get("drop")).toBeNull();
    expect(params(reauthorizeHref([], { add: ["bogus"] })).get("with")).toBeNull();
  });

  it("turns the mining ledger on and off like the other opt-in scopes", () => {
    const on = params(reauthorizeHref([WALLET_SCOPE], { add: [MINING], returnTo: MINING_MANAGE_HREF }));
    expect(on.get("intent")).toBe("link");
    expect(on.get("with")).toBe(`${MINING},${WALLET_SCOPE}`);
    expect(on.get("returnTo")).toBe(MINING_MANAGE_HREF);
    const off = params(reauthorizeHref([MINING, WALLET_SCOPE], { remove: [MINING] }));
    expect(off.get("with")).toBe(WALLET_SCOPE);
    expect(off.get("drop")).toBe(MINING);
  });

  it("keeps one opt-in scope while turning another on or off", () => {
    const mailOn = params(reauthorizeHref([WALLET_SCOPE], { add: [MAIL_SCOPE], returnTo: "/mail" }));
    expect(mailOn.get("with")).toBe(`${MAIL_SCOPE},${WALLET_SCOPE}`);
    const mailOff = params(reauthorizeHref([WALLET_SCOPE, MAIL_SCOPE], { remove: [MAIL_SCOPE] }));
    expect(mailOff.get("with")).toBe(WALLET_SCOPE);
    expect(mailOff.get("drop")).toBe(MAIL_SCOPE);
  });

  it("turns fleet access on and off like the other opt-in scopes", () => {
    const on = params(reauthorizeHref([], { add: [FLEET_SCOPE], returnTo: "/fleet" }));
    expect(on.get("intent")).toBe("link");
    expect(on.get("with")).toBe(FLEET_SCOPE);
    expect(scopesForIntent("link", [FLEET_SCOPE, MINING])).toEqual([FLEET_SCOPE, MINING]);
    const off = params(reauthorizeHref([FLEET_SCOPE, MAIL_SCOPE], { remove: [FLEET_SCOPE] }));
    expect(off.get("with")).toBe(MAIL_SCOPE);
    expect(off.get("drop")).toBe(FLEET_SCOPE);
  });

  it("names the permission that switches each opt-in scope", () => {
    const permissions = new Set(allPermissions().map((p) => p.key));
    for (const scope of optionalScopes()) {
      const permission = optionalScopePermission(scope);
      expect(permission, scope).toBeDefined();
      expect(permissions.has(permission!), scope).toBe(true);
    }
    expect(optionalScopePermission(MINING)).toBe("mining.view.own");
    expect(optionalScopePermission(CORP_MINING)).toBeUndefined();
  });

  it("names the character being re-authorised", () => {
    expect(params(reauthorizeHref([], { characterId: 2120000001 })).get("character")).toBe("2120000001");
    expect(params(reauthorizeHref([])).get("character")).toBeNull();
  });

  it("parses with=/drop= lists down to known opt-in scopes", () => {
    expect(parseOptionalScopes(`${WALLET_SCOPE}, bogus ${WALLET_SCOPE}`)).toEqual([WALLET_SCOPE]);
    expect(parseOptionalScopes(null)).toEqual([]);
  });
});

describe("ESI health", () => {
  const active = (scopes: string[]) => ({ status: "active", scopes });

  it("treats a character that shares nothing as fine while nothing is required", () => {
    expect(esiHealth(undefined)).toBe("none");
    expect(esiHealth(null, [])).toBe("none");
    // Every opt-in scope switched off: the token is still there, but Keystar reads nothing.
    expect(esiHealth(active([]))).toBe("none");
    expect(esiHealth(active([MINING]))).toBe("ok");
  });

  it("flags a revoked token, whatever it holds", () => {
    expect(esiHealth({ status: "invalid", scopes: [MINING] })).toBe("revoked");
    expect(esiHealth({ status: "invalid", scopes: [] }, [MINING])).toBe("revoked");
  });

  it("flags missing scopes only when some are required", () => {
    expect(esiHealth(active([]), [MINING])).toBe("missing");
    expect(esiHealth(undefined, [MINING])).toBe("missing");
    expect(esiHealth(active([MINING]), [MINING])).toBe("ok");
  });
});
