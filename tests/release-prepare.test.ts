import { describe, expect, it } from "vitest";
import { hasUpgradeNotes, highlightsReminder, nextVersion, releaseChangelog, suggestedBump } from "@/scripts/release-prepare";

describe("nextVersion", () => {
  it.each([
    ["0.1.4", "patch", "0.1.5"],
    ["0.1.4", "minor", "0.2.0"],
    ["0.1.4", "major", "1.0.0"],
    ["0.1.4", "0.3.0", "0.3.0"],
    ["0.1.4", "0.1.10", "0.1.10"],
  ])("%s + %s → %s", (current, bump, expected) => {
    expect(nextVersion(current, bump)).toBe(expected);
  });

  it.each(["0.1.4", "0.1.3", "0.0.9", "v0.2.0", "huge"])("rejects %s", (bump) => {
    expect(() => nextVersion("0.1.4", bump)).toThrow();
  });
});

describe("suggestedBump", () => {
  it("bumps the patch number for fixes only", () => {
    expect(suggestedBump("\n### Fixed\n\n- A.\n\n### Security\n\n- B.\n")).toBe("patch");
  });

  it.each(["Added", "Changed", "Removed", "Deprecated"])("bumps the minor number for ### %s", (kind) => {
    expect(suggestedBump(`\n### Fixed\n\n- A.\n\n### ${kind}\n\n- B.\n`)).toBe("minor");
  });

  it("bumps the minor number for entries without a heading", () => {
    expect(suggestedBump("\n- Something.\n")).toBe("minor");
  });
});

describe("releaseChangelog", () => {
  const changelog = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Something.

## [0.1.4] - 2026-10-03

### Fixed

- Older.
`;

  it("moves the Unreleased entries under the new version", () => {
    expect(releaseChangelog(changelog, "0.1.5", "2026-10-05")).toBe(`# Changelog

Intro.

## [Unreleased]

## [0.1.5] - 2026-10-05

### Fixed

- Something.

## [0.1.4] - 2026-10-03

### Fixed

- Older.
`);
  });

  it("works when Unreleased is the only section", () => {
    expect(releaseChangelog("## [Unreleased]\n\n- First.\n", "0.1.0", "2026-10-05")).toBe(
      "## [Unreleased]\n\n## [0.1.0] - 2026-10-05\n\n- First.\n",
    );
  });

  it("refuses an empty Unreleased section", () => {
    expect(() => releaseChangelog(changelog.replace("### Fixed\n\n- Something.\n\n", ""), "0.1.5", "2026-10-05")).toThrow(
      /Nothing to release/,
    );
  });

  it("refuses a missing Unreleased section or an existing version", () => {
    expect(() => releaseChangelog("## [0.1.4] - 2026-10-03\n", "0.1.5", "2026-10-05")).toThrow(/Unreleased/);
    expect(() => releaseChangelog(changelog, "0.1.4", "2026-10-05")).toThrow(/already has a section/);
  });
});

describe("What's new reminder", () => {
  it("spots upgrade notes", () => {
    expect(hasUpgradeNotes("\n### Upgrade notes\n\n1. Add a scope.\n\n### Added\n\n- A.\n")).toBe(true);
    expect(hasUpgradeNotes("\n### Added\n\n- Upgrade notes are mentioned here.\n")).toBe(false);
  });

  it("asks for highlights when the release adds something", () => {
    const reminder = highlightsReminder("0.15.0", "\n### Added\n\n- A.\n");
    expect(reminder).toContain('whatsNew.releases["0.15.0"]');
    expect(reminder).toContain("src/core/help/releases.ts");
    expect(reminder).not.toContain("upgrade");
  });

  it("asks for the upgrade text too when the release has upgrade notes", () => {
    expect(highlightsReminder("0.15.0", "\n### Upgrade notes\n\n1. Add a scope.\n\n### Fixed\n\n- A.\n")).toContain('"upgrade"');
  });

  it("stays quiet for a release with only fixes", () => {
    expect(highlightsReminder("0.14.1", "\n### Fixed\n\n- A.\n")).toBeNull();
  });
});
