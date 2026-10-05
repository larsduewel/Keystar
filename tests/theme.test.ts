import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isTheme, resolveTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/theme/config";

const mocks = vi.hoisted(() => ({ set: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { setThemeFromForm } from "@/theme/actions";

describe("theme preference", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves the dark default and rejects unsupported cookie values", () => {
    for (const value of [undefined, null, "", "system", "LIGHT", "<script>"]) {
      expect(resolveTheme(value)).toBe("dark");
      expect(isTheme(value)).toBe(false);
    }
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
  it.each(["light", "dark"])("persists %s and invalidates cached layouts", async (theme) => {
    const form = new FormData();
    form.set("theme", theme);
    await setThemeFromForm(form);
    expect(mocks.set).toHaveBeenCalledWith(
      THEME_COOKIE,
      theme,
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax", maxAge: THEME_COOKIE_MAX_AGE }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("does not write or revalidate for a tampered form", async () => {
    const form = new FormData();
    form.set("theme", "invalid");
    await expect(setThemeFromForm(form)).rejects.toThrow("Unsupported theme");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

// Shared small text must stay readable on the light surfaces, not merely on white.
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const light = css.split(':root[data-theme="light"] {')[1].split("}")[0];
const colors = Object.fromEntries([...light.matchAll(/--color-([\w-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
describe("light palette text contrast", () => {
  it.each([
    "ink",
    "ink-2",
    "ink-3",
    "accent",
    "gold",
    "good-text",
    "warning",
    "critical-text",
    "section-industry",
    "section-combat",
    "section-trade",
  ])("%s reaches WCAG AA on shared surfaces", (token) => {
    for (const surface of ["space-950", "space-900", "space-800"]) {
      const a = luminance(colors[token]),
        b = luminance(colors[surface]);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Chart tokens (src/modules/mining/class-colors.ts): each theme has its own steps.
const dark = css.split(":root {")[1].split("\n}")[0];
const tokens = (block: string, prefix: string) =>
  [...block.matchAll(new RegExp(`--${prefix}-[\\w-]+: (#[0-9a-f]{6});`, "g"))].map((m) => m[1]);
const ratio = (x: string, y: string) => {
  const a = luminance(x),
    b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
describe("chart palette per theme", () => {
  it("defines every series and ramp step for both themes", () => {
    // Five categorical slots plus the income/expense pair; the neutral slate is shared.
    expect(tokens(dark, "series")).toHaveLength(7);
    expect(tokens(light, "series")).toHaveLength(6);
    expect(tokens(dark, "ramp")).toHaveLength(5);
    expect(tokens(light, "ramp")).toHaveLength(5);
  });
  it("keeps light series marks at 3:1 on the light page", () => {
    for (const c of [...tokens(light, "series"), "#5d6878"]) expect(ratio(c, colors["space-950"])).toBeGreaterThanOrEqual(3);
  });
  it("keeps the income/expense pair at 3:1 on each surface", () => {
    const pair = (block: string) => [...block.matchAll(/--series-(?:income|expense): (#[0-9a-f]{6});/g)].map((m) => m[1]);
    expect(pair(dark)).toHaveLength(2);
    expect(pair(light)).toHaveLength(2);
    for (const c of pair(dark)) expect(ratio(c, "#14161a")).toBeGreaterThanOrEqual(3);
    for (const c of pair(light)) for (const s of [colors["space-950"], "#ffffff"]) expect(ratio(c, s)).toBeGreaterThanOrEqual(3);
  });
  it("makes the high end of the ramp the most salient on each surface", () => {
    const contrast = (ramp: string[], surface: string) => ramp.map((c) => ratio(c, surface));
    const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
    expect(increasing(contrast(tokens(dark, "ramp"), "#14161a"))).toBe(true);
    expect(increasing(contrast(tokens(light, "ramp"), colors["space-950"]))).toBe(true);
  });
});
