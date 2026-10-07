import { FORMATTERS } from "@/lib/format";

const f = FORMATTERS.en;
const n = f.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;
const list = (items: string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(items);

export const gatecheck = {
  module: {
    navItem: "Gate check",
    permissionGroup: "Gate check",
    help: "Plan a stargate route (shortest, safer or less secure) and see kills at the gates along it, live from zKillboard's feed: camps, smartbombs, interdictors and gankers, gate by gate. Estimates how likely a camp is when you get to each gate, from the kills at those gates over the last weeks and the regular campers who are about right now.",
    permissions: {
      use: {
        label: "Use the gate check",
        description: "Plan routes and see kills and camp estimates along them.",
      },
    },
    jobs: { housekeeping: "Gate check housekeeping" },
  },
  page: {
    title: "Gate check",
    description: "Kills at the gates along a route, live, and how likely a camp is when you get there.",
  },
  form: {
    from: "From",
    to: "To",
    fromPlaceholder: "Start system",
    toPlaceholder: "Destination",
    swap: "Swap start and destination",
    preference: "Route",
    preferences: {
      shortest: "Shortest",
      safer: "Safer",
      insecure: "Less secure",
    },
    preferenceHints: {
      shortest: "Fewest jumps, whatever the security.",
      safer: "Stays in high-sec as long as there is a way, like EVE's “Safer” autopilot.",
      insecure: "Prefers low-sec over high-sec, like EVE's “Less secure” autopilot.",
    },
    avoid: "Avoid",
    avoidPlaceholder: "Systems, comma separated",
    submit: "Check route",
  },
  errors: {
    unknownFrom: (name: string) => `“${name}” is no known-space system with stargates.`,
    unknownTo: (name: string) => `“${name}” is no known-space system with stargates.`,
    unknownAvoid: (names: string[]) => `Not found, not avoided: ${list(names)}.`,
    noRoute: "There is no stargate route between these systems (with the avoided systems left out).",
  },
  empty: {
    title: "Where are you going?",
    body: "Enter a start and a destination. Keystar plans the route and checks every gate along it against the kills zKillboard has seen.",
  },
  feed: {
    fresh: (ago: string) => `Live: zKillboard's feed read ${ago}`,
    delayed: (ago: string) => `Delayed: zKillboard's feed last read ${ago}. The newest kills may be missing.`,
    offline: "Offline: Keystar is not reading zKillboard's feed (is the worker running?). “No kills” means nothing right now.",
    never: "No kills yet: Keystar starts reading zKillboard's feed when the worker runs.",
    coverage: (since: string) => `Every kill since ${since}`,
    history: (days: number) => `camp history: ${count(days, "day", "days")}`,
    delay: "Kills reach zKillboard minutes to half an hour after they happen, so the newest camp may not show yet.",
  },
  summary: {
    jumps: (value: number) => count(value, "jump", "jumps"),
    mix: (high: number, low: number, nul: number) => `${n(high)} high · ${n(low)} low · ${n(nul)} null`,
    arrival: "Arrival ≈",
    hotspots: "Watch out",
    noHotspots:
      "No kills at the route's gates in the last two hours and no likely camps. Stay alert anyway: camps that kill nothing leave no trace.",
    route: "Route",
    avoid: "Avoid",
    avoidTitle: (system: string) => `Plan the route around ${system}`,
    avoiding: (names: string[]) => `Avoiding ${list(names)}`,
    eta: "ET",
  },
  status: {
    camp: "Camp",
    recent: "Kills at the gate",
    activity: "Kills in system",
    quiet: "Quiet",
    unknown: "Unknown",
  },
  statusHint: {
    camp: "A player kill at a gate you use in the last 30 minutes, or three within the hour.",
    recent: (hours: number) => `Player kills at a gate you use in the last ${count(hours, "hour", "hours")}.`,
    activity: "Player kills elsewhere in the system: at other gates or away from the gates.",
    quiet: "No kills in the last two hours.",
    unknown: "No kills found, but the feed is behind, so that means little.",
  },
  place: {
    entry: (system: string) => `at the gate from ${system}`,
    exit: (system: string) => `at the gate to ${system}`,
    gate: (system: string) => `at the ${system} gate (not on your route)`,
    elsewhere: "away from the gates",
  },
  tags: {
    smartbomb: "Smartbombs",
    interdictor: "Interdictor",
    hic: "HIC",
    gank: "Gankers",
    hotdrop: "Hot drop",
    pod: "Pods killed",
  },
  tagHints: {
    smartbomb: "Smartbombs did damage: fast ships and pods die before they can align.",
    interdictor: "An Interdictor was on the kill: warp disruption bubbles in null-sec.",
    hic: "A Heavy Interdiction Cruiser was on the kill: bubbles in null-sec, an unbreakable point anywhere.",
    gank: "CONCORD was on the kill: suicide gankers work this gate.",
    hotdrop: "Black Ops, capitals or supercapitals were on the kill.",
    pod: "The camp kills pods too.",
  },
  kill: {
    attackers: (value: number) => count(value, "attacker", "attackers"),
    distance: (km: string) => `${km} km off the gate`,
    onZkill: "Open on zKillboard",
    npc: "NPCs only",
    gankLoss: "Ganker CONCORDed",
    by: "by",
    more: (value: number) => `and ${count(value, "more kill", "more kills")}`,
    otherKills: (value: number) => count(value, "kill elsewhere in the system", "kills elsewhere in the system"),
    npcKills: (value: number) => count(value, "kill by NPCs", "kills by NPCs"),
  },
  prediction: {
    title: "Camp estimate",
    level: {
      low: "Low",
      moderate: "Moderate",
      high: "High",
      severe: "Very high",
    },
    chance: (pct: string) => `${pct} chance`,
    confidence: {
      none: "Too little history yet (under 3 days): the estimate only uses what is happening now.",
      limited: (days: number) => `Based on ${count(days, "day", "days")} of history: still rough.`,
      good: (days: number) => `Based on ${count(days, "day", "days")} of history.`,
    },
    history: (active: number, days: number) =>
      `Kills at these gates around this time of day on ${n(active)} of the last ${count(days, "day", "days")}`,
    campDays: (value: number, days: number) => `Kills at these gates on ${n(value)} of ${count(days, "day", "days")}`,
    live: (ago: string) => `Last kill at a route gate ${ago}`,
    regulars: (value: number) => `${count(value, "regular camper", "regular campers")} seen nearby in the last two hours`,
    quietHistory: "No kills at these gates in the history.",
    hourly: "Kills at these gates by hour (EVE time); the marked hour is when you arrive.",
    regularsTitle: "Regulars at these gates",
    regular: (days: number, kills: number) => `${count(days, "day", "days")}, ${count(kills, "kill", "kills")}`,
    regularHours: (hours: string) => `mostly ${hours}`,
    nearEta: "Active around your arrival time",
    lastSeen: (ago: string) => `last there ${ago}`,
    sighting: (system: string, jumps: number, ago: string) =>
      jumps === 0 ? `killed in ${system} ${ago}` : `killed in ${system} (${count(jumps, "jump", "jumps")} away) ${ago}`,
    groupsTitle: "Behind most kills",
    tagHistory: "Seen at these gates",
    factors: "History · live · regulars",
    disclaimer:
      "An estimate from public killmails, not a forecast. It only knows camps that killed something; it can't see a camp that just formed or one that is waiting.",
  },
  hint: "Kills come from zKillboard's live feed, which Keystar reads anyway for the killboard: checking a route costs zKillboard nothing. A kill within 150 km of a stargate counts as a kill at that gate. Gates only: no wormholes, Ansiblex jump bridges or filaments; Zarzakh is never passed through (its gate lock).",
};
