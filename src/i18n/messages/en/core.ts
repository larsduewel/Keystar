/** Built-in module: permissions, ESI scope reasons and background jobs. */
export const core = {
  permissionGroup: "Core",
  permissions: {
    settingsManage: {
      label: "Manage application settings",
      description: "Change global settings, permission overrides and the home corporation.",
    },
    usersView: {
      label: "View users",
      description: "See all registered users, their characters and token health.",
    },
    usersManage: {
      label: "Manage users",
      description: "Approve guests, change roles (below your own) and disable accounts.",
    },
    membersAudit: {
      label: "Corporation member audit",
      description: "Compare the in-game roster with registered characters and their ESI access.",
    },
    auditView: {
      label: "View audit log",
      description: "Read the log of administrative actions.",
    },
    syncView: {
      label: "View sync status",
      description: "See background ESI sync jobs and their errors.",
    },
    syncTrigger: {
      label: "Trigger syncs",
      description: "Queue a background ESI sync job to run immediately.",
    },
    systemView: {
      label: "View system info",
      description: "See the technical state of this instance and download the support package for bug reports.",
    },
  },
  scopes: {
    corporationRoles: "Detects which of your characters hold Director/Accountant roles so Keystar uses the right token.",
    corporationMembership: "Reads the corporation roster to show members who have not registered yet.",
  },
  jobs: {
    serverStatus: "Tranquility status",
    affiliations: "Character affiliations",
    characterRoles: "In-game corporation roles",
    corporationMembers: "Corporation roster",
    marketPrices: "Market prices",
    housekeeping: "Housekeeping",
    universeSystems: "Solar system list",
  },
  /** "This page" help for the core nav items (NavItem.help), one to three sentences each. */
  help: {
    dashboard:
      "A summary of your corporation's last 30 days compared with the 30 days before: kills, losses and ISK efficiency from the Combat Report and mined value from the Mining Overview, as far as your role can see them. The top row and Your characters show registered members, your ESI access and whether the sync worker is running; tiles open the page behind them.",
    characters:
      "Link every character you play through the EVE login; linking asks for no ESI access. The optional access each character shares is listed with a link to the page that switches it; Re-authorise fixes a revoked token, Sync now queues its background syncs. Directors, accountants and station managers can also link a character with corporation access, which Keystar needs for corp data like the member roster and moon-drill ledgers.",
    users:
      "Every Keystar account with its characters, ESI health, last login and role; click a role at the top to show only its accounts. If you can manage users, you approve guests, change roles below your own and disable accounts here. Keystar roles decide what an account can see and are separate from in-game corporation roles.",
    members:
      "Compares the home corporation's in-game roster with the characters registered in Keystar, so you see who hasn't registered and whose ESI token was revoked. ESI access is optional per character, so a character without any isn't a problem. The roster comes from the hourly Corporation roster sync, which needs a home corporation character linked with corporation access. Share the Registration link with members who haven't registered.",
    sync:
      "The ESI jobs the worker runs in the background for the corporation, each linked character and the system, with their last result or error and when they run next. If your role may trigger syncs, Run now queues a job at once, but it can't fetch fresher data than ESI's cache allows; admins can also pause all syncing here.",
    settings:
      "Application-wide configuration for admins: the home corporation Keystar tracks, who may sign up and who is approved automatically, how mining ISK values are calculated, and the minimum Keystar role for each permission. Changes apply as soon as you save and are recorded in the Audit Log.",
    audit:
      "The latest 300 security-relevant and administrative actions, newest first: sign-ins, linked and removed characters, approvals, role and settings changes, triggered syncs and support package downloads. Each entry shows who did it (system for automatic actions), what it affected and its details.",
    system:
      "The technical state of this Keystar instance for admins: health checks for the database, worker, background jobs, EVE SSO and outbound connections, plus version, load and configuration. If something isn't working, start with the failed checks, then report an issue with the support package, which contains no pilot or corporation data.",
  },
};
