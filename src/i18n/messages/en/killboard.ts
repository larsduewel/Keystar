import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;

/** Which side of the killboard a list shows. */
type Side = "kills" | "losses";
type AwardKind = "isk" | "finalBlows" | "solo" | "efficiency";

/** Killboard module: combat statistics from zKillboard and the weekly situation report. */
export const killboard = {
  module: {
    navSection: "Combat",
    nav: { killboard: "Combat Report" },
    alerts: { kills: { label: "Kills and losses", hint: "When a corporation member gets a kill or loses a ship" } },
    permissionGroup: "Combat Report",
    permissions: {
      view: {
        label: "View combat report",
        description: "See the corporation's kills, losses, ship and pilot statistics and the situation report.",
      },
      manage: { label: "Manage combat report", description: "Rewrite the weekly situation report." },
    },
    jobs: {
      zkillSync: "Combat Report (zKillboard)",
      liveFeed: "Combat Report live feed (zKillboard)",
      situationReport: "Combat Report situation report",
    },
  },
  /** Words shared by tables, tiles and charts. */
  terms: {
    kills: "Kills",
    losses: "Losses",
    destroyed: "Destroyed",
    lost: "Lost",
    netIsk: "Net ISK",
    finalBlows: "Final blows",
    solo: "Solo",
    iskDestroyed: "ISK destroyed",
    iskLost: "ISK lost",
    iskEfficiency: "ISK efficiency",
  },
  /** Stand-ins while ESI hasn't resolved a name yet. */
  fallback: {
    corporation: (id: number) => `Corporation ${id}`,
    character: (id: number) => `Character ${id}`,
    type: (id: number) => `Type ${id}`,
    system: "Unknown system",
  },
  page: {
    metaTitle: "Combat Report",
    description: (corp: string) => `${corp} · combat performance from zKillboard`,
    noCorp: {
      title: "No home corporation set",
      body: "The killboard tracks the home corporation's kills and losses on zKillboard. An admin can set it under Admin → Settings.",
    },
    importing: {
      title: "Importing from zKillboard",
      body: (corp: string) =>
        `The worker imports the last 90 days of ${corp}'s killmails from zKillboard, then checks hourly.`,
    },
    empty: {
      title: "No kills or losses yet",
      body: (corp: string) =>
        `zKillboard has no killmails for ${corp} in the last 90 days. New ones appear here within the hour.`,
    },
    lastError: (error: string) => `Last error: ${error}`,
    footer: ({ synced, since, week, prevWeek }: { synced: string | null; since: string | null; week: string; prevWeek: string }) =>
      `Data: zKillboard${synced ? `, synced ${synced}` : ""}${since ? ` · history since ${since}` : ""}. ` +
      "A kill counts when a corporation member is on the killmail; ISK values are zKillboard estimates and count in full " +
      `for every pilot and hull involved. Week-over-week figures compare ${week} with ${prevWeek}.`,
    lastSyncError: (error: string) => `Last sync error: ${error}`,
  },
  stats: {
    totalKills: "Total kills",
    totalLosses: "Total losses",
    /** `value` is already formatted. */
    week: (value: string) => `7d: ${value}`,
    weekInRange: (value: string, range: string) => `7d: ${value} · ${range}`,
    vsPrevWeek: "vs prev 7d",
    noPrevWeek: "No data for the previous 7 days",
    points: (value: number) => `${FORMATTERS.en.number(value, 1)} pts`,
  },
  topPilots: {
    title: "Top pilots",
    mostKills: (period: string) => `Most kills · ${period}`,
    mvp: "MVP",
    efficiency: "Efficiency",
    /** `destroyed` is already formatted. */
    runnerUp: (finalBlows: number, destroyed: string) =>
      `${count(finalBlows, "final blow", "final blows")} · ${destroyed} destroyed`,
    killsUnit: (kills: number): string => (kills === 1 ? "kill" : "kills"),
    awards: {
      isk: "Most ISK destroyed",
      finalBlows: "Most final blows",
      solo: "Most solo kills",
      efficiency: "Best efficiency",
    } satisfies Record<AwardKind, string>,
  },
  pilotTable: {
    title: "Pilot efficiency",
    subtitle: (pilots: number, ticker: string | null) =>
      `${count(pilots, "pilot", "pilots")} flew for ${ticker ? `[${ticker}]` : "the corporation"} in this period`,
    entity: "Pilot",
  },
  columns: {
    kd: "K/D",
    kdTitle: "Kills / losses",
    iskLost: "ISK lost",
    eff: "Eff",
    delta7d: "Δ7d",
    killsDeltaTitle: "Kills, last 7 days vs the 7 days before",
    lossesDeltaTitle: "Losses, last 7 days vs the 7 days before",
    killsDelta: "Δ kills 7d",
    lossesDelta: "Δ losses 7d",
  },
  systems: {
    title: { kills: "Top systems by kills", losses: "Top systems by losses" } satisfies Record<Side, string>,
    /** `change` is already signed and formatted ("+3", "−2", "±0"). */
    subtitle: (side: Side, value: number, change: string) =>
      `7d: ${side === "kills" ? count(value, "kill", "kills") : count(value, "loss", "losses")} (${change} vs prev 7d)`,
    empty: { kills: "No kills in this period.", losses: "No losses in this period." } satisfies Record<Side, string>,
    tooltip: ({ system, side, value, isk, week, prevWeek }: { system: string; side: Side; value: number; isk: string; week: number; prevWeek: number }) =>
      `${system}: ${side === "kills" ? count(value, "kill", "kills") : count(value, "loss", "losses")}, ${isk} ISK. 7d: ${n(week)} (prev ${n(prevWeek)})`,
  },
  breakdown: {
    title: "ISK breakdown",
    kdRatio: "K/D ratio",
    avgPerKill: "Avg ISK / kill",
    avgPerLoss: "Avg ISK / loss",
    noData: "No data",
  },
  recent: {
    title: "Recent activity",
    subtitle: "10 latest kills and losses · opens on zKillboard",
    empty: "No kills or losses in this period.",
    kind: { kill: "Kill", loss: "Loss" } satisfies Record<"kill" | "loss", string>,
    solo: "solo",
  },
  live: {
    api: { unauthorized: "Not signed in", forbidden: "Forbidden" },
    region: "Live kill notifications",
    kind: { kill: "Kill", loss: "Loss" } satisfies Record<"kill" | "loss", string>,
    /** Kill: the corp pilot who scored it; loss: who killed the corp pilot. */
    finalBlow: "Final blow",
    topDamage: "Top damage",
    killedBy: "Killed by",
    others: (n: number) => `+${n} more`,
    npc: "NPC",
    noPilot: "No pilot",
    open: "Open this killmail on zKillboard",
    dismiss: "Dismiss",
  },
  ships: {
    entity: "Ship",
    effectiveTitle: "Most effective ships",
    effectiveSubtitle: "By net ISK: value destroyed while flying the hull minus value lost in it",
    usedTitle: "Most used ships",
    usedSubtitle: "Hulls flown on kills",
    lostTitle: "Most lost ships",
    lostSubtitle: "Hulls lost",
  },
  chart: {
    legend: "Legend",
    view: "Chart or table",
    chart: "Chart",
    table: "Table",
    date: "Date",
  },
  report: {
    title: "Situation report",
    readiness: "Readiness",
    pending: "The first report is written once a full week of killmails has been imported (shortly after 02:00 EVE time).",
    byClaude: (model: string | null) => `Written by Claude (${model ?? "unknown model"})`,
    byTemplate: "Written from the weekly numbers",
    claudeFailed: (error: string) => `Claude failed: ${error}`,
    claudeHint: "Set ANTHROPIC_API_KEY on the server to have Claude write these reports.",
    rewrite: "Rewrite report",
    rewriting: "Writing…",
  },
};
