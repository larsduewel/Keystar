import { FORMATTERS } from "@/lib/format";

/** App frame: sidebar, top bar, navigation, language switch. */
export const shell = {
  mainNav: "Main",
  releaseNotes: "Release notes",
  unknownPilot: "Unknown pilot",
  signOut: "Sign out",
  noHomeCorp: "No home corporation",
  demo: "Demo",
  serverOnline: (players: number) => `${FORMATTERS.en.integer(players)} online`,
  eveTime: "EVE time (UTC)",
  awaitingApproval: {
    title: "Awaiting approval.",
    body: "A director has to approve your account before you can see corporation data. You can already link your characters and grant ESI access.",
  },
  theme: {
    light: "Light", dark: "Dark", toLight: "Switch to light mode", toDark: "Switch to dark mode",
  },
  sidebar: { collapse: "Collapse sidebar", expand: "Expand sidebar" },
  language: {
    label: "Language",
    change: "Change language",
  },
  navSections: {
    overview: "Overview",
    account: "Account",
    admin: "Administration",
  },
  nav: {
    dashboard: "Dashboard",
    characters: "My Characters",
    users: "Users & Roles",
    members: "Member Audit",
    sync: "Sync Status",
    settings: "Settings",
    audit: "Audit Log",
  },
  /** Live alerts menu in the top bar. */
  alerts: {
    button: "Alerts",
    menu: "Alert settings",
    desktop: {
      label: "Desktop notifications",
      hint: "Show alerts as system notifications while Keystar is in the background",
      blocked: "Blocked for this site in the browser settings",
      unsupported: "Not available in this browser here (needs HTTPS)",
    },
  },
};
