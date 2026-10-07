import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseVersion } from "@/lib/semver";

/**
 * Prepares a release in the working tree: bumps "version" in package.json and
 * turns CHANGELOG.md's "## [Unreleased]" section into the new version's
 * section, with a fresh empty "## [Unreleased]" above it. Commits, pushes and
 * releases nothing: see docs/releasing.md.
 *
 *   pnpm release:prepare            # minor, or patch when only fixes are unreleased
 *   pnpm release:prepare patch      # or minor, major, or an exact version such as 0.3.0
 */

const UNRELEASED = /^## \[Unreleased\][^\n]*\n/m;

function parse(version: string): [number, number, number] {
  const parsed = parseVersion(version);
  if (!parsed) throw new Error(`"${version}" is not a version like 1.2.3`);
  return parsed;
}

/** The version after `current` for a bump ("patch", "minor", "major") or an exact, higher version. */
export function nextVersion(current: string, bump: string): string {
  const [major, minor, patch] = parse(current);
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "major") return `${major + 1}.0.0`;
  const next = parse(bump);
  const cur = [major, minor, patch];
  const i = next.findIndex((n, k) => n !== cur[k]);
  if (i === -1 || next[i] < cur[i]) throw new Error(`${bump} is not higher than the current version ${current}`);
  return bump;
}

/** The entries under CHANGELOG.md's "## [Unreleased]" heading, and where that heading is. */
export function unreleased(changelog: string): { start: number; bodyStart: number; body: string } {
  const heading = UNRELEASED.exec(changelog);
  if (!heading) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  const bodyStart = heading.index + heading[0].length;
  const nextSection = changelog.slice(bodyStart).search(/^## \[/m);
  const body = changelog.slice(bodyStart, nextSection === -1 ? undefined : bodyStart + nextSection);
  if (!body.trim()) throw new Error('Nothing to release: "## [Unreleased]" in CHANGELOG.md is empty');
  return { start: heading.index, bodyStart, body };
}

/**
 * The bump the Unreleased entries call for (docs/releasing.md): patch when they are
 * only "### Fixed" and "### Security", minor otherwise. Never major.
 */
export function suggestedBump(body: string): "patch" | "minor" {
  const kinds = [...body.matchAll(/^### (.+?)\s*$/gm)].map((m) => m[1]);
  return kinds.length > 0 && kinds.every((k) => k === "Fixed" || k === "Security") ? "patch" : "minor";
}

/** Whether the entries have `### Upgrade notes`: steps for whoever runs the server. */
export function hasUpgradeNotes(body: string): boolean {
  return /^### Upgrade notes\b/m.test(body);
}

/**
 * The step that reminds the release's author of the What's new highlights (src/core/help/releases.ts),
 * or null for a release with only fixes, which needs none.
 */
export function highlightsReminder(version: string, body: string): string | null {
  const upgrade = hasUpgradeNotes(body);
  if (suggestedBump(body) === "patch" && !upgrade) return null;
  const where = `RELEASES in src/core/help/releases.ts and whatsNew.releases["${version}"] in src/i18n/messages/{en,de}/whats-new.ts`;
  return (
    `Add 2–4 What's new highlights for v${version}: ${where} (docs/releasing.md).` +
    (upgrade ? ` It has upgrade notes: also write their short form as "upgrade" there, which admins see.` : "")
  );
}

/** CHANGELOG.md with its Unreleased entries moved under "## [version] - date" and a new empty Unreleased section. */
export function releaseChangelog(changelog: string, version: string, date: string): string {
  const { start, bodyStart } = unreleased(changelog);
  if (changelog.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
  return changelog.slice(0, start) + `## [Unreleased]\n\n## [${version}] - ${date}\n` + changelog.slice(bodyStart);
}

const isMain = process.argv[1] && /release-prepare\.(ts|mjs|js)$/.test(process.argv[1]);
if (isMain) {
  try {
    const root = process.cwd();
    const pkgPath = path.join(root, "package.json");
    const changelogPath = path.join(root, "CHANGELOG.md");
    const pkg = readFileSync(pkgPath, "utf8");
    const current: string = JSON.parse(pkg).version;
    const before = readFileSync(changelogPath, "utf8");
    const body = unreleased(before).body;
    const bump = process.argv[2] ?? suggestedBump(body);
    const version = nextVersion(current, bump);
    const date = new Date().toISOString().slice(0, 10);
    const changelog = releaseChangelog(before, version, date);
    // Replace only the version line, keeping package.json's formatting.
    writeFileSync(pkgPath, pkg.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`));
    writeFileSync(changelogPath, changelog);
    const why = process.argv[2] ? "" : ` (${bump}, from the Unreleased headings; pass patch/minor/major to override)`;
    const steps = [
      highlightsReminder(version, body),
      "Review the diff, then commit and push to main (or open a pull request and merge it).",
      "When CI has passed on that commit: GitHub → Actions → Release → Run workflow (on main).",
    ].filter((step): step is string => step !== null);
    console.log(`Prepared v${version}${why}, was ${current}: package.json and CHANGELOG.md updated.

Next:
${steps.map((step, i) => `  ${i + 1}. ${step}`).join("\n")}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
