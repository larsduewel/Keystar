import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Skills module: skill queues, trained skills and attributes of characters whose owner opts in. */
export const skills = {
  module: {
    scopes: {
      queue: "Reads the skill queue so Keystar can show what is training and when it finishes (opt-in).",
      skills: "Reads trained skills, skill points and attributes for the skills pages (opt-in).",
      queueLabel: "Skill queue access",
      skillsLabel: "Skill access",
    },
    jobs: {
      queue: "Skill queue",
      character: "Skills and attributes",
    },
    permissionGroup: "Skills",
    permissions: {
      viewOwn: {
        label: "View own skills",
        description: "Skill queues and attributes of your own characters.",
      },
      viewCorp: {
        label: "View corporation skills",
        description: "Skill queues of every home-corporation member who shares them.",
      },
    },
    navSection: "Pilots",
    nav: {
      queues: "Skill queues",
    },
  },

  metaTitle: {
    overview: "Skill queues",
    settings: "Skills access",
  },
  page: {
    description: "What your characters are training, when each skill finishes and how long the queues last.",
    settings: "Access",
    synced: (when: string) => `Updated ${when}`,
  },
  view: {
    label: "Whose queues",
    own: "My characters",
    corp: "Corporation",
    corpHint: "Home-corporation members who share their skill queue",
    ownHint: "Only your own characters",
  },
  filters: {
    characters: "Characters",
  },
  stats: {
    characters: "Characters",
    training: "Training",
    endingSoon: "Ending within 24 h",
    idle: "Paused or empty",
  },
  status: {
    training: "Training",
    "ending-soon": "Ends soon",
    paused: "Paused",
    empty: "Queue empty",
    notEnabled: "Not shared",
    revoked: "Access revoked",
    error: "Sync failed",
  },
  card: {
    totalSp: (sp: string) => `${sp} SP`,
    unallocated: (sp: string) => `${sp} unallocated`,
    owner: (name: string) => `Owner: ${name}`,
    trainingNow: "Training now",
    finishes: (when: string) => `Finishes ${when}`,
    queueEnds: "Queue ends",
    queueLength: "Time left",
    queued: (count: number) => plural(count, "skill queued", "skills queued"),
    pausedHint: "Training is paused in game. Times show once training resumes.",
    emptyHint: "Nothing is training. Add skills to the queue in game.",
    staleHint: "ESI updates the queue when the character logs in; skills finished since then are hidden.",
    waiting: "Waiting for the first sync …",
    notEnabled: "This character doesn't share its skills with Keystar yet.",
    enable: "Share skills",
    showQueue: (count: number) => `Show the full queue (${plural(count, "skill", "skills")})`,
  },
  timeline: {
    label: "Training time",
    segment: (skill: string, duration: string) => `${skill}: ${duration}`,
    total: (duration: string) => `Whole queue: ${duration}`,
    tick: {
      day: (count: number) => `${n(count)}d`,
      week: (count: number) => `${n(count)}w`,
      month: (count: number) => `${n(count)}mo`,
    },
  },
  table: {
    position: "#",
    skill: "Skill",
    finishes: "Finishes",
    timeLeft: "In",
    spLeft: "SP to go",
  },
  attributes: {
    title: "Attributes",
    names: {
      charisma: "Charisma",
      intelligence: "Intelligence",
      memory: "Memory",
      perception: "Perception",
      willpower: "Willpower",
    },
    bonusRemaps: (count: number) => plural(count, "bonus remap", "bonus remaps"),
    remapAvailable: "Yearly remap available",
    remapFrom: (when: string) => `Next yearly remap ${when}`,
    lastRemap: (when: string) => `Last remap ${when}`,
    unknown: "Share skills to see attributes and remaps.",
  },
  duration: ({ days, hours, minutes }: { days: number; hours: number; minutes: number }) =>
    days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
  empty: {
    own: {
      title: "No characters linked",
      body: "Link a character on My Characters, then share its skills here.",
    },
    corp: {
      title: "Nobody shares their skills yet",
      body: "Members choose on the Skills access page whether Keystar may read their skill queue.",
    },
    filtered: "No character matches the filter.",
  },
  settings: {
    description: "Choose for each character whether Keystar may read its skill queue, skills and attributes.",
    title: "Skill access per character",
    subtitle: "Sharing re-authorises the character with EVE and adds the two skills scopes.",
    on: "Shared",
    off: "Not shared",
    revoked: "Token revoked",
    partial: "Partly shared",
    enable: "Share skills",
    stop: "Stop sharing",
    reauthorize: "Re-authorise",
    demo: "Not available in demo mode",
    lastSync: (when: string) => `Last update ${when}`,
    firstSync: "The first update runs within a few minutes.",
    nothing: "Nothing stored.",
    kept: "Skill data from earlier is still stored.",
    deleteData: "Delete skill data",
    deleteDataHint: "Removes the stored queue, skills and attributes of this character from Keystar.",
    sharingLabel: "Skill sharing",
    toast: {
      deleted: (name: string) => `Stored skills of ${name} deleted`,
      failed: (name: string) => `Couldn't delete the skills of ${name}`,
      errors: {
        forbidden: "You no longer have access to skills in Keystar.",
        notOwned: "That character isn't linked to your account any more.",
        stillSharing: "Stop sharing skills for this character first.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    notes: {
      corp: "Directors and anyone else allowed to view corporation skills can see the queues of shared characters in your home corporation.",
      stop: "Stopping switches sharing off in Keystar at once; stored data stays until you delete it. Re-authorise the character on My Characters to remove the scopes from its EVE token too.",
    },
  },
};
