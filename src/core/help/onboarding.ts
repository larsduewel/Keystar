import { releasesUrl, releaseUrl } from "@/core/version";
import { compareVersions, parseVersion } from "@/lib/semver";
import { releaseEntries, type HighlightRef, type ReleaseEntry } from "./releases";

/*
 * Which dialog opens by itself when an account loads Keystar (pure; the layout calls it):
 * the welcome tour once per account, then What's new after each update. `users.seen_version`
 * holds the version the account was shown last and is only ever raised.
 */

/** Who sees a release's upgrade notes: whoever can change the settings, i.e. runs the server. */
export const UPGRADE_NOTES_PERMISSION = "app.settings.manage";
/** Highlight cards per dialog; the rest are counted ("and 2 more highlights"). */
export const WHATS_NEW_CAP = 4;

export interface WhatsNewDigest {
  /** `update`: opened by itself after an update; `latest`: opened from the help or the sidebar. */
  mode: "update" | "latest";
  /** The version in the title: the running one after an update, else the release shown. */
  version: string;
  /** After an update that skipped releases or brought none of its own: the version seen last. */
  from: string | null;
  /** Releases the cards come from, newest first. */
  versions: string[];
  highlights: HighlightRef[];
  /** Visible highlights beyond the cap. */
  more: number;
  /** Releases whose upgrade notes the viewer should read (admins only), with their release page. */
  upgrades: { version: string; href: string }[];
  /** The release notes: the release's page for one release, else the list. */
  href: string;
}

export type Onboarding =
  | { kind: "welcome" }
  | { kind: "whatsNew"; digest: WhatsNewDigest }
  /** `markSeen`: nothing to show, but the account is on a newer version than it saw. */
  | { kind: "none"; markSeen: boolean };

type Can = (permission: string) => boolean;

/** What of a release this viewer sees: highlights they have a permission for, upgrade notes if they run the server. */
function visible(entry: ReleaseEntry, can: Can) {
  return {
    version: entry.version,
    highlights: entry.highlights.filter((h) => !h.anyPermission || h.anyPermission.some(can)),
    upgrade: entry.upgrade && can(UPGRADE_NOTES_PERMISSION),
  };
}

/** The releases after `after` (exclusive; null = all) up to `upTo` (inclusive) as one dialog, or null if none has anything for the viewer. */
export function whatsNewDigest(
  releases: readonly ReleaseEntry[],
  opts: { after: string | null; upTo: string; can: Can; sourceUrl: string; mode: WhatsNewDigest["mode"]; cap?: number },
): WhatsNewDigest | null {
  const { after, upTo, can, sourceUrl, mode, cap = WHATS_NEW_CAP } = opts;
  const parts = releases
    .filter((r) => (after === null || compareVersions(r.version, after) > 0) && compareVersions(r.version, upTo) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((r) => visible(r, can))
    .filter((p) => p.highlights.length > 0 || p.upgrade);
  if (parts.length === 0) return null;
  const versions = parts.map((p) => p.version);
  const all = parts.flatMap((p) => p.highlights.map((h) => ({ version: p.version, key: h.key })));
  const exact = mode === "latest" || (versions.length === 1 && versions[0] === upTo);
  return {
    mode,
    version: mode === "update" ? upTo : versions[0]!,
    from: exact ? null : after,
    versions,
    highlights: all.slice(0, cap),
    more: Math.max(0, all.length - cap),
    upgrades: parts.filter((p) => p.upgrade).map((p) => ({ version: p.version, href: releaseUrl(sourceUrl, p.version) })),
    href: exact ? releaseUrl(sourceUrl, versions[0]!) : releasesUrl(sourceUrl),
  };
}

/** What opens by itself for an account that last saw `seenVersion` while `current` runs. */
export function onboarding(opts: {
  seenVersion: string | null;
  current: string;
  can: Can;
  sourceUrl: string;
  releases?: readonly ReleaseEntry[];
  cap?: number;
}): Onboarding {
  const { seenVersion, current, can, sourceUrl, releases = releaseEntries(), cap } = opts;
  if (!parseVersion(current)) return { kind: "none", markSeen: false };
  if (seenVersion === null || !parseVersion(seenVersion)) return { kind: "welcome" };
  // Same version, or a downgrade: nothing new, and the stored version stays.
  if (compareVersions(seenVersion, current) >= 0) return { kind: "none", markSeen: false };
  const digest = whatsNewDigest(releases, { after: seenVersion, upTo: current, can, sourceUrl, mode: "update", cap });
  return digest ? { kind: "whatsNew", digest } : { kind: "none", markSeen: true };
}

/** The newest release up to `current` with something for the viewer: the help's and sidebar's "What's new". */
export function latestDigest(opts: {
  current: string;
  can: Can;
  sourceUrl: string;
  releases?: readonly ReleaseEntry[];
  cap?: number;
}): WhatsNewDigest | null {
  const { current, can, sourceUrl, releases = releaseEntries(), cap } = opts;
  for (const release of [...releases].sort((a, b) => compareVersions(b.version, a.version))) {
    if (compareVersions(release.version, current) > 0) continue;
    const digest = whatsNewDigest([release], { after: null, upTo: release.version, can, sourceUrl, mode: "latest", cap });
    if (digest) return digest;
  }
  return null;
}

/**
 * Sidebar "New" dots: the pages of the newest release up to `current` that has highlights, as far
 * as the viewer may open them. Each dot goes once its page was opened in this browser.
 */
export function navNews(opts: { current: string; can: Can; releases?: readonly ReleaseEntry[] }): { version: string; hrefs: string[] } | null {
  const { current, can, releases = releaseEntries() } = opts;
  const release = [...releases]
    .sort((a, b) => compareVersions(b.version, a.version))
    .find((r) => compareVersions(r.version, current) <= 0 && r.highlights.length > 0);
  if (!release) return null;
  const hrefs = visible(release, can).highlights.flatMap((h) => (h.href ? [h.href] : []));
  return hrefs.length ? { version: release.version, hrefs: [...new Set(hrefs)] } : null;
}

/** Whether to store `current` as seen: the stored version only ever goes up. */
export function shouldRecordSeen(seenVersion: string | null, current: string): boolean {
  if (!parseVersion(current)) return false;
  return seenVersion === null || !parseVersion(seenVersion) || compareVersions(seenVersion, current) < 0;
}
