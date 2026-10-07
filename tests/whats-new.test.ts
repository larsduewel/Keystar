import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { latestDigest, navNews, onboarding, shouldRecordSeen, whatsNewDigest } from "@/core/help/onboarding";
import { highlightText, releaseEntries, upgradeText, type ReleaseEntry } from "@/core/help/releases";
import { allPermissions, navSections } from "@/core/modules/registry";
import { MESSAGES } from "@/i18n/messages";
import { compareVersions, parseVersion } from "@/lib/semver";
import { hasUpgradeNotes } from "@/scripts/release-prepare";
import pkg from "../package.json";

const SOURCE = "https://github.com/theragus/keystar";
type Can = (permission: string) => boolean;
const everyone: Can = () => true;
const member: Can = (p) => p === "map.view" || p === "mining.view.own";
const admin: Can = (p) => p !== "nothing";

const icon = (() => null) as unknown as ReleaseEntry["highlights"][number]["icon"];
const h = (key: string, extra: Partial<ReleaseEntry["highlights"][number]> = {}) => ({ key, icon, kind: "new" as const, ...extra });
const RELEASES: ReleaseEntry[] = [
  { version: "0.9.0", upgrade: false, highlights: [h("old")] },
  { version: "0.10.0", upgrade: true, highlights: [h("map", { href: "/map", anyPermission: ["map.view"] }), h("wallet", { href: "/finances", anyPermission: ["wallet.corp.view"] })] },
  { version: "0.11.0", upgrade: true, highlights: [] },
  { version: "0.12.0", upgrade: false, highlights: [h("a"), h("b"), h("c", { href: "/mining" }), h("d")] },
  { version: "0.13.0", upgrade: false, highlights: [h("future")] },
];

describe("versions", () => {
  it("parses plain versions only", () => {
    expect(parseVersion("0.14.0")).toEqual([0, 14, 0]);
    expect(parseVersion("v0.14.0")).toBeNull();
    expect(parseVersion("0.14")).toBeNull();
    expect(parseVersion("main")).toBeNull();
  });

  it("orders numerically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.9.9", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("0.14.0", "0.14.0")).toBe(0);
    expect(compareVersions("junk", "0.0.1")).toBeLessThan(0);
  });
});

describe("onboarding", () => {
  const run = (seenVersion: string | null, current: string, can = everyone) =>
    onboarding({ seenVersion, current, can, sourceUrl: SOURCE, releases: RELEASES });

  it("opens the welcome tour for an account that never saw anything", () => {
    expect(run(null, "0.12.0")).toEqual({ kind: "welcome" });
    expect(run("garbage", "0.12.0")).toEqual({ kind: "welcome" });
  });

  it("shows nothing and records nothing on the same version or after a downgrade", () => {
    expect(run("0.12.0", "0.12.0")).toEqual({ kind: "none", markSeen: false });
    expect(run("0.13.0", "0.12.0")).toEqual({ kind: "none", markSeen: false });
  });

  it("shows nothing for a running version it can't read", () => {
    expect(run(null, "main")).toEqual({ kind: "none", markSeen: false });
  });

  it("shows one release with a link to its release page", () => {
    const result = run("0.11.0", "0.12.0");
    expect(result.kind).toBe("whatsNew");
    if (result.kind !== "whatsNew") return;
    expect(result.digest).toMatchObject({
      mode: "update",
      version: "0.12.0",
      from: null,
      versions: ["0.12.0"],
      more: 0,
      upgrades: [],
      href: `${SOURCE}/releases/tag/v0.12.0`,
    });
    expect(result.digest.highlights.map((r) => r.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("combines skipped releases newest first, caps the cards and links to all releases", () => {
    const result = run("0.9.0", "0.12.0", admin);
    if (result.kind !== "whatsNew") throw new Error(result.kind);
    const { digest } = result;
    expect(digest.versions).toEqual(["0.12.0", "0.11.0", "0.10.0"]);
    expect(digest.highlights).toEqual([
      { version: "0.12.0", key: "a" },
      { version: "0.12.0", key: "b" },
      { version: "0.12.0", key: "c" },
      { version: "0.12.0", key: "d" },
    ]);
    expect(digest.more).toBe(2);
    expect(digest.from).toBe("0.9.0");
    expect(digest.href).toBe(`${SOURCE}/releases`);
  });

  it("shows upgrade notes to admins only", () => {
    const forAdmin = run("0.10.0", "0.11.0", admin);
    expect(forAdmin.kind === "whatsNew" && forAdmin.digest.upgrades).toEqual([
      { version: "0.11.0", href: `${SOURCE}/releases/tag/v0.11.0` },
    ]);
    // 0.11.0 has nothing else, so a member sees nothing, but the version is still recorded.
    expect(run("0.10.0", "0.11.0", member)).toEqual({ kind: "none", markSeen: true });
  });

  it("leaves out highlights the viewer has no permission for", () => {
    const result = run("0.9.0", "0.10.0", member);
    expect(result.kind === "whatsNew" && result.digest.highlights.map((r) => r.key)).toEqual(["map"]);
    expect(result.kind === "whatsNew" && result.digest.upgrades).toEqual([]);
  });

  it("ignores highlights of releases newer than the running version", () => {
    const result = run("0.12.0", "0.12.5");
    expect(result).toEqual({ kind: "none", markSeen: true });
  });

  it("names the version seen last when a patch release brings no highlights of its own", () => {
    const result = run("0.11.0", "0.12.1");
    expect(result.kind === "whatsNew" && result.digest).toMatchObject({ version: "0.12.1", from: "0.11.0", versions: ["0.12.0"] });
  });
});

describe("What's new by hand", () => {
  it("shows the newest release up to the running one that has something for the viewer", () => {
    expect(latestDigest({ current: "0.12.5", can: everyone, sourceUrl: SOURCE, releases: RELEASES })).toMatchObject({
      mode: "latest",
      version: "0.12.0",
      from: null,
      href: `${SOURCE}/releases/tag/v0.12.0`,
    });
    // 0.11.0 only has upgrade notes, which a member doesn't see.
    expect(latestDigest({ current: "0.11.0", can: member, sourceUrl: SOURCE, releases: RELEASES })?.version).toBe("0.10.0");
    expect(latestDigest({ current: "0.8.0", can: everyone, sourceUrl: SOURCE, releases: RELEASES })).toBeNull();
  });
});

describe("sidebar New dots", () => {
  it("marks the pages of the newest release with highlights, as far as the viewer may open them", () => {
    expect(navNews({ current: "0.12.0", can: everyone, releases: RELEASES })).toEqual({ version: "0.12.0", hrefs: ["/mining"] });
    expect(navNews({ current: "0.11.0", can: member, releases: RELEASES })).toEqual({ version: "0.10.0", hrefs: ["/map"] });
    expect(navNews({ current: "0.9.0", can: everyone, releases: RELEASES })).toBeNull();
  });
});

describe("recording the version seen", () => {
  it("only ever raises it", () => {
    expect(shouldRecordSeen(null, "0.14.0")).toBe(true);
    expect(shouldRecordSeen("junk", "0.14.0")).toBe(true);
    expect(shouldRecordSeen("0.13.0", "0.14.0")).toBe(true);
    expect(shouldRecordSeen("0.14.0", "0.14.0")).toBe(false);
    expect(shouldRecordSeen("0.15.0", "0.14.0")).toBe(false);
    expect(shouldRecordSeen(null, "main")).toBe(false);
  });
});

describe("release highlights", () => {
  const changelog = readFileSync(path.join(import.meta.dirname, "..", "CHANGELOG.md"), "utf8");
  const section = (version: string) => {
    const start = changelog.indexOf(`## [${version}]`);
    const end = changelog.indexOf("\n## [", start + 1);
    return start === -1 ? null : changelog.slice(start, end === -1 ? undefined : end);
  };
  const hrefs = new Set(navSections().flatMap((s) => s.items.map((i) => i.href)));
  const permissions = new Set(allPermissions().map((p) => p.key));

  it.each(releaseEntries().map((r) => [r.version, r] as const))("%s is released and consistent", (version, release) => {
    expect(compareVersions(version, pkg.version)).toBeLessThanOrEqual(0);
    const notes = section(version);
    expect(notes, `CHANGELOG.md has no "## [${version}]" section`).not.toBeNull();
    // Upgrade text for admins exactly when the release notes have upgrade steps.
    expect(release.upgrade).toBe(hasUpgradeNotes(notes!));
    expect(release.highlights.length).toBeLessThanOrEqual(4);
    expect(release.highlights.length > 0 || release.upgrade).toBe(true);
    for (const highlight of release.highlights) {
      if (highlight.href) expect(hrefs, `${highlight.key}: ${highlight.href} is not a sidebar page`).toContain(highlight.href);
      for (const p of highlight.anyPermission ?? []) expect(permissions, `${highlight.key}: unknown permission ${p}`).toContain(p);
      for (const t of Object.values(MESSAGES)) {
        const text = highlightText(t, { version, key: highlight.key });
        expect(text.title.trim() && text.body.trim()).toBeTruthy();
      }
    }
    for (const t of Object.values(MESSAGES)) expect(Boolean(upgradeText(t, version))).toBe(release.upgrade);
  });

  it("lists releases newest first", () => {
    const versions = releaseEntries().map((r) => r.version);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
  });

  it("uses each highlight's sidebar page once per release", () => {
    for (const release of releaseEntries()) {
      const pages = release.highlights.flatMap((h) => (h.href ? [h.href] : []));
      expect(new Set(pages).size).toBe(pages.length);
    }
  });

  it("builds the What's new dialog for the running version", () => {
    const current = whatsNewDigest(releaseEntries(), { after: null, upTo: pkg.version, can: everyone, sourceUrl: SOURCE, mode: "latest" });
    expect(current).not.toBeNull();
  });
});
