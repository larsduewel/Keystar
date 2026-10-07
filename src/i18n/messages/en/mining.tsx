import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import type { ChartClass, MoonOreClass } from "@/modules/mining/class-colors";
import type { MiningMetric, MiningSource } from "@/modules/mining/filters";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Mining module: overview, ledger, moon drills, field estimator. */
export const mining = {
  module: {
    navSection: "Industry",
    nav: {
      overview: "Mining Overview",
      ledger: "Mining Ledger",
      observers: "Moon Drills",
      estimator: "Field Estimator",
      pnl: "Mining P&L",
    },
    permissionGroup: "Mining",
    permissions: {
      viewOwn: { label: "View own mining", description: "See the mining ledger of your own characters." },
      viewCorp: { label: "View corporation mining", description: "See mining of all members and at corporation moon drills." },
      export: { label: "Export mining data", description: "Download ledgers as CSV." },
      pnl: {
        label: "Mining P&L",
        description: "Personal income and expense sheet for your own characters (never other members').",
      },
    },
    scopes: {
      characterMining: "Reads your personal mining ledger: all ore, ice, gas and moon mining of the last 30 days (opt-in).",
      characterMiningLabel: "Mining ledger access",
      corporationMining: "Reads the moon-drill ledgers of corporation refineries.",
      structures: "Names refineries on the Moon Drills page.",
    },
    jobs: {
      characterLedger: "Personal mining ledger",
      observers: "Moon-drill ledgers",
      structures: "Refinery names",
    },
    /** "This page" help for the nav items (NavItem.help), one to three sentences each. */
    help: {
      overview:
        "Mining totals for the chosen period: ISK value, volume, a daily chart, top miners, ores and systems. With corporation access you can switch between the whole corporation and your own characters; otherwise you see only yours. Each pilot chooses on the Access page which characters share their personal ledger; it syncs every 15 minutes and moon drills hourly. ESI keeps 30 days, Keystar everything after that.",
      ledger:
        "Every entry behind the Mining Overview, grouped by day: one row per character, ore and system (or refinery) with units, volume and ISK value. The filters work as on the overview; with the export permission you can download the filtered rows as CSV.",
      observers:
        "Moon mining recorded by the corporation's moon drills, per refinery: value, volume, pilots and ores, including pilots who never registered with Keystar or are outside the corporation. It needs a character with the in-game Accountant or Director role linked with corporation access; synced hourly.",
      estimator:
        "Paste a survey scanner result to value an asteroid belt or moon chunk by ore and grade, priced with Keystar's price source next to the scanner's own estimate. Enter your fleet's yield in m³/s to see how long clearing it takes. The scan isn't saved.",
      pnl: "Your own mining profit and loss: income from the ore you mine (or from your wallet sales) minus the wallet purchases you count and costs you add by hand. Only you see it, whatever your role. Wallet import is optional per character; turn it on, choose how income is counted and set ore prices on the Settings tab.",
    },
  },

  /** How ISK values are computed (admin setting), shown next to every value; sources are in `t.eve.valuationSources`. */
  valuation: {
    modes: {
      historical: "price on the day mined",
      current: "current prices",
    } satisfies Record<"current" | "historical", string>,
  },

  /** Data source switch (filter bar). */
  sources: {
    all: { label: "Combined", hint: "Member ledgers plus moon-drill entries not already covered by them" },
    personal: { label: "Member ledgers", hint: "Personal ledgers of registered characters (all mining)" },
    observer: { label: "Moon drills", hint: "Moon mining recorded by the corporation's moon drills (anyone)" },
  } satisfies Record<MiningSource, { label: string; hint: string }>,

  /** Measure switch (filter bar). */
  metrics: {
    value: "ISK",
    volume: "m³",
    quantity: "Units",
  } satisfies Record<MiningMetric, string>,

  /** Chart series: resource classes. */
  chartClasses: {
    moon: "Moon ore",
    ore: "Asteroid ore",
    ice: "Ice",
    gas: "Gas",
    other: "Other",
  } satisfies Record<ChartClass, string>,

  /** Moon ore rarity ramp. */
  moonRarity: {
    moon_r4: "R4 Ubiquitous",
    moon_r8: "R8 Common",
    moon_r16: "R16 Uncommon",
    moon_r32: "R32 Rare",
    moon_r64: "R64 Exceptional",
  } satisfies Record<MoonOreClass, string>,

  /** Table headers shared by the mining pages. */
  columns: {
    date: "Date",
    character: "Character",
    ore: "Ore",
    location: "Location",
    source: "Source",
    system: "System",
    miners: "Miners",
    rocks: "Rocks",
    units: "Units",
    volume: "Volume",
    unitPrice: "Unit price",
    value: "Value",
    scanner: "Scanner",
    keystar: "Keystar",
    share: "Share",
  },

  exportCsv: "Export CSV",
  /** Button to the Mining access page. */
  access: "Access",

  filters: {
    members: "Members",
    registered: "Registered",
    notRegistered: "Not registered",
    class: "Class",
    ore: "Ore",
    system: "System",
    dataSource: "Data source",
    measure: "Measure",
    reset: "Reset",
  },

  view: {
    label: "Show mining of",
    corp: "Corporation",
    corpHint: "Characters in the home corporation and the corporation's refineries",
    own: "My characters",
    ownHint: "All your linked characters, including alts in other corporations",
  },

  groupBy: {
    label: "Group miners by",
    pilots: "Pilots",
    pilotsHint: "Group alts under their main character",
    characters: "Characters",
  },

  chart: {
    legend: "Legend",
    view: "Chart or table",
    chart: "Chart",
    table: "Table",
    noMining: "No mining",
    total: "Total",
    allResources: "All resources",
    showOres: (resource: string) => `Show the ores in ${resource}`,
    otherOres: (count: number) => `Other (${plural(count, "ore", "ores")})`,
  },

  breakdowns: {
    oresOf: (resource: string) => `${resource} · by type`,
    characters: (count: number) => plural(count, "char", "chars"),
    notRegistered: "not registered",
    moonByRarity: "Moon ore by rarity",
    unknownLocation: "Unknown location",
    groupOres: "Group ore types",
    groupOresHint: "Combine the grades and variants of each ore (Scordite II-Grade, Thick Blue Ice …) into one row",
    variants: (count: number) => plural(count, "variant", "variants"),
    averagePrice: "Average across the grades, weighted by units",
  },

  overview: {
    metaTitle: "Mining",
    description: {
      corp: "Ore, ice, gas and moon mining by home-corporation characters and at corporation refineries.",
      noHomeCorp:
        "Mining of your own characters. Corporation-wide views appear once an admin sets the home corporation.",
      own: "Mining of your own characters. Ask a director for corporation-wide access.",
      ownView: "Mining of all your linked characters, including alts in other corporations.",
    },
    ledger: "Ledger",
    empty: {
      title: "No mining data yet",
      action: "Mining access",
      body: "Sharing the mining ledger is opt-in: switch it on for your characters on the Mining access page. The worker syncs personal ledgers every 15 minutes and moon drills hourly; ESI keeps the last 30 days, Keystar keeps everything from then on.",
    },
    /** Comparison period for the stat tiles ("vs prior 30d"). */
    priorPeriod: (days: number) => `prior ${n(days)}d`,
    valueMined: (from: string, to: string) => `Value mined · ${from} – ${to}`,
    volume: "Volume",
    units: "Units",
    activePilots: "Active pilots",
    characters: (count: number) => plural(count, "character", "characters"),
    valuePerActiveDay: "Value per active day",
    activeDays: (active: number, span: number) => `${n(active)} of ${plural(span, "day", "days")} active`,
    daily: {
      value: "Daily ISK by resource",
      volume: "Daily m³ by resource",
      quantity: "Daily units by resource",
    } satisfies Record<MiningMetric, string>,
    eveDays: "EVE time (UTC) days",
    resourceMix: "Resource mix",
    shareOf: {
      value: "Share of ISK",
      volume: "Share of m³",
      quantity: "Share of units",
    } satisfies Record<MiningMetric, string>,
    topMiners: "Top miners",
    topMinersGrouped: "Alts grouped under their main",
    topMinersDrill: "Click a character to focus on it",
    noMiners: "Nobody mined in this period.",
    oreBreakdown: "Ore breakdown",
    noOre: "No ore in this period.",
    systems: "Systems",
    systemsSubtitle: "Where the mining happened",
    coverage: {
      title: "Data coverage",
      subtitle: "How complete these numbers are",
      tracked: "Characters with mining ledger access",
      notEnabled: "Characters not sharing their ledger",
      notEnabledHint: "Switch the mining ledger on for these characters on the Mining access page.",
      notEnabledCorpHint:
        "Sharing the personal mining ledger is opt-in per character. Moon mining at corporation refineries still shows through the moon drills.",
      invalidTokens: "Revoked or expired tokens",
      unregistered: "Corp members not registered",
      lastLedgerSync: "Last personal ledger sync",
      lastObserverSync: "Last moon-drill sync",
      notConfigured: "not configured",
      unpriced: (rows: number) =>
        `${plural(rows, "ledger row has", "ledger rows have")} no price yet and count as 0 ISK.`,
      note: (valuation: string) =>
        `ESI ledgers are daily totals per ore and system. “Combined” counts moon-drill entries only when they are not already in a member's personal ledger. ISK values use ${valuation}.`,
    },
  },

  ledger: {
    metaTitle: "Mining ledger",
    description: "Every ledger entry: ESI reports one row per character, day, ore and system (or refinery).",
    overview: "Overview",
    entries: (count: number, value: ReactNode) => (
      <>
        {value} {count === 1 ? "entry" : "entries"}
      </>
    ),
    pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
    empty: "No ledger entries match these filters.",
    unknownSystem: "Unknown",
    sourceBadge: {
      personal: "Personal",
      observer: "Moon drill",
    } satisfies Record<Exclude<MiningSource, "all">, string>,
    dayMeta: (entries: number, characters: number) =>
      `${plural(entries, "entry", "entries")} · ${plural(characters, "character", "characters")}`,
    dayPartial: (shown: number, entries: number) => `${n(shown)} of ${n(entries)} on this page`,
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    pagination: "Pagination",
    previous: "Previous",
    next: "Next",
  },

  observers: {
    metaTitle: "Moon drills",
    description: "Moon mining recorded by the corporation's moon drills — including pilots who never registered with Keystar.",
    noHomeCorp: {
      title: "No home corporation set",
      body: "Moon drills are tracked for the home corporation. An admin can set it under Admin → Settings.",
    },
    noObservers: {
      title: "No moon drills yet",
      body: (strong: (text: string) => ReactNode) => (
        <>
          A director or accountant needs to link a character with corporation scopes (My Characters → “Link with
          corporation access”). The character needs the in-game {strong("Accountant")} role to read moon-drill ledgers and{" "}
          {strong("Station Manager")} for refinery names.
        </>
      ),
    },
    structure: (id: number) => `Structure ${id}`,
    unknownSystem: "Unknown system",
    lastActivity: (date: string) => `last activity ${date}`,
    ledgerLink: "Ledger →",
    value: "Value",
    volume: "Volume",
    pilots: "Pilots",
    outsideCorpCount: (count: number) => `${n(count)} outside corp`,
    outsideCorp: "outside corp",
    units: (quantity: string) => `${quantity} units`,
    noMining: "No mining in this period.",
  },

  estimator: {
    metaTitle: "Ore field estimator",
    title: "Ore Field Estimator",
    description: "Paste a survey scanner result to value a belt or moon chunk, grouped by ore and grade.",
    scan: {
      title: "Survey scan",
      subtitle: "Survey scanner → select all → copy, then paste here",
      example: "Example",
      clear: "Clear",
      input: "Survey scanner result",
      /** Sample line in the number format of the EVE client in this language. */
      placeholder: "Scordite III-Grade\t8,904\t1,335 m3\t168,000.00 ISK\t25 km\n…",
    },
    skipped: (count: number, lines: string) =>
      `Skipped ${plural(count, "line", "lines")} that didn't look like asteroids (line ${lines}).`,
    fleetYield: "Fleet yield",
    fleetYieldPlaceholder: "e.g. 150",
    keystarValue: "Keystar value",
    pricing: "pricing…",
    unpriced: (count: number) => `${plural(count, "type", "types")} unpriced`,
    scannerEstimate: "Scanner estimate",
    eveAverage: "EVE average price",
    volume: "Volume",
    perM3: (price: string) => `${price} per m³`,
    timeToClear: "Time to clear",
    asteroids: "Asteroids",
    duration: (hours: number, minutes: number) => `${n(hours)}h ${minutes}m`,
    asteroidCount: (count: number) => plural(count, "asteroid", "asteroids"),
    oreTypes: (count: number) => plural(count, "ore type", "ore types"),
    priceError: "Could not load Keystar prices — showing scanner values only.",
    esiUnavailable: "EVE's ESI is unavailable right now, so some ores couldn't be priced — showing scanner values for them.",
    empty: "Paste a survey scan to see the field broken down by ore and grade.",
    grades: (count: number) => plural(count, "grade", "grades"),
    baseGrade: "Base",
    columns: {
      ore: "Ore",
      rocks: "Rocks",
      units: "Units",
      volume: "Volume",
      iskPerM3: "ISK/m³",
      scanner: "Scanner",
      keystar: "Keystar",
      share: "Share",
    },
  },

  /** Mining access: which characters share their personal mining ledger (opt-in). */
  settings: {
    metaTitle: "Mining access",
    description: "Choose for each character whether Keystar may read its personal mining ledger.",
    title: "Mining ledger per character",
    subtitle: "Enabling re-authorises the character with EVE and adds the mining ledger scope.",
    on: "Enabled",
    off: "Off",
    revoked: "Token revoked",
    enable: "Share mining ledger",
    stop: "Switch off",
    reauthorize: "Re-authorise",
    demo: "Not available in demo mode",
    lastSync: (when: string) => `Last update ${when}`,
    firstSync: "The first update runs within a few minutes.",
    nothing: "Nothing stored.",
    kept: (from: string, to: string) => `Ledger from ${from} to ${to} is still stored.`,
    deleteData: "Delete mining history",
    deleteDataHint: "Removes this character's stored personal mining ledger and measured mining activity from Keystar.",
    deleteDataConfirm: (name: string) =>
      `Delete the stored mining history of ${name}? ESI only keeps the last 30 days, so anything older can't be fetched again.`,
    toast: {
      deleted: (name: string) => `Stored mining history of ${name} deleted`,
      failed: (name: string) => `Couldn't delete the mining history of ${name}`,
      errors: {
        forbidden: "You no longer have access to mining in Keystar.",
        notOwned: "That character isn't linked to your account any more.",
        stillEnabled: "Switch the mining ledger off for this character first.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    notes: {
      scopes:
        "Keystar reads the character's mining ledger every 15 minutes. It counts towards the Mining Overview, the Ledger and your Mining P&L, and, for directors and viewers, towards the corporation's mining figures.",
      stop: "Switching off stops the reading in Keystar at once; the stored history stays (also in corporation figures) until you delete it. Re-authorise the character on My Characters to remove the scope from its EVE token too.",
      observers:
        "Moon mining at corporation refineries is recorded by the moon drills whether you share your ledger or not; deleting your history doesn't remove those records.",
    },
  },
};
