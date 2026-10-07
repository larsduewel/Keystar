import { FORMATTERS } from "@/lib/format";
import type { IndustryActivity, JobPhase, JobState, JobStatus } from "@/modules/industry/activities";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Industry module: industry jobs of the viewer's own characters. */
export const industry = {
  module: {
    scopes: {
      jobs: "Reads your industry jobs (manufacturing, research, copying, invention, reactions) and when they finish (opt-in).",
      structures: "Names the player structures your industry jobs run in (opt-in).",
      jobsLabel: "Industry job access",
      structuresLabel: "Structure name access",
    },
    jobs: {
      characterJobs: "Industry jobs",
    },
    permissionGroup: "Industry",
    permissions: {
      viewOwn: {
        label: "View own industry jobs",
        description: "Industry jobs of your own characters, with progress and completion times.",
      },
    },
    nav: {
      jobs: "Industry Jobs",
    },
    /** "This page" help for the nav items (NavItem.help), one to three sentences each. */
    help: {
      jobs: "The industry jobs of your own characters (manufacturing, research, copying, invention, reactions) with progress, end time and installation costs. Choose on the Access page which characters share their jobs; Keystar reads them every five minutes, and only you see them.",
    },
  },

  metaTitle: "Industry jobs",
  page: {
    description: "What your characters are building, researching, copying and inventing, and when each job is done.",
    synced: (when: string) => `Updated ${when}`,
    settings: "Access",
  },

  states: {
    running: { label: "Running", hint: "Installed, paused or waiting to be delivered" },
    finished: { label: "Finished", hint: "Delivered, cancelled or reverted (ESI keeps 90 days)" },
    all: { label: "All", hint: "Every job Keystar has seen" },
  } satisfies Record<JobState, { label: string; hint: string }>,

  activities: {
    manufacturing: "Manufacturing",
    te_research: "Time efficiency research",
    me_research: "Material efficiency research",
    copying: "Copying",
    invention: "Invention",
    reaction: "Reactions",
    other: "Other",
  } satisfies Record<IndustryActivity, string>,
  /** Short activity labels for the table badges. */
  activityShort: {
    manufacturing: "Build",
    te_research: "TE",
    me_research: "ME",
    copying: "Copy",
    invention: "Invent",
    reaction: "React",
    other: "Other",
  } satisfies Record<IndustryActivity, string>,

  statuses: {
    active: "Running",
    paused: "Paused",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
    reverted: "Reverted",
  } satisfies Record<JobStatus, string>,
  phases: {
    running: "Running",
    "ending-soon": "Ends soon",
    ready: "Ready to deliver",
    paused: "Paused",
    finished: "Finished",
  } satisfies Record<JobPhase, string>,

  filters: {
    state: "Jobs",
    characters: "Characters",
    activity: "Activity",
    system: "System",
    location: "Station",
    reset: "Reset filters",
    unknownLocation: (id: number) => `Structure ${n(id)}`,
  },

  stats: {
    running: "Running",
    ready: "Ready to deliver",
    endingSoon: "Ending within 24 h",
    jobs: "Jobs shown",
    cost: "Installation costs",
    costHint: "Fees and facility taxes of the jobs shown",
    paused: (count: number) => plural(count, "paused", "paused"),
    lastEnds: (when: string) => `Last one finishes ${when}`,
    byActivity: "By activity",
  },

  table: {
    title: "Jobs",
    character: "Character",
    job: "Job",
    productArrow: "→",
    runs: "Runs",
    location: "Location",
    progress: "Progress",
    ends: "Ends",
    status: "Status",
    cost: "Cost",
    runsOf: (done: number, runs: number) => `${n(done)} of ${n(runs)}`,
    probability: (pct: string) => `${pct} chance`,
    pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
    previous: "Previous",
    next: "Next",
    noLocation: "Unknown structure",
    noLocationHint: "This structure could not be named: the character has no docking access there, or it is gone.",
    completedBy: (name: string) => `Delivered by ${name}`,
    ago: (when: string) => `finished ${when}`,
  },
  duration: ({ days, hours, minutes }: { days: number; hours: number; minutes: number }) =>
    days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,

  coverage: {
    title: "Coverage",
    subtitle: "Which of your characters report their jobs",
    tracked: "Characters tracked",
    notEnabled: "Industry access off",
    notEnabledHint: "Enable industry access for these characters on the Access page to see their jobs.",
    invalidTokens: "Revoked ESI tokens",
    lastSync: "Last update",
    note: "ESI lists a job as running until its installer opens the industry window; Keystar shows a job whose end time has passed as ready to deliver.",
  },

  empty: {
    noCharacters: {
      title: "No characters linked",
      body: "Link a character on My Characters; its industry jobs appear here after the first update.",
      action: "My Characters",
    },
    notEnabled: {
      title: "Industry access is off",
      body: "Choose on the Access page which of your characters share their industry jobs with Keystar. Jobs show up a few minutes after enabling.",
      action: "Enable industry access",
    },
    noJobs: {
      title: "No industry jobs yet",
      body: "None of your characters has an industry job on record. Jobs show up a few minutes after they are installed in game.",
    },
    filtered: "No job matches the filters.",
  },

  settings: {
    metaTitle: "Industry access",
    description: "Choose for each character whether Keystar may read its industry jobs and name the structures they run in.",
    title: "Industry access per character",
    subtitle: "Enabling re-authorises the character with EVE and adds the two industry scopes.",
    on: "Enabled",
    off: "Off",
    revoked: "Token revoked",
    partial: "Partly enabled",
    enable: "Enable industry access",
    stop: "Switch off",
    reauthorize: "Re-authorise",
    demo: "Not available in demo mode",
    lastSync: (when: string) => `Last update ${when}`,
    firstSync: "The first update runs within a few minutes.",
    nothing: "Nothing stored.",
    kept: "Industry jobs from earlier are still stored.",
    deleteData: "Delete industry data",
    deleteDataHint: "Removes the stored industry jobs of this character from Keystar.",
    accessLabel: "Industry access",
    toast: {
      deleted: (name: string) => `Stored industry jobs of ${name} deleted`,
      failed: (name: string) => `Couldn't delete the industry jobs of ${name}`,
      errors: {
        forbidden: "You no longer have access to industry jobs in Keystar.",
        notOwned: "That character isn't linked to your account any more.",
        stillEnabled: "Switch industry access off for this character first.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    notes: {
      scopes: "Keystar reads the character's industry jobs every five minutes and names the stations and structures they run in; structures only where the character may dock. Only you see your characters' jobs.",
      stop: "Switching off stops the reading in Keystar at once; stored jobs stay until you delete them. Re-authorise the character on My Characters to remove the scopes from its EVE token too.",
    },
  },
};
