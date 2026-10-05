import type { Messages } from "@/i18n/messages";
import type { DscanMatchRow } from "../dscan";
import type { HullClass } from "../hulls";
import type { DisplayNames } from "../names";
import { reasonText } from "../text";
import type { Engagement, Reason, TagLabel, Tier, TimeZone } from "../types";
import type { BriefingInput, FactsPilot } from "./facts";
import type { Briefing, Confidence, Dossier, DscanRead, MatchConfidence, StoredNote, ThreatLevel } from "./types";

/**
 * Notes written without Claude (not configured, not allowed, over budget or
 * failed). Deterministic and factual, recent activity first.
 *
 * A template note is stored as a draft (keys, numbers, names and times) and
 * written out when it is shown, in the reader's language (`t.intel.template`).
 */

type TagRef = { label: TagLabel; historic: boolean };
type Role = keyof GroupRoles;
type GroupRoles = BriefingInput["summary"]["roles"];

export interface BriefingDraft {
  level: ThreatLevel;
  system: string | null;
  nonFriendly: number;
  /** Pilots with kills in the last week, most dangerous first (the first three with their latest killmail). */
  activeCount: number;
  active: { name: string; latest: { isLoss: boolean; ship: string | null; at: string } | null }[];
  top: { characterId: number; name: string; tier: Tier | "unknown"; tags: TagRef[]; why: Reason | null }[];
  comp: { cls: HullClass; pilots: number }[];
  roles: { role: Role; count: number }[];
  flyTogether: string[][];
  fight: {
    pilots: string[];
    at: string;
    system: string | null;
    brought: { ship: string | null; count: number }[];
    weKilled: number;
    weLost: number;
    iskKilled: number;
    iskLost: number;
  } | null;
}

export interface DossierDraft {
  name: string;
  tier: Tier | "unknown";
  score: number | null;
  tags: TagRef[];
  latest: { isLoss: boolean; ship: string | null; system: string | null; at: string } | null;
  kills7d: number;
  /** Null without a deep pass (only statistics). */
  kills30d: number | null;
  lastActiveMonth: string | null;
  style: Reason | null;
  ships: string[];
  zone: TimeZone | null;
  history: { killsOnUs: number; lossesToUs: number; lastAt: string | null } | null;
  confidence: Confidence;
}

export interface DscanDraft {
  ships: number;
  comp: { cls: HullClass; count: number }[];
  assignments: { typeId: number; characterId: number; confidence: MatchConfidence; exact: boolean; lastAt: string | null; cls: HullClass }[];
  unplaced: string[];
}

const typeName = (names: DisplayNames, id: number | null | undefined) => (id ? (names.types.get(id)?.name ?? null) : null);
const systemName = (names: DisplayNames, id: number | null | undefined) => (id ? (names.systems.get(id)?.name ?? null) : null);
const isFriendly = (p: FactsPilot) => p.standing.cls === "own" || p.standing.cls === "blue";
const tagRefs = (p: FactsPilot): TagRef[] => (p.score?.tags ?? []).map((t) => ({ label: t.label, historic: t.evidence !== "recent" }));
const HOUR_MS = 3_600_000;

export function threatLevelOf(input: Pick<BriefingInput, "summary" | "engagements" | "now">): ThreatLevel {
  const t = input.summary.tiers;
  const roles = input.summary.roles;
  const recentLoss = input.engagements
    .slice(0, 5)
    .some((e) => e.ourLosses > e.ourKills && input.now.getTime() - Date.parse(e.start) < 48 * HOUR_MS);
  // High is now the top tier. Include legacy extreme counts for saved inputs.
  const high = t.high + t.extreme;
  if (high >= 2 || (high >= 1 && (roles.cyno > 0 || roles.capital > 0 || recentLoss))) return "critical";
  if (high >= 1) return "high";
  if (t.moderate >= 2) return "elevated";
  if (t.moderate >= 1) return "low";
  return "minimal";
}

function fightDraft(e: Engagement, names: DisplayNames, pilotNames: Map<number, string>): BriefingDraft["fight"] {
  return {
    pilots: e.pilots.slice(0, 4).map((p) => pilotNames.get(p.characterId) ?? String(p.characterId)),
    at: e.start,
    system: systemName(names, e.systemId),
    brought: e.brought.slice(0, 5).map((b) => ({ ship: typeName(names, b.shipTypeId), count: b.count })),
    weKilled: e.ourKills,
    weLost: e.ourLosses,
    iskKilled: e.iskKilled,
    iskLost: e.iskLost,
  };
}

export function templateBriefing(input: BriefingInput): BriefingDraft {
  const { names } = input;
  const pilotNames = new Map(input.pilots.map((p) => [p.characterId, p.name]));
  const ranked = input.pilots.filter((p) => !isFriendly(p)).sort((a, b) => (b.score?.composite ?? -1) - (a.score?.composite ?? -1));
  const active = ranked.filter((p) => (p.profile?.recent.kills7d ?? 0) > 0);
  const top = ranked.filter((p) => p.score?.tier === "high" || p.score?.tier === "extreme").slice(0, 5);
  return {
    level: threatLevelOf(input),
    system: input.scan.system,
    nonFriendly: ranked.length,
    activeCount: active.length,
    active: active.slice(0, 3).map((p) => {
      const k = p.profile?.recent.latest[0];
      return { name: p.name, latest: k ? { isLoss: k.isLoss, ship: typeName(names, k.shipTypeId), at: k.time } : null };
    }),
    top: top.map((p) => ({
      characterId: p.characterId,
      name: p.name,
      tier: p.score!.tier,
      tags: tagRefs(p).slice(0, 3),
      why: p.score!.dimensions.find((d) => d.available)?.why ?? null,
    })),
    comp: input.summary.comp.slice(0, 4).map((c) => ({ cls: c.cls, pilots: c.pilots })),
    roles: (Object.entries(input.summary.roles) as [Role, number][]).filter(([, n]) => n > 0).map(([role, count]) => ({ role, count })),
    flyTogether: input.summary.clusters.slice(0, 2).map((c) => c.map((id) => pilotNames.get(id) ?? String(id))),
    fight: input.engagements[0] ? fightDraft(input.engagements[0], names, pilotNames) : null,
  };
}

export function renderBriefing(d: BriefingDraft, t: Messages, now: Date = new Date()): Briefing {
  const s = t.intel.template;
  const paragraphs: string[] = [];
  if (d.top.length) paragraphs.push(s.mostDangerous(d.top.map((p) => s.dangerousPilot(p.name, p.tier, p.tags))));
  if (d.comp.length || d.roles.length) paragraphs.push(s.composition(d.comp, d.roles, d.flyTogether));
  if (d.fight) paragraphs.push(s.lastFight(d.fight, now));
  return {
    headline: s.headline(d.nonFriendly, d.system, d.level),
    threatLevel: d.level,
    recent: d.activeCount
      ? s.recentActive(d.activeCount, d.active.map((p) => s.recentPilot(p.name, p.latest, now)))
      : s.recentQuiet(d.nonFriendly, d.system),
    paragraphs,
    keyPilots: d.top.map((p) => ({ characterId: p.characterId, note: p.why ? reasonText(t, p.why, now) : s.keyPilotFallback(p.tier) })),
    advice: s.advice[d.level],
  };
}

export function templateDossier(pilot: FactsPilot, names: DisplayNames): DossierDraft {
  const profile = pilot.profile;
  const r = profile?.recent;
  const k = r?.latest[0];
  const h = pilot.history;
  const deep = profile?.depth === "deep";
  return {
    name: pilot.name,
    tier: pilot.score?.tier ?? "unknown",
    score: pilot.score && pilot.score.tier !== "unknown" ? pilot.score.composite : null,
    tags: tagRefs(pilot),
    latest: k ? { isLoss: k.isLoss, ship: typeName(names, k.shipTypeId), system: systemName(names, k.systemId), at: k.time } : null,
    kills7d: r?.kills7d ?? 0,
    kills30d: deep && r ? r.kills30d : null,
    lastActiveMonth: profile?.lifetime.lastActiveMonth ?? null,
    style: pilot.score?.dimensions.find((x) => x.key === "style" && x.available)?.why ?? null,
    ships: (profile?.hulls ?? [])
      .slice(0, 3)
      .map((x) => typeName(names, x.shipTypeId))
      .filter((x): x is string => !!x),
    zone: profile?.timezone.zone ?? null,
    history: h && h.killsOnUs + h.lossesToUs > 0 ? { killsOnUs: h.killsOnUs, lossesToUs: h.lossesToUs, lastAt: h.lastAt } : null,
    confidence: deep && r && r.kills30d + r.losses30d >= 10 ? "high" : k ? "medium" : "low",
  };
}

export function renderDossier(d: DossierDraft, t: Messages, now: Date = new Date()): Dossier {
  const s = t.intel.template;
  return {
    summary: s.dossierSummary(d.name, d.tier, d.score, d.tags),
    recentActivity: d.latest ? s.dossierLatest(d.latest, d.kills7d, d.kills30d, now) : s.dossierQuiet(d.lastActiveMonth),
    playstyle: [d.style ? reasonText(t, d.style, now) : null, d.ships.length ? s.flies(d.ships) : null, d.zone ? s.zone(d.zone) : null]
      .filter(Boolean)
      .join("; "),
    watchFor: d.tags.slice(0, 4).map((tag) => (tag.historic ? t.intel.historic(t.intel.tags[tag.label]) : t.intel.tags[tag.label])),
    historyWithUs: d.history ? s.dossierHistory(d.history, now) : null,
    confidence: d.confidence,
  };
}

export function templateDscan(rows: DscanMatchRow[]): DscanDraft {
  const comp = new Map<HullClass, number>();
  for (const r of rows) comp.set(r.cls, (comp.get(r.cls) ?? 0) + r.count);
  return {
    ships: rows.reduce((n, r) => n + r.count, 0),
    comp: [...comp.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cls, count]) => ({ cls, count })),
    assignments: rows.flatMap((r) =>
      r.assigned.map((a) => {
        const c = r.candidates.find((x) => x.characterId === a.characterId);
        return { typeId: r.typeId, characterId: a.characterId, confidence: a.confidence, exact: !!c?.exact, lastAt: c?.lastAt ?? null, cls: r.cls };
      }),
    ),
    unplaced: [...new Set(rows.filter((r) => r.assigned.length < r.count).map((r) => r.name))].slice(0, 5),
  };
}

export function renderDscan(d: DscanDraft, t: Messages, now: Date = new Date()): DscanRead {
  const s = t.intel.template;
  return {
    assessment: s.dscanAssessment(d.ships, d.comp, d.assignments.length),
    assignments: d.assignments.map((a) => ({
      typeId: a.typeId,
      characterId: a.characterId,
      confidence: a.confidence,
      reason: a.exact ? s.flewHull(a.lastAt, now) : s.fliesClass(a.cls),
    })),
    notes: d.unplaced.length ? s.unplaced(d.unplaced) : "",
  };
}

/** A stored note as the reader sees it: Claude's text as written, a template draft in the reader's language. */
export function readBriefing(note: StoredNote<unknown>, t: Messages): StoredNote<Briefing> {
  return note.source === "template" ? { ...note, content: renderBriefing(note.content as BriefingDraft, t) } : (note as StoredNote<Briefing>);
}

export function readDossier(note: StoredNote<unknown>, t: Messages): StoredNote<Dossier> {
  return note.source === "template" ? { ...note, content: renderDossier(note.content as DossierDraft, t) } : (note as StoredNote<Dossier>);
}

export function readDscan(note: StoredNote<unknown>, t: Messages): StoredNote<DscanRead> {
  return note.source === "template" ? { ...note, content: renderDscan(note.content as DscanDraft, t) } : (note as StoredNote<DscanRead>);
}
