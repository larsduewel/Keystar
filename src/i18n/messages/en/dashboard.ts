import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** The main dashboard ("/"): corp info row, 30-day kill and mining tiles, characters, roadmap. */
export const dashboard = {
  metaTitle: "Dashboard",
  header: {
    eyebrow: "Overview",
    welcome: (name: string) => `Welcome back, ${name}`,
    /** Stands in for the name when the user has no main character yet. */
    fallbackName: "capsuleer",
    description: "Here is what your corporation has been up to over the last 30 days.",
  },
  info: {
    homeCorp: "Home corporation",
    notConfigured: "Not configured",
    registered: "Registered characters",
    registeredOfMembers: (registered: number, members: number) => `${n(registered)} of ${n(members)} members`,
    registeredOnly: (registered: number) => `${n(registered)} registered`,
    esiAccess: "Your ESI access",
    esiComplete: (healthy: number, total: number) => `${n(healthy)} of ${n(total)} characters OK`,
    syncWorker: "Sync worker",
    workerOnline: "Online",
    workerOffline: "No heartbeat",
  },
  tiles: {
    kills: "Kills · 30 days",
    losses: (count: number) => `${n(count)} ${count === 1 ? "loss" : "losses"}`,
    activePilots: (count: number) => `${n(count)} active ${count === 1 ? "pilot" : "pilots"}`,
    iskDestroyed: "ISK destroyed · 30 days",
    efficiency: "ISK efficiency · 30 days",
    /** Change in percentage points, e.g. "1.5 pts". */
    points: (value: number) => `${FORMATTERS.en.number(value, 1)} pts`,
    iskLost: (isk: string) => `${isk} ISK lost`,
    corpMining: "Corporation mining · 30 days",
    ownMining: "Your mining · 30 days",
    characters: "Your characters",
    esiComplete: "No ESI problems",
    needAttention: (count: number) => `${n(count)} need attention`,
    backgroundSync: "Background sync",
    jobs: (count: number) => `${n(count)} ${count === 1 ? "job" : "jobs"}`,
    failing: (count: number) => `${n(count)} failing`,
    healthy: "Healthy",
    awaitingApproval: "Awaiting approval",
  },
  /** The comparison period of the 30-day tiles. */
  prior: {
    /** Period name for "vs …" / "No data for …". */
    period: "prior 30d",
    suffix: "vs prior 30d",
    empty: "No data for prior 30d",
  },
  panels: {
    killsChart: "Kills over time · last 30 days",
    killsChartSubtitle: "Kills and losses per day",
    recent: "Latest kills and losses",
    recentSubtitle: "Opens on zKillboard",
    corpMining: "Corporation mining · last 30 days",
    ownMining: "Your mining · last 30 days",
    miningSubtitle: "Daily ISK by resource",
    miningOverview: "Mining overview",
    gettingStarted: "Getting started",
    gettingStartedBody:
      "Link your characters while a director approves your account. Optional ESI access, such as your mining ledger, is switched on per character on each feature's page.",
    manageCharacters: "Manage characters",
    mvp: "MVP · last 30 days",
    allPilots: "All pilots",
    syncFailing: (count: number) => `${n(count)} sync ${count === 1 ? "job" : "jobs"} failing`,
    syncStatus: "Sync status",
    characters: "Your characters",
    manage: "Manage",
    tokenRevoked: "Revoked",
    tokenScopes: "Scopes",
    /** No ESI token: nothing was granted, which is fine. */
    noAccess: "No ESI",
  },
  roadmap: {
    title: "On the roadmap",
    items: {
      skills: { title: "Skill plans", text: "Corp skill plans and who can fly what." },
      assets: { title: "Assets", text: "Find items across members and corp hangars." },
      wallets: { title: "Wallets", text: "Corporation divisions and personal wallets." },
    },
  },
};
