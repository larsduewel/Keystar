import { Brain, Factory, GraduationCap, Pickaxe, Route, Store, type LucideIcon } from "lucide-react";
import type { Messages } from "@/i18n/messages";
import { en } from "@/i18n/messages/en";
import { compareVersions } from "@/lib/semver";
import { StarMap } from "@/modules/map/icon";

/*
 * What's new: 2–4 highlights per release, added in the release PR (docs/releasing.md).
 * Icons, links and permissions live here; titles and texts in the `whatsNew.releases`
 * dictionaries, keyed the same way, so a highlight without its text (or the other way
 * round) fails the typecheck. Old releases can be removed again: an account that skipped
 * them just sees fewer cards. Isomorphic: the What's new dialog imports it for the icons.
 */

type ReleaseTexts = Messages["whatsNew"]["releases"];
export type ReleaseVersion = keyof ReleaseTexts & string;
type ItemKey<V extends ReleaseVersion> = keyof ReleaseTexts[V]["items"] & string;

export interface HighlightDef {
  icon: LucideIcon;
  kind: "new" | "improved";
  /** The page the card opens: a nav item's href, which also gets the sidebar's "New" dot. */
  href?: string;
  /** Shown to viewers with any of these permissions (omit = everyone). Use the nav item's. */
  anyPermission?: string[];
}

/** Display order is key order. Admins also see the release's `upgrade` text, if it has one. */
type ReleaseDef<V extends ReleaseVersion> = { [K in ItemKey<V>]: HighlightDef };

export const RELEASES: { [V in ReleaseVersion]: ReleaseDef<V> } = {
  "0.19.0": {
    mapPlanning: { icon: StarMap, kind: "improved", href: "/map", anyPermission: ["map.view"] },
    gateCheck: { icon: Route, kind: "new", href: "/gatecheck", anyPermission: ["gatecheck.use"] },
    marketOrders: { icon: Store, kind: "new", href: "/market", anyPermission: ["market.view.own"] },
    remapOptimiser: { icon: Brain, kind: "new", href: "/skills/remap", anyPermission: ["skills.view.own", "skills.view.corp"] },
  },
  "0.15.0": {
    gateCheck: { icon: Route, kind: "new", href: "/gatecheck", anyPermission: ["gatecheck.use"] },
    marketOrders: { icon: Store, kind: "new", href: "/market", anyPermission: ["market.view.own"] },
    remapOptimiser: { icon: Brain, kind: "new", href: "/skills/remap", anyPermission: ["skills.view.own", "skills.view.corp"] },
    miningAccess: { icon: Pickaxe, kind: "improved", href: "/mining", anyPermission: ["mining.view.own", "mining.view.corp"] },
  },
  "0.14.0": {
    industryJobs: { icon: Factory, kind: "new", href: "/industry", anyPermission: ["industry.view.own"] },
    universeMap: { icon: StarMap, kind: "new", href: "/map", anyPermission: ["map.view"] },
    skillTimeline: { icon: GraduationCap, kind: "improved", href: "/skills", anyPermission: ["skills.view.own", "skills.view.corp"] },
    miningOreTypes: { icon: Pickaxe, kind: "improved", href: "/mining", anyPermission: ["mining.view.own", "mining.view.corp"] },
  },
};

export interface ReleaseEntry {
  version: string;
  /** The release has upgrade notes for whoever runs the server (`whatsNew.releases[v].upgrade`). */
  upgrade: boolean;
  highlights: (HighlightDef & { key: string })[];
}

/** Every release with highlights, newest first. */
export function releaseEntries(): ReleaseEntry[] {
  const texts = en.whatsNew.releases as Record<string, { upgrade?: string }>;
  return Object.entries(RELEASES as Record<string, Record<string, HighlightDef>>)
    .map(([version, highlights]) => ({
      version,
      upgrade: Boolean(texts[version]?.upgrade),
      highlights: Object.entries(highlights).map(([key, def]) => ({ key, ...def })),
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** A highlight as the server hands it to the What's new dialog (icons don't serialise). */
export interface HighlightRef {
  version: string;
  key: string;
}

type LooseTexts = Record<string, { upgrade?: string; items: Record<string, { title: string; body: string }> }>;

/** Title and text of a highlight in the viewer's language. */
export function highlightText(t: Messages, ref: HighlightRef): { title: string; body: string } {
  return (t.whatsNew.releases as LooseTexts)[ref.version]?.items[ref.key] ?? { title: ref.key, body: "" };
}

/** The highlight's icon, kind and link. */
export function highlightDef(ref: HighlightRef): HighlightDef | undefined {
  return (RELEASES as Record<string, Record<string, HighlightDef>>)[ref.version]?.[ref.key];
}

/** A release's upgrade notes in the viewer's language, if it has any. */
export function upgradeText(t: Messages, version: string): string | null {
  return (t.whatsNew.releases as LooseTexts)[version]?.upgrade ?? null;
}
