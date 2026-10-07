import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/**
 * The What's new dialog, and each release's highlights. A release's icons, links and
 * permissions are in src/core/help/releases.ts; its keys here must match those (the
 * typecheck says so). Release PRs add 2–4 highlights: see docs/releasing.md.
 */
export const whatsNew = {
  /** Title after an update to `version`. */
  updatedTitle: (version: string) => `Keystar updated to v${version}`,
  /** Title when opened from the help or the sidebar. */
  latestTitle: (version: string) => `What's new in v${version}`,
  intro: "The most important changes in this release.",
  /** When the account skipped versions: what the dialog covers. */
  since: (from: string) => `The most important changes since v${from}, the version you saw last.`,
  kind: { new: "New", improved: "Improved" },
  open: "Open",
  /** A card's release when the dialog covers several. */
  version: (version: string) => `v${version}`,
  more: (count: number) => `and ${n(count)} more highlight${count === 1 ? "" : "s"}`,
  /** Primary button: the GitHub release page. */
  read: "Read the release notes",
  close: "Close",
  /** Shown to admins when a release needs a step on the server or at CCP. */
  actionNeeded: {
    title: "Action needed",
    intro: "Before everything in this update works, whoever runs this Keystar server has to:",
    link: (version: string) => `Upgrade notes for v${version}`,
  },
  releases: {
    "0.15.0": {
      upgrade:
        "Add the scopes esi-clones.read_implants.v1 and esi-markets.read_character_orders.v1 (and esi-universe.read_structures.v1, if missing) to the EVE application at developers.eveonline.com. Until then, sharing skills and switching on market access fail with invalid_scope.",
      items: {
        gateCheck: {
          title: "Gate check",
          body: "Plan a route under Combat and see the recent kills at every gate you pass, live camps, and how likely a camp is when you get there.",
        },
        marketOrders: {
          title: "Market orders",
          body: "Follow your characters' buy and sell orders with price, quantity left, location and expiry, plus the ISK in escrow. Switch it on per character on the Access page.",
        },
        remapOptimiser: {
          title: "Remap optimiser",
          body: "See which neural remap trains each character's skill queue the fastest and how much time it saves, under Pilots.",
        },
        miningAccess: {
          title: "Mining ledger is opt-in",
          body: "Signing in no longer asks EVE for any access. Share each character's mining ledger on the Mining access page, and switch it off there again.",
        },
      },
    },
    "0.14.0": {
      upgrade:
        "Add the scopes esi-industry.read_character_jobs.v1 and esi-universe.read_structures.v1 to the EVE application at developers.eveonline.com. Until then, switching on industry access fails with invalid_scope.",
      items: {
        industryJobs: {
          title: "Industry jobs",
          body: "Follow your characters' manufacturing, research, invention and reaction jobs with progress and time left. Switch it on per character on the Access page.",
        },
        universeMap: {
          title: "3D universe map and route planning",
          body: "Search the star map under Combat, plan the shortest gate route with the last two hours of gate kills, and check jump ranges for capitals and Black Ops.",
        },
        skillTimeline: {
          title: "Skill queue timeline",
          body: "Each character's queue now shows as one strip like the training bar in game, every skill sized by the time it still needs.",
        },
        miningOreTypes: {
          title: "Ore types in the daily mining chart",
          body: "Click a resource in the “Daily ISK by resource” chart to split the days by its ore types, such as Spodumain, Kernite and Scordite.",
        },
      },
    },
  },
};
