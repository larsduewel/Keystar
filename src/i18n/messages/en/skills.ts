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
      implants: "Reads the implants of the active clone so the remap optimiser can tell base attributes from implant bonuses (opt-in).",
      implantsLabel: "Implant access",
    },
    jobs: {
      queue: "Skill queue",
      character: "Skills and attributes",
      implants: "Implants",
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
      remap: "Remap optimiser",
    },
    /** "This page" help for the nav items (NavItem.help), one to three sentences each. */
    help: {
      queues:
        "What your characters are training, when each skill finishes and how long the queues last, plus skill points and attributes. Choose on the Access page which characters share their skills; anyone allowed to view corporation skills, usually directors, then sees those queues in the corporation view.",
      remap:
        "The neural remap that trains each character's current skill queue the fastest: the attributes to remap to, the queue time before and after, and the time saved, with a warning when the queue is too short to be worth a remap. It covers characters that share their skills on the Access page, implants included; anyone allowed to view corporation skills, usually directors, also gets the corporation view.",
    },
  },

  metaTitle: {
    overview: "Skill queues",
    settings: "Skills access",
    remap: "Remap optimiser",
  },
  page: {
    description: "What your characters are training, when each skill finishes and how long the queues last.",
    settings: "Access",
    synced: (when: string) => `Updated ${when}`,
    remapDescription: "The neural remap that trains each character's current skill queue the fastest.",
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
    remapLink: "Best remap",
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
  remap: {
    title: "Recommended remap",
    columns: {
      attribute: "Attribute",
      current: "Now",
      recommended: "Remap to",
      implants: "Implants",
    },
    queueNow: "Queue now",
    queueAfter: "After the remap",
    saved: "Time saved",
    optimal: "The current attributes are already the best remap for this queue.",
    howTo: "Remap in game: character sheet → Attributes → Neural remap. Implants are not part of a remap and stay as they are.",
    method:
      "Calculated over the whole remaining queue with Omega training speed (primary + secondary ÷ 2 SP per minute). Every legal remap is tried: 17–27 per attribute, 99 points in total.",
    shortQueue: {
      title: "Queue shorter than 180 days",
      body: (duration: string) =>
        `With the recommended attributes the queue only runs for ${duration}. A remap locks your attributes in: the yearly remap comes back only after 365 days and bonus remaps are gone once used. Plan at least 180 days of skills with these attributes before you remap.`,
      bodyCurrent: (duration: string) =>
        `The queue only runs for ${duration} with the current attributes. A remap locks your attributes in: the yearly remap comes back only after 365 days and bonus remaps are gone once used. Plan at least 180 days of skills before you remap.`,
    },
    availability: {
      now: "Yearly remap available now",
      yearlyFrom: (when: string) => `Yearly remap from ${when}`,
      bonus: (count: number) => plural(count, "bonus remap left", "bonus remaps left"),
      none: (when: string) => `No remap available before ${when}; the advice applies once one is.`,
    },
    notes: {
      empty: "The queue is empty: nothing to optimise.",
      notShared: "This character doesn't share its skill queue and attributes.",
      waiting: "Waiting for the queue and attributes to sync …",
      paused: "Training is paused in game; times are calculated from the SP still to train.",
      unknownEntries: (count: number) => `${plural(count, "queued skill", "queued skills")} left out: training data not known yet.`,
      implantsNotShared:
        "Implants aren't included yet (this character shared its skills before they were), so the attributes are taken as having no implants. Re-authorise it on the Skills access page to include them.",
      implantsWaiting: "Implants are included but not read yet; assuming none for now.",
      implantsUncertain:
        "Attributes minus implants isn't a valid remap (an active booster or stale data?), so implants are left out of the calculation.",
      notComparable: (total: string) =>
        `The attributes add up to ${total} instead of 99, so implants (or a booster) add points Keystar doesn't know about. They also change which remap is fastest, so no remap is recommended: re-authorise the character on the Skills access page to include its implants.`,
      notComparableWaiting: (total: string) =>
        `The attributes add up to ${total} instead of 99, and the implants haven't been read yet, so no remap is recommended. Advice appears after the next update.`,
      notComparableStale: (total: string) =>
        `The attributes add up to ${total}, which the stored implants don't explain: implants changed since the last update, or a booster is active. No remap is recommended; try again after the next update.`,
      includeImplants: "Include implants",
    },
    empty: {
      title: "No character to optimise",
      body: "Share a character's skills on the Skills access page to get remap advice for its queue.",
    },
  },
  settings: {
    description: "Choose for each character whether Keystar may read its skill queue, skills and attributes.",
    title: "Skill access per character",
    subtitle: "Sharing re-authorises the character with EVE and adds the skills and implants scopes.",
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
    implants: {
      shared: "Implants included for the remap optimiser.",
      missing: "Implants not included yet: re-authorise for exact remap advice.",
    },
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
      implants:
        "Sharing includes the implants of the active clone: ESI's attributes include their bonuses, so the remap optimiser needs them to know the base attributes.",
      stop: "Stopping switches sharing off in Keystar at once; stored data stays until you delete it. Re-authorise the character on My Characters to remove the scopes from its EVE token too.",
    },
  },
};
