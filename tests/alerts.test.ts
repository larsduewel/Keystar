import { describe, expect, it } from "vitest";
import { availableAlerts, MODULES } from "@/core/modules/registry";
import type { Settings } from "@/core/settings";
import { MESSAGES } from "@/i18n/messages";
import { ALERT_FEEDS } from "@/modules/alerts";

const declared = MODULES.flatMap((m) => (m.alerts ?? []).map((a) => ({ ...a, module: m.id })));
const settings = (extra: Partial<Settings> = {}) => extra as Settings;
const userWith = (...permissions: string[]) => ({ can: (p: string) => permissions.includes(p) });

describe("live alerts", () => {
  it("has a client feed for every declared alert and no feed without one", () => {
    const ids = declared.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ALERT_FEEDS).sort()).toEqual([...ids].sort());
    for (const a of declared) expect(a.id.startsWith(`${a.module}.`)).toBe(true);
  });

  it("has text for every alert in every language", () => {
    for (const t of Object.values(MESSAGES)) {
      for (const a of declared) {
        expect(a.label(t)).toBeTruthy();
        expect(a.hint(t)).toBeTruthy();
      }
    }
  });

  it("offers an alert only with its permission and settings", () => {
    const ids = (user: ReturnType<typeof userWith>, s: Settings) => availableAlerts(user, s).map((a) => a.id);
    expect(ids(userWith(), settings({ "corp.homeCorporationId": 1 }))).toEqual([]);
    expect(ids(userWith("killboard.view"), settings())).toEqual([]);
    expect(ids(userWith("killboard.view", "social.mail"), settings({ "corp.homeCorporationId": 1 }))).toEqual([
      "killboard.kills",
      "social.mail",
    ]);
  });
});
