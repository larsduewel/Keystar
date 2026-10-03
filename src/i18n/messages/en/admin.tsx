import type { ReactNode } from "react";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import type { Settings } from "@/core/settings";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/**
 * Administration pages: users & roles, member audit, sync status, settings, audit log.
 * Page titles and the "Administration" eyebrow come from `t.shell.nav` / `t.shell.navSections`.
 */
export const admin = {
  users: {
    metaTitle: "Users & roles",
    description:
      "Keystar roles control what each account can see and change. They are independent of in-game corporation roles.",
    awaitingApproval: (count: number) => `Awaiting approval (${n(count)})`,
    awaitingApprovalHint: "Signed in from outside the home corporation or before auto-approval",
    unknown: "Unknown",
    registered: (when: string) => `registered ${when}`,
    approve: "Approve as member",
    columns: {
      pilot: "Pilot",
      characters: "Characters",
      esiHealth: "ESI health",
      lastLogin: "Last login",
      role: "Role",
      actions: "Actions",
    },
    you: "(you)",
    health: {
      disabled: "Disabled",
      revoked: (count: number) => `${n(count)} revoked`,
      missingScopes: (count: number) => `${n(count)} char${count > 1 ? "s" : ""} missing scopes`,
      allGood: "All good",
      /** Tooltip when the badge links to where the token problem gets fixed. */
      fixOwn: "Fix on My Characters",
      openAudit: "Open Member Audit",
    },
    roleFor: (name: string | null) => `Role for ${name ?? "user"}`,
    saveRole: "Save role",
    /** Toasts after a role change from the table. */
    roleChange: {
      changed: (name: string, role: string) => `${name} is now ${role}`,
      from: (role: string) => `Previously ${role}`,
      restored: (name: string, role: string) => `${name} is back to ${role}`,
      failed: (name: string) => `Couldn't change the role of ${name}`,
      errors: {
        self: "You can't change your own role.",
        forbidden: "You no longer have permission to manage users.",
        notFound: "This account no longer exists.",
        higherRole: "Only a higher role can change this account.",
        unassignable: "You can't assign that role.",
        changed: "Someone changed this role in the meantime. The table now shows the current role.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    enable: "Enable",
    disable: "Disable",
    /** Toasts after approving, disabling or enabling an account. */
    access: {
      approved: (name: string) => `${name} approved as member`,
      disabled: (name: string) => `${name} disabled`,
      enabled: (name: string) => `${name} enabled again`,
      failed: (name: string) => `Couldn't change ${name}`,
      errors: {
        self: "You can't change your own account here.",
        forbidden: "You no longer have permission to manage users.",
        notFound: "This account no longer exists.",
        higherRole: "Only a higher role can change this account.",
        unassignable: "You can't assign that role.",
        changed: "This account is no longer awaiting approval. The page now shows its current role.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    /** Why a row has no actions. */
    noAction: {
      self: "You can't disable your own account",
      higher: "Only a higher role can change this account",
    },
    /** Header shortcut to the permission matrix in Settings (admins only). */
    rolePermissions: "Role permissions",
    /** The role cards filter the table (`?role=`). */
    filter: {
      showing: (count: number, role: string) => `Showing ${n(count)} ${count === 1 ? "user" : "users"} with role ${role}`,
      showAll: "Show all",
      onlyRole: "Show only this role",
      allUsers: "Show all users",
      empty: "No users with this role.",
    },
    zkill: (name: string) => `${name} on zKillboard`,
  },
  members: {
    metaTitle: "Member audit",
    noHome: {
      title: "No home corporation configured",
      body: (settings: string) => `Set the home corporation in ${settings} to audit its members.`,
    },
    description:
      "Compare the in-game corporation roster with characters registered in Keystar, and chase missing ESI access.",
    stats: {
      roster: "In-game roster",
      rosterHint: "Needs a roster token",
      registered: "Registered",
      ofRoster: (share: string) => `${share} of roster`,
      notRegistered: "Not registered",
      missingEsi: "Missing or revoked ESI",
    },
    columns: { character: "Character", status: "Status", account: "Account", esi: "ESI" },
    characterFallback: (id: string) => `Character ${id}`,
    search: {
      label: "Search members",
      placeholder: "Search by character, account or character ID…",
      clear: "Clear search",
    },
    /** The stat tiles filter the table (`?filter=`); counts always cover the whole corporation. */
    filter: {
      onlyThese: "Show only these",
      showAll: "Show everyone",
      labels: {
        roster: "in the in-game roster",
        registered: "registered",
        unregistered: "not registered",
        esi: "with missing or revoked ESI",
      },
    },
    /** Line above the table: how many rows match, and which page is shown. */
    results: (count: number, filter: string | null, q: string | null, account: string | null) =>
      `${n(count)} ${count === 1 ? "character" : "characters"}${account ? ` ${account}` : ""}${filter ? ` ${filter}` : ""}${q ? ` matching “${q}”` : ""}`,
    /** Fills `account` in `results` when the view is limited to one account. */
    ofAccount: (main: string | null) => (main ? `of ${main}'s account` : "of an unknown account"),
    clearAll: "Clear search and filter",
    empty: "No characters match.",
    pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
    pagination: "Pagination",
    previous: "Previous",
    next: "Next",
    status: {
      notRegistered: "Not registered",
      notInRoster: "Not in roster",
      registered: "Registered",
    },
    esi: {
      tokenRevoked: "Token revoked",
      noToken: "No token",
      missing: (count: number) => `${n(count)} missing`,
      complete: "Complete",
    },
    request: {
      title: "Request ESI access",
      subtitle: "Share this link with members",
      body: (page: string) =>
        `The page explains exactly which scopes are requested and why, then walks the member through EVE SSO. Alts can be linked afterwards from ${page}.`,
    },
    rosterUnavailable: {
      title: "Roster unavailable",
      subtitle: "Why some numbers are missing",
      body: (scope: ReactNode, page: string) => (
        <>
          The in-game roster comes from {scope}. Link a home corporation character with corporation access ({page}) and
          the roster appears after the next sync.
        </>
      ),
    },
  },
  sync: {
    metaTitle: "Sync status",
    description: "Background ESI jobs run by the worker. Each job respects ESI cache timers and rate limits.",
    resume: "Resume syncing",
    pause: "Pause syncing",
    runAll: "Run all now",
    stats: {
      worker: "Worker",
      online: (count: number) => `${n(count)} online`,
      offline: "Offline",
      paused: "Paused",
      running: "Running",
      noHeartbeat: "No heartbeat",
      lastBeat: (when: string) => `last beat ${when}`,
      activeJobs: "Active jobs",
      disabled: (count: number) => `${n(count)} disabled`,
      failing: "Failing",
      needsAttention: "Needs attention",
      allHealthy: "All healthy",
      nextRun: "Next run",
    },
    noWorker: (compose: ReactNode, dev: ReactNode) => (
      <>
        No worker heartbeat in the last 2 minutes. Start it with {compose} (or {dev} in development).
      </>
    ),
    columns: {
      job: "Job",
      owner: "Owner",
      status: "Status",
      result: "Result",
      lastSuccess: "Last success",
      nextRun: "Next run",
    },
    ownerTypes: {
      character: "Character",
      corporation: "Corporation",
      global: "Global",
    } satisfies Record<SyncOwnerType, string>,
    disabled: "Disabled",
    errorCount: (count: number) => `Error ×${n(count)}`,
    runNow: "Run now",
    /** Toasts for the run and pause buttons. */
    toast: {
      queued: (job: string) => `${job} queued`,
      allQueued: "All sync jobs queued",
      queuedDetail: "Starts as soon as a worker is free, usually within seconds.",
      paused: "Syncing paused",
      resumed: "Syncing resumed",
      failed: "Couldn't change syncing",
      errors: {
        forbidden: "You no longer have permission for this.",
        notFound: "This job no longer exists or is disabled. The page now shows the current jobs.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    sections: {
      corporation: (name: string | null) => (name ? `Corporation · ${name}` : "Corporation"),
      characters: "Characters",
      system: "System",
      jobCount: (count: number) => `${n(count)} ${count === 1 ? "job" : "jobs"}`,
      characterCount: (characters: number, jobs: number) =>
        `${n(characters)} ${characters === 1 ? "character" : "characters"} · ${n(jobs)} ${jobs === 1 ? "job" : "jobs"}`,
      charactersHint:
        "Only characters linked to Keystar with the needed ESI scopes get their own jobs. Other members appear here once they sign in and grant them.",
      account: (main: string) => `Account: ${main}`,
      failingCount: (count: number) => `${n(count)} failing`,
      nextRun: (when: string) => `next ${when}`,
      empty: "No jobs yet.",
    },
  },
  settings: {
    metaTitle: "Settings",
    description: "Application-wide configuration. Changes apply immediately and are recorded in the audit log.",
    save: "Save settings",
    /** Toasts after saving. */
    saved: "Settings saved",
    savedHomeChanged: "Importing the new home corporation's killboard in the background.",
    saveFailed: "Settings not saved",
    errors: {
      forbidden: "You no longer have permission to change settings.",
      invalidCorporation: "The home corporation must be a numeric corporation ID, e.g. 98765432.",
      unknown: "Something went wrong. Reload the page and check which changes were kept.",
    },
    home: {
      title: "Home corporation",
      subtitle: "Whose members, roster and refineries Keystar tracks",
      corporationId: "Corporation ID",
      placeholder: "e.g. 98765432",
      hint: "Pick from corporations of linked characters or paste an ID (from zKillboard or EVE Who).",
    },
    access: {
      title: "Access",
      subtitle: "Who gets in without manual approval",
      autoCorp: "Auto-approve home corporation members",
      autoCorpHint: (member: string, guest: string) => `They start as ${member}; everyone else starts as ${guest}.`,
      autoAlliance: "Auto-approve alliance members",
      autoAllianceHint: "Characters in the home corporation's alliance.",
      ssoConfigured: "Configured",
      ssoNotConfigured: "Not configured — set EVE_CLIENT_ID and EVE_CLIENT_SECRET.",
      callbackUrl: (url: ReactNode) => <>Callback URL for developers.eveonline.com: {url}</>,
      compatibilityDate: (date: string) => `ESI compatibility date: ${date}`,
    },
    valuation: {
      title: "Mining valuation",
      subtitle: "How ISK values are calculated",
      source: "Price source",
      mode: "Price date",
      modes: {
        current: "Current prices",
        historical: "Price on the day mined",
      } satisfies Record<Settings["mining.valuationMode"], string>,
      hint: "Raw ore without its own market falls back to its compressed variant, then the ESI average price. Historical prices are recorded daily from the moment Keystar runs.",
    },
    permissions: {
      title: "Permissions",
      subtitle: "Minimum Keystar role per permission. Roles are hierarchical: higher roles include everything below.",
      columns: { permission: "Permission", description: "Description", minRole: "Minimum role" },
      fixed: (role: string) => `${role} (fixed)`,
      withDefault: (role: string) => `${role} (default)`,
    },
  },
  audit: {
    metaTitle: "Audit log",
    description: (count: number) => `The last ${n(count)} security-relevant and administrative actions.`,
    columns: { time: "Time", actor: "Actor", action: "Action", target: "Target", details: "Details" },
    empty: "Nothing logged yet.",
    system: "system",
  },
};
