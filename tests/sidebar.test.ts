import { describe, expect, it } from "vitest";
import { closedNavSections, isSidebarCollapsed, serializeClosedNavSections } from "@/components/shell/sidebar-config";
import { versionLabel } from "@/core/version";

describe("sidebar preference", () => {
  it("collapses only on an explicit cookie value", () => {
    expect(isSidebarCollapsed("collapsed")).toBe(true);
    expect(isSidebarCollapsed("expanded")).toBe(false);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed("COLLAPSED")).toBe(false);
  });

  it("round-trips folded sections and drops anything that isn't a section id", () => {
    expect(closedNavSections(serializeClosedNavSections(["industry", "combat"]))).toEqual(["industry", "combat"]);
    expect(closedNavSections("industry..trade.industry.<script>")).toEqual(["industry", "trade"]);
    expect(closedNavSections("")).toEqual([]);
    expect(closedNavSections(undefined)).toEqual([]);
  });
});

describe("sidebar version label", () => {
  const info = { version: "0.12.0", commit: null, imageTag: null, buildDate: null, dependencies: {} };
  const source = "https://github.com/theragus/keystar";

  it("shows the plain version for a release image and for local runs", () => {
    expect(versionLabel(info, source)).toEqual({ text: "Keystar v0.12.0", href: `${source}/releases`, prerelease: false });
    expect(versionLabel({ ...info, commit: "c7bfb85abcdef", imageTag: "0.12.0" }, source)).toMatchObject({ text: "Keystar v0.12.0", prerelease: false });
    expect(versionLabel({ ...info, commit: "c7bfb85abcdef", imageTag: "v0.12.0" }, source)).toMatchObject({ prerelease: false });
  });

  it("names the tag and commit of an unreleased image and links to the commit", () => {
    expect(versionLabel({ ...info, commit: "c7bfb85abcdef0123", imageTag: "main" }, `${source}/`)).toEqual({
      text: "Keystar v0.12.0 · main @ c7bfb85",
      href: `${source}/commit/c7bfb85abcdef0123`,
      prerelease: true,
    });
  });

  it("falls back to the version when the tag differs but no commit is known", () => {
    expect(versionLabel({ ...info, imageTag: "main" }, source)).toMatchObject({ text: "Keystar v0.12.0", prerelease: false });
  });
});
