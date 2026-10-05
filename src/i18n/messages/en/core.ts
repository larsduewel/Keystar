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
      description: "Compare the in-game roster with registered characters and missing scopes.",
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
};
