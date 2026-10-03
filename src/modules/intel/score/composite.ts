import { hullClass, type HullClass } from "../hulls";
import type {
  DimensionKey,
  DimensionScore,
  Evidence,
  PilotHistory,
  PilotProfile,
  PilotScore,
  PilotTag,
  Reason,
  Standing,
  TagKey,
  TagLabel,
  Tier,
} from "../types";
import { clamp, DAY_MS, saturate, weightAt } from "./decay";

/**
 * Turns a profile into explained scores. Every dimension is 0–100 with a
 * reason (data, written out in the reader's language by text.ts); the composite is their weighted average, damped for pilots
 * who are not active right now (the recency gate), so lifetime fame alone
 * never makes a pilot dangerous today.
 */

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  activity: 0.315,
  lethality: 0.21,
  style: 0.175,
  specialty: 0,
  relevance: 0.21,
  history: 0.09,
  timezone: 0,
  character: 0,
};

const TAG_SEVERITY: Record<TagKey, number> = {
  cyno: 25,
  capital: 30,
  blops: 25,
  hunter: 20,
  tackle: 15,
  gatecamper: 15,
  ganker: 15,
  logi: 10,
  fc: 10,
  solo: 10,
  blob: 0,
  newchar: 0,
  npcalt: 0,
  activenow: 0,
};

/** Historic-only tags count this much toward the specialty score. */
const HISTORIC_TAG_FACTOR = 0.25;

export interface ScoreContext {
  now: Date;
  standing: Standing;
  /** Null when no home corporation is set (history unknown). */
  history: PilotHistory | null | undefined;
  historyAvailable: boolean;
  /** The scan's system, if one was given. */
  system: { systemId: number; constellationId: number | null; regionId: number | null } | null;
  /** Constellation and region of the systems in the profile. */
  systemsInfo: Map<number, { constellationId: number | null; regionId: number | null }>;
}

export function tierOf(composite: number): Tier {
  if (composite >= 80) return "high";
  if (composite >= 50) return "moderate";
  return "low";
}

/** Shares are stored with two decimals. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Share of recent hull use per class, plus when each class was last flown. */
function classUse(profile: PilotProfile) {
  const total = profile.hulls.reduce((s, h) => s + h.weight, 0);
  const byClass = new Map<HullClass, { share: number; lastAt: string | null }>();
  for (const h of profile.hulls) {
    const c = hullClass(h.groupId);
    const e = byClass.get(c) ?? { share: 0, lastAt: null };
    e.share += total ? h.weight / total : 0;
    if (h.lastAt && (!e.lastAt || h.lastAt > e.lastAt)) e.lastAt = h.lastAt;
    byClass.set(c, e);
  }
  return byClass;
}

export function computeTags(profile: PilotProfile, ctx: Pick<ScoreContext, "now">): PilotTag[] {
  const tags: PilotTag[] = [];
  const recentWindow = 30 * DAY_MS;
  const isRecent = (iso: string | null | undefined) => !!iso && ctx.now.getTime() - Date.parse(iso) <= recentWindow;
  const deep = profile.depth === "deep";
  const classes = classUse(profile);
  // Hull evidence is "recent" when the digest saw it in the last 30 days, or from zKillboard's recent ships.
  const hullTag = (cls: HullClass[], minShare: number): { evidence: "recent" | "lifetime"; share: number } | null => {
    let share = 0;
    let lastAt: string | null = null;
    for (const c of cls) {
      const e = classes.get(c);
      if (!e) continue;
      share += e.share;
      if (e.lastAt && (!lastAt || e.lastAt > lastAt)) lastAt = e.lastAt;
    }
    if (share < minShare) return null;
    return { evidence: !deep || isRecent(lastAt) ? "recent" : "lifetime", share };
  };
  const add = (key: TagKey, label: TagLabel, evidence: "recent" | "lifetime", why: Reason) => tags.push({ key, label, evidence, why });

  const cyno = profile.fits.cyno ?? profile.fits.covertCyno ?? profile.fits.industrialCyno;
  if (cyno) {
    const covert = profile.fits.covertCyno;
    const lastAt = [profile.fits.cyno, profile.fits.covertCyno, profile.fits.industrialCyno]
      .filter(Boolean)
      .map((f) => f!.lastAt)
      .sort()
      .at(-1)!;
    const count = (profile.fits.cyno?.count ?? 0) + (covert?.count ?? 0) + (profile.fits.industrialCyno?.count ?? 0);
    add("cyno", covert ? "covertCyno" : "cyno", isRecent(lastAt) ? "recent" : "lifetime", { key: "cynoFits", count, lastAt });
  }

  const capital = hullTag(["capital", "supercapital"], 0.05);
  const capFlags = profile.flags.capital + profile.flags.super + profile.flags.titan;
  if (capital || capFlags > 0) {
    const sup = (classes.get("supercapital")?.share ?? 0) > 0 || profile.flags.super + profile.flags.titan > 0;
    add(
      "capital",
      sup ? "supercapital" : "capital",
      capital?.evidence ?? "lifetime",
      capital ? { key: "capitalShare", share: round2(capital.share) } : { key: "capitalKillmails", count: capFlags },
    );
  }

  const blops = hullTag(["blackOps"], 0.05);
  if (blops || profile.flags.blops > 0) {
    add("blops", "blops", blops?.evidence ?? "lifetime", blops ? { key: "blopsShare", share: round2(blops.share) } : { key: "blopsKillmails" });
  }

  const gang = profile.decayed.gang;
  const gangTotal = gang.solo + gang.small + gang.fleet + gang.blob;
  const smallShare = gangTotal ? (gang.solo + gang.small) / gangTotal : 0;
  const hunterHulls = hullTag(["hunter", "recon"], 0.2);
  const cloaked = profile.fits.cloak ?? profile.fits.covertCloak;
  if ((hunterHulls || cloaked) && smallShare >= 0.5) {
    add(
      "hunter",
      "hunter",
      hunterHulls?.evidence ?? (isRecent(cloaked?.lastAt) ? "recent" : "lifetime"),
      hunterHulls ? { key: "hunterShare", share: round2(hunterHulls.share) } : { key: "hunterCloaks" },
    );
  }

  const tackle = hullTag(["tackle"], 0.2);
  const tackleFits = (profile.fits.scram?.count ?? 0) + (profile.fits.bubble?.count ?? 0);
  if (tackle || tackleFits >= 2) {
    add("tackle", "tackle", tackle?.evidence ?? "lifetime", tackle ? { key: "tackleShare", share: round2(tackle.share) } : { key: "tackleFits" });
  }

  const logi = hullTag(["logistics"], 0.2);
  if (logi) add("logi", "logi", logi.evidence, { key: "logiShare", share: round2(logi.share) });

  const k = profile.decayed.kills;
  if (k >= 3 && profile.decayed.gateKills / k >= 0.6) {
    const top = profile.systems[0];
    const topShare = top ? top.weight / profile.systems.reduce((s, x) => s + x.weight, 0) : 0;
    if (topShare >= 0.5 && profile.recent.kills30d >= 8) {
      add("gatecamper", "gatecamper", "recent", { key: "gateKills", share: round2(profile.decayed.gateKills / k) });
    }
  }

  const sec = profile.character.securityStatus;
  if (k >= 2 && profile.decayed.highsecKills / k >= 0.5 && sec !== null && sec < -2) {
    add("ganker", "ganker", "recent", { key: "highsecKills", share: round2(profile.decayed.highsecKills / k), securityStatus: sec });
  }

  if (profile.flags.fcLevel === "medium" || profile.flags.fcLevel === "high") {
    add("fc", "fc", "lifetime", { key: "fcRating", level: profile.flags.fcLevel });
  }

  if (gangTotal >= 1.5 && gang.solo / gangTotal >= 0.5) add("solo", "solo", "recent", { key: "soloKills", share: round2(gang.solo / gangTotal) });
  if (gangTotal >= 1.5 && gang.blob / gangTotal >= 0.5) add("blob", "blob", "recent", { key: "blobKills", share: round2(gang.blob / gangTotal) });

  const ageDays = profile.character.ageDays;
  if (ageDays !== null && ageDays < 30) add("newchar", "newchar", "recent", { key: "newCharacter", ageDays });
  if (profile.character.npcCorp) add("npcalt", "npcalt", "recent", { key: "npcCorporation" });

  return tags;
}

function dimension(key: DimensionKey, score: number, why: Reason, evidence: Evidence, available = true): DimensionScore {
  return { key, score: Math.round(clamp(score)), weight: DIMENSION_WEIGHTS[key], available, why, evidence };
}


export function scorePilot(profile: PilotProfile | null, ctx: ScoreContext): PilotScore {
  const excluded = ctx.standing.cls === "own" ? "own" : ctx.standing.cls === "blue" ? "blue" : null;
  if (!profile || profile.depth === "none") {
    return { composite: 0, tier: "unknown", recencyGate: 0, dimensions: [], tags: [], excluded, quick: true };
  }
  const deep = profile.depth === "deep";
  const recentEvidence: Evidence = deep || profile.recent.kills7d > 0 ? "recent" : "lifetime";
  const ageWeight = weightAt(profile.builtAt, ctx.now, 14);
  const raw = profile.decayed;
  const d = { ...raw, kills: raw.kills * ageWeight, losses: raw.losses * ageWeight, iskDestroyed: raw.iskDestroyed * ageWeight, finalBlows: raw.finalBlows * ageWeight, gang: {solo: raw.gang.solo * ageWeight, small: raw.gang.small * ageWeight, fleet: raw.gang.fleet * ageWeight, blob: raw.gang.blob * ageWeight} };
  const r = profile.recent;
  const dims: DimensionScore[] = [];

  // Activity
  const gang = d.gang;
  const gangCount = gang.solo + gang.small + gang.fleet + gang.blob;
  const contribution = gangCount ? (gang.solo + 0.8 * gang.small + 0.25 * gang.fleet + 0.05 * gang.blob) / gangCount : 0.5;
  const activity = saturate(d.kills * contribution, 6);
  const lastActiveMonth = profile.lifetime.lastActiveMonth;
  const activityWhy: Reason = deep
    ? r.kills30d
      ? { key: "activityRecent", kills7d: r.kills7d, kills30d: r.kills30d, lastKillAt: r.lastKillAt }
      : { key: "activityQuiet", days: 30, lastActiveMonth }
    : r.kills7d
      ? { key: "activityWeek", kills7d: r.kills7d }
      : { key: "activityQuiet", days: 7, lastActiveMonth };
  dims.push(dimension("activity", activity, activityWhy, d.kills > 0.05 ? recentEvidence : "none"));

  // Lethality
  const kd = d.kills + d.losses > 0 ? (d.kills / (d.kills + d.losses)) * Math.min(1, d.kills / 4) : 0;
  const isk = clamp(((Math.log10(d.iskDestroyed + 1) - 7) / 3.5) * 100) / 100;
  const fb = d.kills > 0 ? d.finalBlows / d.kills : 0;
  const lethality = deep ? 100 * (0.7 * kd + 0.1 * isk + 0.2 * fb) : 100 * ((0.7 * kd + 0.1 * isk) / 0.8);
  dims.push(
    dimension(
      "lethality",
      lethality,
      {
        key: "lethality",
        killShare: d.kills + d.losses > 0 ? round2(d.kills / (d.kills + d.losses)) : null,
        iskDestroyed: Math.round(d.iskDestroyed),
        finalBlowShare: deep && d.kills > 0 ? round2(fb) : null,
      },
      d.kills > 0.05 ? recentEvidence : "none",
    ),
  );

  // Style
  const g = d.gang;
  const gangTotal = g.solo + g.small + g.fleet + g.blob;
  const styleRaw = gangTotal ? (100 * (g.solo + 0.8 * g.small + 0.25 * g.fleet + 0.05 * g.blob)) / gangTotal : 0;
  const style = styleRaw * Math.min(1, gangTotal / 2);
  const dominant = gangTotal
    ? (
        [
          ["solo", g.solo],
          ["small", g.small],
          ["fleet", g.fleet],
          ["blob", g.blob],
        ] as const
      ).reduce((a, b) => (b[1] > a[1] ? b : a))
    : null;
  dims.push(
    dimension(
      "style",
      style,
      dominant ? { key: "style", gang: dominant[0], share: round2(dominant[1] / gangTotal) } : { key: "styleUnknown" },
      gangTotal > 0.05 ? recentEvidence : "none",
      gangTotal > 0.05,
    ),
  );

  // Specialties
  const tags = computeTags(profile, ctx);
  const specialty = tags.reduce((s, t) => s + TAG_SEVERITY[t.key] * (t.evidence === "recent" ? 1 : HISTORIC_TAG_FACTOR), 0);
  const scoredTags = tags.filter((t) => TAG_SEVERITY[t.key] > 0);
  dims.push(
    dimension(
      "specialty",
      specialty,
      scoredTags.length ? { key: "specialty", tags: scoredTags.map((t) => ({ label: t.label, historic: t.evidence !== "recent" })) } : { key: "specialtyNone" },
      scoredTags.some((t) => t.evidence === "recent") ? "recent" : scoredTags.length ? "lifetime" : "none",
    ),
  );

  // Nearby
  if (ctx.system) {
    let x = 0;
    let here = 0;
    let region = 0;
    for (const event of profile.recent.latest) {
      const w = weightAt(event.time, ctx.now, 3);
      const info = ctx.systemsInfo.get(event.systemId);
      if (event.systemId === ctx.system.systemId) { x += w; here++; }
      else if (info?.constellationId && info.constellationId === ctx.system.constellationId) { x += 0.6 * w; region++; }
      else if (info?.regionId && info.regionId === ctx.system.regionId) { x += 0.3 * w; region++; }
    }
    const why: Reason = here || region ? { key: "relevance", here, nearby: region } : x > 0 ? { key: "relevanceBefore" } : { key: "relevanceNone" };
    dims.push(dimension("relevance", saturate(x, 3), why, x > 0 ? "recent" : "none", deep && profile.recent.latest.length > 0));
  } else {
    dims.push(dimension("relevance", 0, { key: "relevanceNoSystem" }, "none", false));
  }

  // History with us
  const h = ctx.history;
  if (ctx.historyAvailable && h && h.killsOnUs + h.lossesToUs > 0) {
    const score = Math.max(h.killsOnUs > 0 ? 15 : 0, saturate(h.weight, 2));
    dims.push(dimension("history", score, { key: "history", killsOnUs: h.killsOnUs, lossesToUs: h.lossesToUs, lastAt: h.lastAt }, "recent"));
  } else {
    dims.push(
      dimension("history", 0, ctx.historyAvailable ? { key: "historyNone" } : { key: "historyNoHome" }, "none", false),
    );
  }

  // Active now
  const hours = d.hours;
  const hourTotal = hours.reduce((a, b) => a + b, 0);
  const nowHour = ctx.now.getUTCHours();
  const aroundNow = [23, 0, 1].reduce((s, o) => s + hours[(nowHour + o) % 24], 0);
  const share = hourTotal ? aroundNow / hourTotal : 0;
  dims.push(
    dimension(
      "timezone",
      100 * Math.min(1, share / 0.5),
      hourTotal
        ? { key: "timezone", share: round2(share), peakHours: profile.timezone.peakHours, zone: profile.timezone.zone }
        : { key: "timezoneUnknown" },
      hourTotal ? recentEvidence : "none",
      hourTotal > 0.05,
    ),
  );
  if (hourTotal > 0.5 && share >= 0.25 && d.kills > 0.5) {
    tags.push({ key: "activenow", label: "activenow", evidence: "recent", why: { key: "activeNow", share: round2(share) } });
  }

  // Capability and local relevance are separate. Missing context never means safe.
  const mean = (weights: Partial<Record<DimensionKey, number>>) => {
    const parts = dims.filter(d => d.available && (weights[d.key] ?? 0) > 0);
    const sum = parts.reduce((s, d) => s + weights[d.key]!, 0);
    return sum ? parts.reduce((s, d) => s + d.score * weights[d.key]!, 0) / sum : null;
  };
  const capability = Math.round(mean({ activity: 0.45, lethality: 0.3, style: 0.25 }) ?? 0);
  const relevance = mean({ relevance: 0.7, history: 0.3 });
  const sample = deep ? profile.recent.kills30d + profile.recent.losses30d : 0;
  const fresh = sample > 0 && profile.recent.latest.some(e => ctx.now.getTime() - Date.parse(e.time) <= 30 * DAY_MS);
  const covered = profile.recent.coveredSince ? (ctx.now.getTime() - Date.parse(profile.recent.coveredSince)) / DAY_MS : 0;
  const confidence = deep && sample >= 12 && fresh && covered >= 14 ? "high" : deep && sample >= 3 && fresh ? "moderate" : "low";
  const composite = Math.round(clamp(relevance === null ? capability : 0.7 * capability + 0.3 * relevance));
  const recencyGate = 1;
  return {
    assessment: { capability, relevance: relevance === null ? null : Math.round(relevance), confidence, sample, escalation: tags.filter(t => ["cyno", "capital", "blops"].includes(t.key)).map(t => t.label) },
    composite,
    tier: sample === 0 ? "unknown" : tierOf(composite),
    recencyGate: Math.round(recencyGate * 1000) / 1000,
    dimensions: dims,
    tags,
    excluded,
    quick: !deep,
  };
}

