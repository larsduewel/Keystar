import { describe, expect, it } from "vitest";
import { encodeFlash, parseFlash } from "@/core/flash";
import { refreshedScopes } from "@/core/esi/tokens";
import { FLEET_SCOPE } from "@/modules/fleet/logic";
import { WALLET_SCOPE } from "@/modules/wallet/module";

describe("flash messages", () => {
  it("round-trips through the cookie value", () => {
    const flash = { kind: "scopesChanged" as const, name: "Aria Vexmoor", added: [FLEET_SCOPE], removed: [WALLET_SCOPE] };
    expect(parseFlash(encodeFlash(flash))).toEqual({ ...flash, code: undefined });
    expect(parseFlash(encodeFlash({ kind: "linkFailed", code: "linkedElsewhere" }))).toMatchObject({
      kind: "linkFailed",
      code: "linkedElsewhere",
    });
  });

  it("ignores missing, malformed and unknown values", () => {
    expect(parseFlash(undefined)).toBeNull();
    expect(parseFlash("")).toBeNull();
    expect(parseFlash("%E0%A4%A")).toBeNull();
    expect(parseFlash(encodeURIComponent("[1,2]"))).toBeNull();
    expect(parseFlash(encodeURIComponent(JSON.stringify({ kind: "welcome" })))).toBeNull();
  });

  it("keeps only known codes and scope-like ids, and caps the name", () => {
    const parsed = parseFlash(
      encodeURIComponent(
        JSON.stringify({ kind: "linkFailed", code: "<b>nope</b>", name: "x".repeat(200), added: ["esi-ok.v1", "<script>", 5] }),
      ),
    );
    expect(parsed).toEqual({ kind: "linkFailed", code: undefined, name: "x".repeat(64), added: ["esi-ok.v1"], removed: undefined });
  });
});

describe("token refresh scopes", () => {
  it("keeps scopes switched off in Keystar out of use", () => {
    expect(refreshedScopes(["a", FLEET_SCOPE], [FLEET_SCOPE])).toEqual({ scopes: ["a"], disabledScopes: [FLEET_SCOPE] });
  });

  it("forgets switched-off scopes the token no longer holds", () => {
    expect(refreshedScopes(["a"], [FLEET_SCOPE])).toEqual({ scopes: ["a"], disabledScopes: [] });
  });
});
