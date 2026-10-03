import { describe, expect, it } from "vitest";
import {
  applicationScopes,
  characterScopes,
  corporationScopes,
  memberScopeRequirements,
  optionalScopes,
  parseOptionalScopes,
  reauthorizeHref,
  scopesForIntent,
} from "@/core/modules/registry";
import { FLEET_SCOPE } from "@/modules/fleet/logic";
import { MAIL_SCOPE } from "@/modules/social/module";
import { WALLET_SCOPE } from "@/modules/wallet/module";

const MINING = "esi-industry.read_character_mining.v1";
const CORP_MINING = "esi-industry.read_corporation_mining.v1";

function params(href: string) {
  return new URL(href, "http://x").searchParams;
}

describe("optional scopes", () => {
  it("keeps opt-in scopes out of the member and corporation sets", () => {
    expect(optionalScopes()).toEqual([FLEET_SCOPE, MAIL_SCOPE, WALLET_SCOPE]);
    expect(characterScopes()).toEqual([MINING]);
    for (const scope of [WALLET_SCOPE, MAIL_SCOPE, FLEET_SCOPE]) {
      expect(characterScopes()).not.toContain(scope);
      expect(corporationScopes()).not.toContain(scope);
      expect(memberScopeRequirements().some((s) => s.scope === scope)).toBe(false);
    }
  });

  it("lists every scope for the EVE developer application", () => {
    expect(applicationScopes()).toEqual(expect.arrayContaining([MINING, CORP_MINING, WALLET_SCOPE, MAIL_SCOPE, FLEET_SCOPE]));
  });

  it("adds known opt-in scopes only when linking", () => {
    expect(scopesForIntent("login", [WALLET_SCOPE])).toEqual([]);
    expect(scopesForIntent("join", [WALLET_SCOPE])).toEqual(characterScopes());
    expect(scopesForIntent("link", [WALLET_SCOPE])).toContain(WALLET_SCOPE);
    expect(scopesForIntent("link-corp", [WALLET_SCOPE])).toEqual(expect.arrayContaining([CORP_MINING, WALLET_SCOPE]));
    expect(scopesForIntent("link", ["esi-mail.send_mail.v1", "bogus"])).toEqual(characterScopes());
  });

  it("re-authorises without dropping corporation or opt-in scopes", () => {
    const plain = params(reauthorizeHref([MINING]));
    expect(plain.get("intent")).toBe("link");
    expect(plain.get("with")).toBeNull();

    const corp = params(reauthorizeHref([MINING, CORP_MINING, WALLET_SCOPE]));
    expect(corp.get("intent")).toBe("link-corp");
    expect(corp.get("with")).toBe(WALLET_SCOPE);
  });

  it("adds and removes opt-in scopes", () => {
    const add = params(reauthorizeHref([MINING], { add: [WALLET_SCOPE], returnTo: "/mining/pnl/settings" }));
    expect(add.get("with")).toBe(WALLET_SCOPE);
    expect(add.get("returnTo")).toBe("/mining/pnl/settings");
    const stop = params(reauthorizeHref([MINING, WALLET_SCOPE], { remove: [WALLET_SCOPE] }));
    expect(stop.get("with")).toBeNull();
    // Deliberately dropped, so the callback doesn't warn about losing it.
    expect(stop.get("drop")).toBe(WALLET_SCOPE);
    expect(params(reauthorizeHref([MINING], { remove: [WALLET_SCOPE] })).get("drop")).toBeNull();
    expect(params(reauthorizeHref([MINING], { add: ["bogus"] })).get("with")).toBeNull();
  });

  it("keeps one opt-in scope while turning another on or off", () => {
    const mailOn = params(reauthorizeHref([MINING, WALLET_SCOPE], { add: [MAIL_SCOPE], returnTo: "/mail" }));
    expect(mailOn.get("with")).toBe(`${MAIL_SCOPE},${WALLET_SCOPE}`);
    const mailOff = params(reauthorizeHref([MINING, WALLET_SCOPE, MAIL_SCOPE], { remove: [MAIL_SCOPE] }));
    expect(mailOff.get("with")).toBe(WALLET_SCOPE);
    expect(mailOff.get("drop")).toBe(MAIL_SCOPE);
  });

  it("turns fleet access on and off like the other opt-in scopes", () => {
    const on = params(reauthorizeHref([MINING], { add: [FLEET_SCOPE], returnTo: "/fleet" }));
    expect(on.get("intent")).toBe("link");
    expect(on.get("with")).toBe(FLEET_SCOPE);
    expect(scopesForIntent("link", [FLEET_SCOPE])).toEqual([FLEET_SCOPE, MINING]);
    const off = params(reauthorizeHref([MINING, FLEET_SCOPE, MAIL_SCOPE], { remove: [FLEET_SCOPE] }));
    expect(off.get("with")).toBe(MAIL_SCOPE);
    expect(off.get("drop")).toBe(FLEET_SCOPE);
  });

  it("parses with=/drop= lists down to known opt-in scopes", () => {
    expect(parseOptionalScopes(`${WALLET_SCOPE}, bogus ${WALLET_SCOPE}`)).toEqual([WALLET_SCOPE]);
    expect(parseOptionalScopes(null)).toEqual([]);
  });
});
