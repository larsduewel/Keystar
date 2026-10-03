import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;

/** Fleet module: live fleet composition shared by fleet bosses, and past fleets. */
export const fleet = {
  module: {
    nav: { fleet: "Live fleet" },
    permissionGroup: "Fleet",
    permissions: {
      view: { label: "View fleets", description: "See live fleets shared by fleet bosses and the list of past fleets." },
      track: { label: "Share own fleet", description: "Let the worker read the fleet one of your characters is boss of." },
    },
    scopes: {
      readFleet: "Reads the fleet you are in; while you are fleet boss, also its members, ships and wings.",
    },
    jobs: { live: "Live fleet" },
  },
  roles: {
    fleet_commander: "Fleet commander",
    wing_commander: "Wing commander",
    squad_commander: "Squad commander",
    squad_member: "Squad member",
  } as Record<string, string>,
  fallback: {
    character: (id: number) => `Character ${id}`,
    type: (id: number) => `Type ${id}`,
    group: "Other",
    system: "Unknown system",
    wing: (id: number) => `Wing ${id}`,
    squad: (id: number) => `Squad ${id}`,
  },
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  },
  page: {
    metaTitle: "Live fleet",
    eyebrow: "Combat",
    description: "Fleet composition straight from ESI, shared by the fleet boss.",
    autoRefresh: (seconds: number) => `Updates every ${seconds} seconds`,
  },
  tracking: {
    title: "Share your fleet",
    subtitle: "ESI only shows members and wings to the fleet boss. Start tracking on the character that holds boss.",
    start: "Track fleet",
    stop: "Stop",
    status: {
      idle: "Not tracking",
      tracking: "Tracking",
      waiting: "Waiting for the worker",
      not_boss: "In a fleet, but not boss",
      no_fleet: "Not in a fleet",
      stopped: "Not tracking",
    } as Record<string, string>,
    checked: (when: string) => `checked ${when}`,
    enable: "Enable fleet access",
    enableHint: "Opens the EVE login to add fleet access to this character. Only the character that holds fleet boss needs it.",
    revoke: "Revoke access",
    revokeHint: "Opens the EVE login to remove fleet access from this character.",
    demo: "Not available in the demo",
    noCharacters: "Link a character to share fleets.",
  },
  live: {
    empty: {
      title: "No live fleet",
      body: "When a fleet boss starts tracking above, the fleet shows up here within a few seconds.",
    },
    title: (boss: string) => `${boss}'s fleet`,
    freeMove: "Free move",
    motd: "MOTD",
    stats: {
      members: "Members",
      ships: "Ship types",
      systems: "Systems",
      duration: "Running for",
    },
    composition: { title: "Composition", subtitle: "Members per ship class", ships: "Ships" },
    structure: { title: "Fleet structure", command: "Fleet command", commander: "Commander" },
    columns: { pilot: "Pilot", ship: "Ship", system: "System", role: "Role", joined: "Joined" },
    activity: {
      title: "Joins & leaves",
      joined: "joined",
      left: "left",
      none: "Nobody has joined or left yet.",
    },
  },
  history: {
    title: "Past fleets",
    subtitle: "Fleets read through a tracker, newest first",
    empty: "No past fleets yet.",
    columns: { started: "Started", boss: "Boss", duration: "Duration", pilots: "Pilots" },
    participants: (value: number) => count(value, "pilot", "pilots"),
  },
};
