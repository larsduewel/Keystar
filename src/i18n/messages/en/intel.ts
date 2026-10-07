import type { HullClass } from "@/modules/intel/hulls";
import { hourRange } from "@/modules/intel/text";
import type { DimensionKey, GangSize, Reason, ReasonKey, StandingClass, TagLabel, Tier, TimeZone } from "@/modules/intel/types";
import { FORMATTERS } from "@/lib/format";

const f = FORMATTERS.en;
const n = f.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;
const pct = (share: number) => f.percent(share, 0);
const ago = (iso: string, now: Date) => f.relativeTime(iso, now);
const list = (items: string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(items);

type ThreatLevel = "minimal" | "low" | "elevated" | "high" | "critical";
type Role = "cyno" | "capital" | "logi" | "tackle" | "hunter";
type ReasonOf<K extends ReasonKey> = Extract<Reason, { key: K }>;

const TIERS: Record<Tier | "unknown", string> = {
  low: "Low",
  moderate: "Medium",
  high: "High",
  extreme: "Extreme",
  unknown: "Unknown",
};

const HULL_CLASSES: Record<HullClass, string> = {
  tackle: "Tackle",
  hunter: "Covert / bomber",
  recon: "Recon",
  logistics: "Logistics",
  frigate: "Frigate",
  destroyer: "Destroyer",
  cruiser: "Cruiser",
  battlecruiser: "Battlecruiser",
  battleship: "Battleship",
  capital: "Capital",
  supercapital: "Supercapital",
  blackOps: "Black Ops",
  industrial: "Industrial",
  command: "Command ship",
  pod: "Pod / shuttle",
  other: "Other",
};

const TIME_ZONES: Record<TimeZone, string> = { eu: "EU", use: "US East", usw: "US West", au: "AU", ru: "RU" };

const TAGS: Record<TagLabel, string> = {
  cyno: "Cyno",
  covertCyno: "Covert cyno",
  capital: "Capital",
  supercapital: "Supercapital",
  blops: "Black Ops",
  hunter: "Hunter",
  tackle: "Tackle",
  gatecamper: "Gate camper",
  ganker: "Ganker",
  logi: "Logi",
  fc: "FC",
  solo: "Solo",
  blob: "Blob",
  newchar: "New char",
  npcalt: "NPC corp",
  activenow: "Active now",
};

const historic = (label: string) => `${label} (historic)`;
const tagWord = (tag: { label: TagLabel; historic: boolean }) => (tag.historic ? historic(TAGS[tag.label]) : TAGS[tag.label]);

const GANG: Record<GangSize, string> = {
  solo: "solo",
  small: "small gang (2–9)",
  fleet: "fleets (10–24)",
  blob: "blobs (25+)",
};

const THREAT_LEVELS: Record<ThreatLevel, string> = {
  minimal: "Minimal threat",
  low: "Low threat",
  elevated: "Elevated threat",
  high: "High threat",
  critical: "Critical threat",
};

const ROLES: Record<Role, (value: number) => string> = {
  cyno: (value) => `${n(value)} cyno`,
  capital: (value) => `${n(value)} capital`,
  logi: (value) => `${n(value)} logi`,
  tackle: (value) => `${n(value)} tackle`,
  hunter: (value) => `${n(value)} hunter`,
};

/** Threat intel: pasted pilot lists scored from zKillboard, the corporation's fights and its standings. */
export const intel = {
  module: {
    navItem: "Threat Intel",
    /** "This page" help for the nav item (NavItem.help), one to three sentences. */
    help:
      "Paste local, a fleet or a few names (optionally with a d-scan) to see who the pilots are, their standings, fights with us " +
      "and a threat score from zKillboard. Each scan gets a link anyone with Threat Intel access can open; briefings are written " +
      "by Claude if the server has an API key, otherwise from a template.",
    permissionGroup: "Threat intel",
    permissions: {
      use: {
        label: "Use threat intel",
        description: "Scan pilot lists, open shared scans and see the recently seen hostiles feed.",
      },
      ai: {
        label: "Use Claude for intel",
        description: "Have Claude write scan briefings, pilot dossiers and d-scan reads (uses the instance's API key).",
      },
      manage: { label: "Manage threat intel", description: "Delete any scan." },
    },
    scopes: {
      corporationContacts: "Reads the corporation's contacts so threat scans show blues and reds.",
      allianceContacts: "Reads the alliance's contacts so threat scans show blues and reds.",
    },
    jobs: {
      scanWorker: "Threat intel (zKillboard)",
      briefings: "Threat intel briefings",
      housekeeping: "Threat intel housekeeping",
      corporationContacts: "Corporation contacts (standings)",
      allianceContacts: "Alliance contacts (standings)",
    },
  },
  tiers: TIERS,
  hullClasses: HULL_CLASSES,
  timeZones: TIME_ZONES,
  tags: TAGS,
  /** A tag or dimension reason that was true in the past but has no recent evidence. */
  historic,
  dimensions: {
    activity: "Recent activity",
    lethality: "Lethality",
    style: "Fighting style",
    specialty: "Specialties",
    relevance: "Nearby",
    history: "History with us",
    timezone: "Active now",
    character: "Character",
  } satisfies Record<DimensionKey, string>,
  threatLevels: THREAT_LEVELS,
  confidence: { low: "low", medium: "medium", high: "high" },
  matchConfidence: { likely: "likely", possible: "possible", guess: "guess" },
  roles: ROLES,
  standings: {
    labels: {
      own: "Friendly",
      blue: "Blue",
      lightblue: "Light blue",
      neutral: "Neutral",
      orange: "Orange",
      red: "Red",
    } satisfies Record<StandingClass, string>,
    own: "Your corporation or alliance",
    contact: (source: "corporation" | "alliance" | null, via: "character" | "corporation" | "alliance" | "faction" | null) =>
      `${source === "alliance" ? "Alliance" : "Corporation"} contact${via ? ` (via ${via})` : ""}`,
  },

  /** Reasons behind scores and tags (see Reason in modules/intel/types.ts). Shares are 0–1. */
  reasons: {
    activityRecent: (r: ReasonOf<"activityRecent">, now: Date) =>
      `${count(r.kills7d, "kill", "kills")} in 7 days, ${n(r.kills30d)} in 30${r.lastKillAt ? `; last ${ago(r.lastKillAt, now)}` : ""}`,
    activityWeek: (r: ReasonOf<"activityWeek">) => `${count(r.kills7d, "kill", "kills")} in the last 7 days (zKillboard)`,
    activityQuiet: (r: ReasonOf<"activityQuiet">) =>
      `No kills ${r.days === 30 ? "in 30 days" : "this week"}${r.lastActiveMonth ? `; last active ${r.lastActiveMonth}` : ""}`,
    lethality: (r: ReasonOf<"lethality">) =>
      `${r.killShare === null ? "No recent fights" : `${pct(r.killShare)} kills vs losses`}, ${f.isk(r.iskDestroyed)} destroyed (recency weighted)` +
      (r.finalBlowShare !== null ? `, final blow on ${pct(r.finalBlowShare)}` : ""),
    style: (r: ReasonOf<"style">) => `Mostly ${GANG[r.gang]} (${pct(r.share)})`,
    styleUnknown: () => "No recent kills to judge",
    specialty: (r: ReasonOf<"specialty">) => r.tags.map(tagWord).join(", "),
    specialtyNone: () => "No special roles seen",
    relevance: (r: ReasonOf<"relevance">) => `${count(r.here, "killmail", "killmails")} in this system and ${n(r.nearby)} nearby in 30 days`,
    relevanceBefore: () => "Seen in this area before",
    relevanceNone: () => "No activity in this area",
    relevanceNoSystem: () => "No current system given",
    history: (r: ReasonOf<"history">, now: Date) =>
      `On ${n(r.killsOnUs)} of our losses, lost ${n(r.lossesToUs)} to us${r.lastAt ? `; last ${ago(r.lastAt, now)}` : ""}`,
    historyNone: () => "Never fought us (on our killboard)",
    historyNoHome: () => "No home corporation set",
    timezone: (r: ReasonOf<"timezone">) => {
      const peak = hourRange(r.peakHours);
      return `${pct(r.share)} of activity within an hour of now${peak ? `; peak ${peak} EVE` : ""}${r.zone ? ` (${TIME_ZONES[r.zone]})` : ""}`;
    },
    timezoneUnknown: () => "Not enough activity to tell",
    character: (r: ReasonOf<"character">) =>
      [
        r.ageDays === null ? null : r.ageDays < 30 ? `${count(r.ageDays, "day", "days")} old` : `${n(Math.round(r.ageDays / 30))} months old`,
        r.corpHops ? `${count(r.corpHops, "corporation change", "corporation changes")} this year` : null,
        r.npcCorp ? "NPC corporation" : null,
        r.securityStatus === null ? null : `security status ${f.number(r.securityStatus, 1)}`,
      ]
        .filter(Boolean)
        .join(", "),
    characterNormal: () => "Nothing unusual",
    cynoFits: (r: ReasonOf<"cynoFits">, now: Date) => `Cyno fitted on ${count(r.count, "lost ship", "lost ships")}, last ${ago(r.lastAt, now)}`,
    capitalShare: (r: ReasonOf<"capitalShare">) => `${pct(r.share)} of recent activity in capitals`,
    capitalKillmails: (r: ReasonOf<"capitalKillmails">) => `On ${count(r.count, "capital killmail", "capital killmails")} (zKillboard)`,
    blopsShare: (r: ReasonOf<"blopsShare">) => `${pct(r.share)} of recent activity in Black Ops`,
    blopsKillmails: () => "Black Ops kills on zKillboard",
    hunterShare: (r: ReasonOf<"hunterShare">) => `${pct(r.share)} of activity in covert, bomber or recon hulls, mostly small gang`,
    hunterCloaks: () => "Cloaks on lost ships, mostly small gang",
    tackleShare: (r: ReasonOf<"tackleShare">) => `${pct(r.share)} of activity in interceptors or dictors`,
    tackleFits: () => "Scrams or bubbles on lost ships",
    logiShare: (r: ReasonOf<"logiShare">) => `${pct(r.share)} of activity in logistics hulls`,
    gateKills: (r: ReasonOf<"gateKills">) => `${pct(r.share)} of recent kills on gates, mostly in one system`,
    highsecKills: (r: ReasonOf<"highsecKills">) =>
      `${pct(r.share)} of recent kills in highsec, security status ${f.number(r.securityStatus, 1)}`,
    fcRating: (r: ReasonOf<"fcRating">) => `zKillboard rates their fleet command ${r.level === "high" ? "high" : "medium"}`,
    soloKills: (r: ReasonOf<"soloKills">) => `${pct(r.share)} of recent kills solo`,
    blobKills: (r: ReasonOf<"blobKills">) => `${pct(r.share)} of recent kills with 25+ pilots`,
    newCharacter: (r: ReasonOf<"newCharacter">) => `Created ${count(r.ageDays, "day", "days")} ago`,
    npcCorporation: () => "In an NPC corporation",
    activeNow: (r: ReasonOf<"activeNow">) => `${pct(r.share)} of their activity is around this hour`,
  } satisfies { [K in ReasonKey]: (r: ReasonOf<K>, now: Date) => string },

  errors: {
    tooLong: (max: number) => `That paste is too long (${n(max)} characters at most).`,
    dscanInPilots: "That looks like a d-scan. Paste it into the d-scan box and add the pilots from local.",
    noNames: "No pilot names found. Paste the local member list, a fleet composition or names, one per line.",
    tooMany: (found: number, max: number) => `That list has ${n(found)} pilots; scan at most ${n(max)} at a time.`,
    rateLimited: "That is a lot of scans in a short time. Give zKillboard a few minutes.",
    unknownSystem: (name: string) => `Unknown solar system "${name}".`,
    noCharacters: "None of these names are EVE characters.",
    dscanTooLong: "That d-scan is too long.",
    notDscan: "The d-scan box does not contain a d-scan (copy it from the directional scanner).",
    pasteDscan: "Paste a d-scan (copy it from the directional scanner).",
    scanGone: "That scan no longer exists.",
  },
  api: {
    unauthorized: "Not signed in",
    forbidden: "Forbidden",
    notFound: "Not found",
  },

  index: {
    metaTitle: "Threat Intel",
    title: "Threat Intel",
    description:
      "Paste local, a fleet or a few names: who they are, whether we fought them, and how dangerous they are right now, from zKillboard.",
    scanTitle: "Scan pilots",
    recentTitle: "Your recent scans",
    noScans: "No scans yet.",
    moreNames: (more: number) => `+${n(more)}`,
    feedTitle: "Recently seen hostiles",
    feedSubtitle: (days: number) => `Pilots in anyone's scans over the last ${n(days)} days, newest first. Friendlies are left out.`,
  },
  form: {
    pilots: "Pilots",
    placeholder:
      "Paste the local member list (select all in the member list, Ctrl+C),\na fleet composition, chat lines or names, one per line:\n\nPilot One\nPilot Two\nAnother Pilot",
    addDscan: "Add a d-scan (optional)",
    dscan: "D-scan",
    dscanPlaceholder: "Paste the directional scanner (select all, Ctrl+C). Keystar matches the ships to the pilots above.",
    system: "Current system",
    systemPlaceholder: "optional, e.g. Amamake",
    submit: "Scan pilots",
    submitting: "Scanning…",
    hint:
      "Corporations, standings and fights with us show up immediately. Threat scores follow from zKillboard as the worker " +
      "reads each pilot (about a second per pilot, highest priority first); recent kills come in after that. The current " +
      "system makes kills nearby count more.",
  },
  buttons: {
    briefing: "Briefing",
    closeBriefing: "Close briefing",
    profileMore: (more: number) => `Profile ${n(more)} more`,
    queuing: "Queuing…",
    confirmDelete: "Delete this scan for everyone?",
    delete: "Delete",
    deleting: "Deleting…",
    rewriteBriefing: "Rewrite briefing",
    writeDossier: "Write dossier",
    writeAgain: "Write again",
    writing: "Writing…",
    matchDscan: "Match d-scan",
    replaceDscan: "Replace d-scan",
    matching: "Matching…",
    askClaude: "Ask Claude",
    summarize: "Summarize",
    reading: "Reading…",
  },
  /** Toasts for the scan page's buttons (error codes: `IntelActionError`). */
  toast: {
    deleted: "Scan deleted",
    deleteFailed: "Couldn't delete the scan",
    profiling: (pilots: number) => `Profiling ${count(pilots, "more pilot", "more pilots")}`,
    profileFailed: "Couldn't queue the pilots",
    briefingWritten: "Briefing rewritten",
    dossierWritten: "Dossier written",
    dscanRead: "D-scan read",
    writeFailed: "Couldn't write it",
    errors: {
      forbidden: "You don't have permission to do that any more.",
      notFound: "This scan or pilot no longer exists.",
      notAllowed: "Only the scan's creator or an intel manager can delete it.",
      unknown: "Something went wrong. Reload the page and try again.",
    },
  },
  progress: {
    stats: (pilots: number) => `Reading zKillboard statistics: ${count(pilots, "pilot", "pilots")} to go`,
    newest: (pilots: number) => `Reading recent kills: ${count(pilots, "pilot", "pilots")} to go`,
    deeper: (pilots: number) => `Reading older kills for ${count(pilots, "active pilot", "active pilots")}`,
  },
  scan: {
    metaTitle: "Threat Intel scan",
    title: (pilots: number, system: string | null) => `${count(pilots, "pilot", "pilots")}${system ? ` in ${system}` : ""}`,
    /** `ago` and `at` are already formatted. */
    description: (ago: string, at: string, by: string | null) => `Scanned ${ago} (${at})${by ? ` by ${by}` : ""}`,
    newScan: "New scan",
    pilots: "Pilots",
    foughtUs: "Fought us",
    engagements: (value: number) => count(value, "engagement", "engagements"),
    noFights: "No fights on our killboard",
    groupTitle: "Historical ship profile & associations",
    nonFriendly: (pilots: number) => count(pilots, "non-friendly pilot", "non-friendly pilots"),
    notCharacters: (names: string, more: number) => `Not EVE characters: ${names}${more > 0 ? ` and ${n(more)} more` : ""}`,
    pilotsTitle: "Pilots",
    allFriendly: "Everyone here is friendly.",
    friendlyPilots: (pilots: number) => count(pilots, "friendly pilot", "friendly pilots"),
    historyTitle: "History with us",
    /** ISK values are already formatted. */
    historySubtitle: (p: { pilots: number; engagements: number; ourKills: number; iskKilled: string; ourLosses: number; iskLost: string }) =>
      `Fought ${n(p.pilots)} of these pilots in ${count(p.engagements, "engagement", "engagements")}: we killed ${n(p.ourKills)} ` +
      `(${p.iskKilled} ISK) and lost ${n(p.ourLosses)} (${p.iskLost} ISK). Newest first, from our killboard.`,
    olderEngagements: (value: number) => `${count(value, "older engagement", "older engagements")}`,
    noHome: "Set the home corporation in Settings to see fights with these pilots.",
    shareTitle: "Share",
    shareHint: "Anyone in the corporation who can use threat intel can open this scan.",
    pasteDscan: "Paste a d-scan",
    replaceDscan: "Replace the d-scan",
    templateHint: "Briefings come from a template. Set ANTHROPIC_API_KEY to have Claude write them.",
  },
  evidence: {
    situation: "Local situation",
    snapshotHint: "Presence in the pasted snapshot. Combat and fittings below are historical evidence.",
    interest: "Pilots to review",
    newest: "Last combat evidence",
    lastKill: "Latest known kill",
    lastLoss: "Latest known loss",
    cyno: "Cyno fit history",
    association: "Historical associates",
    unknown: "Unknown",
    noEvent: "No record in loaded data",
    noCyno: "No fitted cyno found in sampled losses",
    unknownCyno: "Unknown — loss fittings not yet loaded",
    cynoTagCaution: "Fitted modules on sampled losses only. Cyno activation and fight association unknown. Counts are fittings, not cynos opened.",
    ourTeam: "Our ships",
    theirTeam: "Their ships",
    shipsLost: (count: number) => `${count} lost`,
    battleCoverage: "Recorded ships only; unrecorded participants and their ISK are unknown.",
    engagementPages: "Engagement pages",
    engagementPage: "Engagement",
    engagementWithUs: "Engagement with us",
    allianceLegend: "Alliances / corporations",
    noAlliance: "No alliance / affiliation unknown",
    cynoTagLegend: "Cyno icon: fitted-module history. Activation and fight association unknown.",
    cynoHint: "Sampled losses only; no guaranteed 365-day coverage. Current fit unknown.",
    snapshot: "Local snapshot",
    notProvided: "Not provided",
    groups: "Recent observed group",
    groupsHint: "Shared killmails within 2 hours; up to 6 hours as a fallback. Only non-friendly pilots in this Local snapshot are shown.",
    noGroup: "No shared recent killmail found in loaded profiles. A recent group reconstruction is unavailable.",
    groupBrief: "Historical co-attack; current fleet unknown.",
    groupCaution: "Historical co-attack observations, not current fleet composition. Complete roster, current ships and affiliation of co-attackers are unknown. Subsequent losses may invalidate earlier hull observations.",
    recent: "Within 2 hours",
    fallback: "2–6 hour fallback",
    changed: "Hull changed during this sample",
    noSafety: "Absent evidence does not establish safety.",
    historyHint: "Historical records from our killboard.",
    sampleHint: "Latest available records in the loaded sample; killboards and cached profiles can be incomplete.",
    statsUnknown: "Killboard statistics check: unknown.",
    recentKills: "Recent kills",
    recentLosses: "Recent losses",
    writtenBriefing: "Optional written briefing — historical interpretation",
    dscanCaution: "D-scan is a pasted ship observation. Matches are correlations with historical hull use; they do not identify who is flying a ship. Paste again to update.",
    associated: (value: number) => `${count(value, "pilot", "pilots")} linked by historical shared kills`,
    oldestCheck: (ago: string, checked: number, total: number) => `Oldest statistics check: ${ago} (${n(checked)}/${count(total, "pilot", "pilots")} checked)`,
    cynoKinds: { cyno: "Standard", covertCyno: "Covert", industrialCyno: "Industrial" },
    observedHull: (ship: string) => `Pilot observed in: ${ship}`,
    attackers: (value: number) => count(value, "recorded attacker", "recorded attackers"),
    fittedLosses: (value: number) => `${count(value, "fitted loss", "fitted losses")} in loaded sample`,
    associates: (value: number) => value ? `${count(value, "pilot", "pilots")} from this snapshot ${value === 1 ? "shares" : "share"} recorded kills` : "No shared kills found",
    highInterest: (value: number) => `${n(value)} rated high / extreme`,
    incomplete: (value: number) => value ? `${count(value, "non-friendly profile lacks", "non-friendly profiles lack")} detailed killmail data` : "Based on loaded historical profiles",
    pasted: (ago: string) => `Pasted ${ago}`,
    tileKill: "Latest kill",
    tileLoss: "Latest loss",
    tileCyno: "Cyno history",
    tileNoCyno: "None in sampled losses",
    tileAssociates: "Shared Local pilots",
    latestGroupFight: "Latest recorded fight",
    destroyedHull: (ship: string) => `Destroyed: ${ship}`,
    involvedLocalPilots: "Involved local pilots",
    oneVictim: "1 victim",
    groupCount: (pilots: number, kills: number) => `${count(pilots, "Local pilot", "Local pilots")} · ${count(kills, "shared killmail", "shared killmails")}`,
    killmail: (id: number) => `Killmail ${id}`,
    profileBuilt: (ago: string) => `Profile built ${ago}.`,
    statsChecked: (ago: string) => `Killboard statistics checked ${ago}.`,
  },
  pilot: {
    onOurLosses: (losses: number) => `on ${n(losses)} of our losses`,
    diedToUs: (losses: number) => `${n(losses)} died to us`,
    /** `ago` is already formatted. */
    lastFought: (ago: string) => `Last ${ago}`,
    notProfiled: "not profiled",
    noHistory: "no killboard history",
    zkillUnavailable: "zKillboard unavailable",
    queued: "queued…",
    corporation: (id: number) => `Corporation ${id}`,
    alliance: (id: number) => `Alliance ${id}`,
    unknownCorporation: "Unknown corporation",
    latestTitle: "Latest kills and losses",
    whyTitle: "Why this score",
    fliesWith: (pilots: string) => `Shares historical kills with ${pilots} from this snapshot.`,
    againstUs: "Against us",
    /** ISK values and times are already formatted. */
    againstUsText: (p: { killsOnUs: number; iskOnUs: string; lossesToUs: number; iskToUs: string; first: string; last: string }) =>
      `On ${n(p.killsOnUs)} of our losses (${p.iskOnUs} ISK), lost ${count(p.lossesToUs, "ship", "ships")} to us (${p.iskToUs} ISK). ` +
      `First ${p.first}, last ${p.last}.`,
    unknownHull: "Unknown hull",
    fullProfile: "Full profile",
  },
  score: {
    sample: "Sampled killmails",
    capability: "Combat capability",
    relevance: "Local relevance",
    confidence: "Confidence",
    explanation: "Score /10: 70% capability + 30% local relevance; capability only if context is unknown. Capability: 45% activity, 30% lethality, 25% fighting style. Fleet participation and ISK count less. Combat/local evidence halves after 14/3 days. Confidence measures sample size, freshness and coverage. Historical evidence, not attack probability; escalation is separate.",
    quick: "Quick score from zKillboard statistics; recent kills are still loading",
    damped: (gate: number) => `Score damped to ${pct(gate)} because the pilot has not been active recently.`,
  },
  latest: {
    /** "Killed Rifter" / "Lost Sabre" on a chip. */
    chip: (isLoss: boolean, ship: string | null) => `${isLoss ? "Lost" : "Killed"} ${ship ?? "ship"}`,
    srKind: (isLoss: boolean): string => (isLoss ? "Loss: " : "Kill: "),
    /** `isk` is already formatted. */
    title: (p: { isLoss: boolean; ship: string | null; system: string | null; isk: string; attackers: number }) =>
      `${p.isLoss ? "Lost" : "Killed"} ${p.ship ?? "a ship"}${p.system ? ` in ${p.system}` : ""} · ${p.isk} ISK · ${count(p.attackers, "attacker", "attackers")}`,
    solo: "solo",
    pilots: (pilots: number) => count(pilots, "pilot", "pilots"),
    /** `ago` is already formatted. */
    lastSeen: (isLoss: boolean, ship: string | null, ago: string, system: string | null) =>
      `Last seen ${isLoss ? "losing" : "flying"} ${ship ?? "a ship"}, ${ago}${system ? ` in ${system}` : ""}`,
    recentlyFlying: "Historical hulls",
  },
  group: {
    threat: "Threat",
    reds: "Red standings",
    likelyFlying: "Historical ship profile",
    waiting: "Waiting for recent kills.",
    likelyHint: "Dominant recorded hull class per pilot; recent week preferred, older history used when needed. Current ships unknown.",
    flyTogether: "Shared kill history",
    clusterPilots: (pilots: number) => count(pilots, "pilot", "pilots"),
    noClusters: "No shared kills between these pilots yet.",
    unaffiliated: "unaffiliated",
    groupPilots: (pilots: number, who: string) => `${n(pilots)} ${who}`,
  },
  heatmap: {
    none: "No activity pattern on zKillboard.",
    label: "Kills per weekday and EVE hour",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    cell: (day: string, hour: string, kills: number) => `${day} ${hour}:00 EVE: ${count(kills, "kill", "kills")}`,
  },
  engagements: {
    system: (id: number) => `System ${id}`,
    /** `isk` is already formatted. */
    killed: (ships: number, isk: string) => `${n(ships)} killed · ${isk}`,
    lost: (ships: number, isk: string) => `${n(ships)} lost · ${isk}`,
    brought: "They brought",
    with: (groups: string) => `With ${groups}`,
    fromGroup: (pilots: number, who: string) => `${n(pilots)} from ${who}`,
    unknown: "unknown",
    battleReport: "Battle report",
    biggestKill: "Biggest killmail",
  },
  notes: {
    briefingTitle: "Briefing",
    briefingPending: "The briefing is written once the most dangerous pilots have their recent kills loaded.",
    noBriefing: "No briefing for this scan.",
    byClaude: (model: string | null) => `Written by Claude (${model ?? "unknown model"})`,
    readByClaude: (model: string | null) => `Read by Claude (${model ?? "unknown model"})`,
    byTemplate: "Written from a template",
    unavailable: (reason: string) => `Claude unavailable: ${reason}`,
    instanceBudget: "the instance's hourly Claude budget is used up",
    userBudget: (limit: number) => `you reached ${n(limit)} Claude notes this hour`,
    dossierTitle: "Dossier",
    confidence: (level: string) => `Confidence: ${level}`,
    dossierHint: "A short written profile of this pilot, from the facts on this page.",
    dossierNotAllowed: "Your role cannot ask for dossiers.",
    dossierTemplateHint: "Without ANTHROPIC_API_KEY the dossier comes from a template.",
  },
  dscan: {
    add: "Add d-scan",
    manage: "View / replace d-scan",
    title: "D-scan",
    subtitle: (ships: number) => `${count(ships, "ship", "ships")} in the pasted scan; historical hull correlations below.`,
    empty: "No directional scan supplied. Paste one to compare observed ships with historical activity.",
    unknown: (ships: number) => `+${n(ships)} unknown`,
    nobody: "Nobody in this list flew it recently",
    noShips: "No ships on this d-scan.",
    placeholder: "Paste the directional scanner (select all, Ctrl+C).",
  },
  feed: {
    none: "Nobody hostile scanned in the last week.",
    /** `ago` is already formatted. */
    seen: (p: { ago: string; system: string | null; by: string | null; times: number; fought: boolean }) =>
      `Seen ${p.ago}${p.system ? ` in ${p.system}` : ""}${p.by ? ` by ${p.by}` : ""}${p.times > 1 ? ` · ${n(p.times)} scans` : ""}${p.fought ? " · fought us" : ""}`,
    hidden: (pilots: number) => `${count(pilots, "more low-threat pilot", "more low-threat pilots")} not shown.`,
  },
  pilotPage: {
    browserPreview: (kills: string, losses: string) => `Browser preview: ${kills} kills · ${losses} losses. Awaiting server verification.`,
    metaTitle: "Pilot profile",
    back: "Back to scan",
    noData: (queued: boolean) => `No zKillboard data for this pilot yet${queued ? " — it is on its way." : "."}`,
    latestSubtitle: "Newest first; open one on zKillboard.",
    noKillmails: "No killmails recently.",
    loading: "Recent killmails are still loading.",
    kills7d: "Kills 7 days",
    kills30d: (kills: number) => `${n(kills)} in 30 days`,
    losses30d: "Losses 30 days",
    losses7d: (losses: number) => `${n(losses)} in 7 days`,
    lastKill: "Last kill",
    lastActiveMonth: (month: string) => `Last active month ${month}`,
    character: "Character",
    age: (days: number) => count(days, "day", "days"),
    security: (value: number) => `Security ${f.number(value, 1)}`,
    ships: "Ships",
    shipsSubtitle: "Recency weighted, most flown first.",
    type: (id: number) => `Type ${id}`,
    notScored: "Not scored yet.",
    whenTitle: "When they fight",
    mostlyZone: (zone: TimeZone) => `Mostly ${TIME_ZONES[zone]} time zone`,
    fightsTitle: "Fights with us",
    fightsSubtitle: "From our killboard, newest first.",
    fliesWithTitle: "Flies with",
    fliesWithSubtitle: "Pilots sharing the most kills (from this scan in bold).",
    shared: (kills: number) => `${n(kills)} shared`,
    noWingmen: "No regular wingmen on record.",
    pilot: (id: number) => `Pilot ${id}`,
    corpHistoryTitle: "Corporation history",
    /** `date` is already formatted. */
    since: (date: string) => `since ${date}`,
    notLoaded: "Not loaded.",
    lifetimeTitle: "Lifetime (zKillboard)",
    lifetime: (p: { kills: number; losses: number; iskDestroyed: number; iskLost: number; danger: number | null; solo: number | null; gang: number | null }) =>
      `${count(p.kills, "kill", "kills")}, ${count(p.losses, "loss", "losses")}, ${f.isk(p.iskDestroyed)} destroyed, ${f.isk(p.iskLost)} lost` +
      (p.danger !== null ? ` · danger ${f.percent(p.danger / 100, 0)}` : "") +
      (p.solo !== null ? ` · solo ${f.percent(p.solo / 100, 0)}` : "") +
      (p.gang ? ` · average gang ${f.number(p.gang, p.gang < 10 ? 1 : 0)}` : "") +
      ".",
  },

  /**
   * Sentences of the briefing, dossier and d-scan read written without
   * Claude (modules/intel/ai/template.ts). Text may use the report markup:
   * **bold**, {+good}, {-bad}, {@Pilot}.
   */
  template: {
    headline: (pilots: number, system: string | null, level: ThreatLevel) =>
      `${count(pilots, "non-friendly pilot", "non-friendly pilots")}${system ? ` in ${system}` : ""}: ${THREAT_LEVELS[level].toLowerCase()}`,
    recentActive: (pilots: number, latest: string[]) =>
      `${count(pilots, "pilot", "pilots")} got kills in the last week; most recently ${list(latest)}.`,
    recentPilot: (name: string, latest: { isLoss: boolean; ship: string | null; at: string } | null, now: Date) =>
      latest ? `{@${name}} (${latest.isLoss ? "a loss" : "a kill"} in **${latest.ship ?? "a ship"}**, ${ago(latest.at, now)})` : `{@${name}}`,
    recentQuiet: (pilots: number, system: string | null) =>
      `None of the ${count(pilots, "non-friendly pilot", "non-friendly pilots")}${system ? ` in **${system}**` : ""} got a kill in the last week.`,
    mostDangerous: (pilots: string[]) => `Highest-rated historical profiles: ${list(pilots)}.`,
    dangerousPilot: (name: string, tier: Tier | "unknown", tags: { label: TagLabel; historic: boolean }[]) =>
      `{@${name}} (${TIERS[tier].toLowerCase()}${tags.length ? `, ${tags.map(tagWord).join(", ")}` : ""})`,
    composition: (comp: { cls: HullClass; pilots: number }[], roles: { role: Role; count: number }[], together: string[][]) =>
      `${comp.length ? `Historical hull profile: ${list(comp.map((c) => `${n(c.pilots)} ${HULL_CLASSES[c.cls].toLowerCase()}`))}` : "No recent hulls on record"}` +
      `${roles.length ? `; roles seen: ${list(roles.map((r) => ROLES[r.role](r.count)))}` : ""}.` +
      (together.length ? ` ${list(together.map((g) => g.map((name) => `{@${name}}`).join(", ")))} fly together.` : ""),
    lastFight: (
      fight: { pilots: string[]; at: string; system: string | null; brought: { ship: string | null; count: number }[]; weKilled: number; weLost: number; iskKilled: number; iskLost: number },
      now: Date,
    ) =>
      `We last fought ${list(fight.pilots.map((name) => `{@${name}}`))} ${ago(fight.at, now)} in **${fight.system ?? "?"}**: ` +
      `they brought ${list(fight.brought.map((b) => `${b.count > 1 ? `${n(b.count)}× ` : ""}${b.ship ?? "?"}`))}; ` +
      `we killed ${n(fight.weKilled)} ({+${f.isk(fight.iskKilled)}}) and lost ${n(fight.weLost)} ({-${f.isk(fight.iskLost)}}).`,
    keyPilotFallback: (tier: Tier | "unknown") => `${TIERS[tier]} threat`,
    advice: {
      minimal: "Nobody here has been dangerous lately; operate normally and keep an eye on local.",
      low: "Little recent activity; stay aligned and watch d-scan.",
      elevated: "Some active PvP pilots are here; travel aligned, avoid lingering on gates and keep a scout out.",
      high: "Active, dangerous pilots are here; avoid solo travel and expect tackle on gates.",
      critical: "An active, dangerous group is here; dock up or form a fleet before undocking.",
    } satisfies Record<ThreatLevel, string>,
    dossierSummary: (name: string, tier: Tier | "unknown", score: number | null, tags: { label: TagLabel; historic: boolean }[]) =>
      tier === "unknown"
        ? `{@${name}} has no threat rating yet.`
        : `{@${name}} is a ${TIERS[tier].toLowerCase()} threat${score !== null ? ` (${n(score)})` : ""}${tags.length ? `: ${tags.map(tagWord).join(", ")}` : ""}.`,
    dossierLatest: (latest: { isLoss: boolean; ship: string | null; system: string | null; at: string }, kills7d: number, kills30d: number | null, now: Date) =>
      `Latest: ${latest.isLoss ? "a loss" : "a kill"} in **${latest.ship ?? "a ship"}** ${ago(latest.at, now)} in **${latest.system ?? "?"}**. ` +
      `${count(kills7d, "kill", "kills")} in the last 7 days${kills30d !== null ? `, ${n(kills30d)} in 30` : ""}.`,
    dossierQuiet: (lastActiveMonth: string | null) => `No recent killmails${lastActiveMonth ? `; last active ${lastActiveMonth}` : ""}.`,
    flies: (ships: string[]) => `Flies ${list(ships)}`,
    zone: (zone: TimeZone) => `mostly ${TIME_ZONES[zone]} time zone`,
    dossierHistory: (h: { killsOnUs: number; lossesToUs: number; lastAt: string | null }, now: Date) =>
      `On ${n(h.killsOnUs)} of our losses and died to us ${count(h.lossesToUs, "time", "times")}${h.lastAt ? `; last ${ago(h.lastAt, now)}` : ""}.`,
    dscanAssessment: (ships: number, comp: { cls: HullClass; count: number }[], matched: number) =>
      `${count(ships, "ship", "ships")} on scan: ${list(comp.map((c) => `${n(c.count)}× ${HULL_CLASSES[c.cls]}`))}. ` +
      (matched ? `${count(matched, "pilot", "pilots")} from local match a hull they flew recently.` : "No pilot in local has flown these hulls recently."),
    flewHull: (lastAt: string | null, now: Date) => (lastAt ? `Flew this hull ${ago(lastAt, now)}` : "Flew this hull before"),
    fliesClass: (cls: HullClass) => `Flies ${HULL_CLASSES[cls].toLowerCase()} hulls`,
    unplaced: (ships: string[]) => `Nobody in local is known to fly ${list(ships)}; they may be off the list or in new hulls.`,
  },
};
