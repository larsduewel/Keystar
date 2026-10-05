import { describe, expect, it } from "vitest";
import { isActivePath, matchNavItem } from "@/components/shell/nav-match";
import { navSections } from "@/core/modules/registry";

describe("nav matching", () => {
  const items = [
    { href: "/", tone: undefined },
    { href: "/mining", exact: true, tone: "industry" },
    { href: "/mining/ledger", tone: "industry" },
    { href: "/killboard", tone: "combat" },
  ];

  it("picks the most specific active item", () => {
    expect(matchNavItem("/mining/ledger", items)?.href).toBe("/mining/ledger");
    expect(matchNavItem("/mining/ledger/2026-09", items)?.href).toBe("/mining/ledger");
    expect(matchNavItem("/mining", items)?.href).toBe("/mining");
  });

  it("matches nested routes below non-exact items only", () => {
    expect(matchNavItem("/killboard/kill/123", items)?.tone).toBe("combat");
    expect(matchNavItem("/mining/observers", items)).toBeUndefined();
  });

  it("maps / to the dashboard only", () => {
    expect(matchNavItem("/", items)?.href).toBe("/");
    expect(matchNavItem("/characters", items)).toBeUndefined();
    expect(isActivePath("/characters", "/")).toBe(false);
  });

  it("does not match a sibling that shares a prefix", () => {
    expect(isActivePath("/killboards", "/killboard")).toBe(false);
  });
});

describe("section tones", () => {
  const tones = Object.fromEntries(navSections().map((s) => [s.id, s.tone]));

  it("colours the feature sections", () => {
    expect(tones.industry).toBe("industry");
    expect(tones.trade).toBe("trade");
    expect(tones.pilots).toBe("pilots");
    expect(tones.social).toBe("social");
  });

  it("puts finances on the trade tone", () => {
    expect(tones.finances).toBe("trade");
  });

  it("keeps the tone when modules merge into one section", () => {
    const combat = navSections().find((s) => s.id === "combat");
    expect(combat?.tone).toBe("combat");
    expect(combat?.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/killboard", "/fleet", "/intel"]));
  });

  it("leaves overview, account and admin on the accent", () => {
    expect(tones.overview).toBeUndefined();
    expect(tones.account).toBeUndefined();
    expect(tones.admin).toBeUndefined();
  });
});
