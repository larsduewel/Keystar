import type { ReactNode } from "react";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import type { Settings } from "@/core/settings";
import type { CheckStatus } from "@/core/system/checks";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;
type CheckValues = Record<string, string | number>;
/** Service names in network check values ("esi,sso" or "zkill:403"); product names, the same in every language. */
const NETWORK_NAMES: Record<string, string> = { esi: "ESI", sso: "EVE SSO", zkill: "zKillboard" };
const names = (list: string | number) =>
  String(list)
    .split(",")
    .filter(Boolean)
    .map((e) => NETWORK_NAMES[e.split(":")[0]] ?? e)
    .join(", ");
/** One sentence per service that answered with an error ("zkill:403", "esi:503"). */
const refusedText = (list: string | number) =>
  String(list)
    .split(",")
    .filter(Boolean)
    .map((e) => {
      const [name, code] = e.split(":");
      return name === "zkill" && code === "403"
        ? "zKillboard blocks this server (HTTP 403): it needs a User-Agent with contact details, so set ESI_CONTACT."
        : `${NETWORK_NAMES[name] ?? name} answers with an error (HTTP ${code}) and may be down.`;
    })
    .join(" ");

/**
 * Administration pages: users & roles, member audit, sync status, settings, audit log, system info.
 * Page titles and the "Administration" eyebrow come from `t.shell.nav` / `t.shell.navSections`.
 */
export const admin = {
  users: {
    metaTitle: "Users & roles",
    description:
      "Keystar roles control what each account can see and change. They are independent of in-game corporation roles.",
    awaitingApproval: (count: number) => `Awaiting approval (${n(count)})`,
    awaitingApprovalHint: "Signed in from outside the home corporation or before auto-approval",
    outsideGuests: {
      title: (count: number) => `Guests outside the corporation (${n(count)})`,
      hint: "Sign-ups are now limited to members, but these accounts registered before. Disabling signs them out and can be undone per account; approved accounts are not affected.",
      disable: "Disable these accounts",
      confirm: (count: number) =>
        `Disable ${n(count)} guest ${count === 1 ? "account" : "accounts"} from outside the corporation? They are signed out immediately.`,
      done: "Outside guest accounts disabled",
      failed: "Couldn't disable the accounts",
      errors: {
        forbidden: "You no longer have permission to manage users.",
        notRestricted: "Sign-ups are no longer restricted to members, so nothing was changed.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
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
      "Compare the in-game corporation roster with characters registered in Keystar, and spot revoked ESI access.",
    stats: {
      roster: "In-game roster",
      rosterHint: "Needs a roster token",
      registered: "Registered",
      ofRoster: (share: string) => `${share} of roster`,
      notRegistered: "Not registered",
      missingEsi: "ESI problems",
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
        esi: "with ESI problems",
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
      /** Nothing granted, which is fine: every ESI scope is opt-in. */
      noToken: "No ESI access",
      missing: (count: number) => `${n(count)} missing`,
      complete: "Active",
    },
    request: {
      title: "Registration link",
      subtitle: "Share this link with members",
      body: (page: string) =>
        `The page explains what Keystar reads, then walks the member through EVE SSO. Registering only confirms who they are; optional access such as the mining ledger is switched on per character afterwards. Alts can be linked from ${page}.`,
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
      invalidValuation: "Choose a price source and price date from the lists. Reload the page if they look out of date.",
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
      restrict: "Only members can sign up",
      restrictHint:
        "Characters outside the home corporation (or its alliance, if auto-approved above) get no account at all instead of waiting as guests. Turn this off while recruiting through the join link. Existing accounts stay as they are.",
      outsideGuests: (count: number) =>
        `${n(count)} ${count === 1 ? "guest account is" : "guest accounts are"} from outside the corporation.`,
      reviewOutsideGuests: "Review in Users",
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
  system: {
    metaTitle: "System info",
    description:
      "Technical state of this Keystar instance. Use it when something isn't working, and to report an issue with everything the developers need, without any pilot or corporation data.",
    actions: {
      copySummary: "Copy summary",
      summaryCopied: "Summary copied. Paste it into your GitHub issue.",
      reportIssue: "Report an issue",
      download: "Download support package",
    },
    overall: {
      ok: "All checks passed",
      problems: (count: number) => `${plural(count, "problem needs", "problems need")} attention`,
      breakdown: (failed: number, warnings: number) =>
        [failed ? `${n(failed)} failed` : null, warnings ? plural(warnings, "warning", "warnings") : null].filter(Boolean).join(" · "),
      checkedWhenLoaded: "Checked when this page loaded",
      recheck: "Run checks again",
      whatNext: "What to do next",
    },
    /** Warnings wherever private data could leave the instance (logs, the public GitHub issue). */
    privacy: {
      label: "Privacy",
      logs: "Logs contain character and corporation IDs and can contain pilot, corporation and system names or your server's address. Replace them before posting: GitHub issues are public.",
      report: "GitHub issues are public. Don't put pilot or corporation names, IDs or your server's address in the description or attachments.",
      package: "Error messages are scrubbed automatically, but a name that isn't in quotes can't always be recognised. Skim the preview before you share it.",
    },
    checksTitle: "Health checks",
    checksSubtitle: "Automatic checks for the most common causes of problems.",
    status: { ok: "OK", warn: "Warning", fail: "Failed", skip: "Not checked" } satisfies Record<CheckStatus, string>,
    checks: {
      database: {
        label: "Database reachable",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok" ? `Answered in ${v.ms} ms` : "Keystar can't reach PostgreSQL. Check DATABASE_URL and that the database container runs.",
      },
      migrations: {
        label: "Migrations up to date",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `${n(Number(v.applied))} of ${n(Number(v.bundled))} applied`
            : s === "fail"
              ? `${plural(Number(v.pending), "migration hasn't", "migrations haven't")} run. Restart the app container, which migrates on start.`
              : s === "warn" && v.reason === "unknown"
                ? "The database was migrated by a newer Keystar. Run that version again or restore a backup."
                : s === "warn"
                  ? `${plural(Number(v.changed), "applied migration differs", "applied migrations differ")} from this version's files.`
                  : "Needs the database.",
      },
      schema: {
        label: "Database schema complete",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "Every table and column Keystar expects exists"
            : s === "fail"
              ? `${plural(Number(v.missing), "table or column is", "tables or columns are")} missing. The support package lists them.`
              : "Needs the database.",
      },
      worker: {
        label: "Worker running",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `Last heartbeat ${n(Number(v.seconds))} s ago`
            : s === "fail"
              ? "No heartbeat in the last 2 minutes. Start it with docker compose up -d worker."
              : "Needs the database.",
      },
      workerVersion: {
        label: "Worker and web on the same version",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `Both run ${v.version}`
            : s === "warn"
              ? `The worker runs ${v.worker}, the web app ${v.web}. Restart the worker container after updating.`
              : "Needs a running worker.",
      },
      jobs: {
        label: "Background jobs healthy",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "No job is failing repeatedly"
            : s === "fail"
              ? `${plural(Number(v.count), "job has", "jobs have")} failed ${v.streak} or more times in a row`
              : "Needs the database.",
      },
      jobQueue: {
        label: "Job queue moving",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "No overdue jobs"
            : s === "warn"
              ? `${plural(Number(v.overdue), "job is", "jobs are")} overdue, ${plural(Number(v.stale), "lock", "locks")} expired. The worker may be overloaded or stuck.`
              : "Needs a running worker and active syncing.",
      },
      syncPaused: {
        label: "Syncing active",
        detail: (s: CheckStatus): string =>
          s === "ok" ? "Not paused" : s === "warn" ? "Syncing is paused on the Sync Status page." : "Needs the database.",
      },
      sso: {
        label: "EVE SSO configured",
        detail: (s: CheckStatus): string =>
          s === "ok"
            ? "Client ID and secret are set"
            : s === "fail"
              ? "Set EVE_CLIENT_ID and EVE_CLIENT_SECRET, or nobody can sign in."
              : "Not needed in demo mode.",
      },
      appUrl: {
        label: "App URL matches",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "APP_URL is the address you opened Keystar with"
            : s === "warn" && v.reason === "origin"
              ? "APP_URL differs from the address in your browser. Sign-in and cookies break; set APP_URL to the public address."
              : s === "warn"
                ? "APP_URL doesn't use https. EVE SSO and secure cookies need https in production."
                : "Only checked in the browser.",
      },
      clock: {
        label: "Server clock",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "In step with the database and ESI"
            : s === "warn"
              ? `Off by ${v.dbSeconds} s from the database and ${v.esiSeconds} s from ESI. Turn on time sync (NTP) on the host.`
              : "Needs the database.",
      },
      esiLimits: {
        label: "ESI rate limits",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `Error budget ${v.remain} left`
            : s === "warn"
              ? "Requests are paused for an ESI rate limit. Jobs continue once it resets."
              : "No ESI requests yet.",
      },
      network: {
        label: "Outbound connections",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `ESI, EVE SSO and zKillboard answer (slowest ${n(Number(v.ms))} ms)`
            : s === "skip"
              ? "Not checked."
              : v.down
                ? `Can't reach ${names(v.down)}. Check the server's DNS, firewall and proxy settings.`
                : refusedText(v.refused),
      },
      auditLog: {
        label: "Audit log written",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "No audit entry lost since the web app started"
            : s === "warn"
              ? `${plural(Number(v.count), "audit entry", "audit entries")} couldn't be written since the web app started (last: ${v.action}). The server log has the error; usually the database was briefly unavailable.`
              : "Only checked in the browser.",
      },
    },
    keystar: {
      title: "Keystar",
      releaseNotes: "Release notes",
      version: "Version",
      install: "Install",
      installDocker: (tag: string | null) => (tag ? `Docker image :${tag}` : "Docker image (own build)"),
      installSource: "From source",
      uptime: "Uptime",
      uptimeValue: (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
      },
      runtime: "Runtime",
      node: (version: string) => `Node ${version}`,
      host: "Host",
      hostValue: (platform: string, cpus: number, memory: string | null) =>
        [platform, `${n(cpus)} CPU`, memory ? `${memory} limit` : null].filter(Boolean).join(" · "),
      environment: "Environment",
      demo: "demo mode",
    },
    load: {
      title: "Load",
      subtitle:
        "The web app's figures cover the time since this page was last loaded, the worker's last heartbeat interval (30 s). The load average is the whole host's, not the container's.",
      columns: { web: "Web app", worker: "Worker" },
      cpu: "CPU",
      cpuValue: (percent: string, cores: string) => `${percent} of ${cores} CPU`,
      memory: "Memory (RSS)",
      memoryValue: (used: string, limit: string | null) => (limit ? `${used} of ${limit}` : used),
      heap: "JS heap",
      container: "Container memory",
      hostFree: "Free on host",
      hostFreeValue: (free: string, total: string) => `${free} of ${total}`,
      loadAverage: "Load average (1 · 5 · 15 min)",
      loadValue: (one: string, five: string, fifteen: string) => `${one} · ${five} · ${fifteen}`,
      workerStale: "No heartbeat in the last 2 minutes.",
      workerOld: "This worker runs an older version that doesn't report its load.",
    },
    database: {
      title: "Database",
      postgres: "PostgreSQL",
      migrations: "Migrations",
      migrationsValue: (applied: number, bundled: number | null) =>
        bundled === null ? `${n(applied)} applied` : `${n(applied)} / ${n(bundled)} applied`,
      latest: (tag: string, when: string) => `Latest migration ${tag} · applied ${when}`,
      tables: {
        title: "Largest tables",
        rows: "Rows",
        size: "Size",
        approx: (rows: string) => `~${rows}`,
        estimated: "PostgreSQL's estimate: counting this table took too long",
      },
      unavailable: (error: string) => `Couldn't read the database: ${error}`,
    },
    network: {
      title: "Network",
      subtitle: "Outbound connections from the web app, checked when this page loads.",
      targets: { esi: "ESI", sso: "EVE SSO", zkill: "zKillboard" },
      purpose: { esi: "Every sync job", sso: "Sign-in", zkill: "Killboard and threat intel" },
      answered: (status: number, ms: string) => `HTTP ${status} · ${ms} ms`,
      unreachable: (error: string) => `Unreachable: ${error}`,
    },
    worker: {
      title: "Worker & background jobs",
      subtitle: "Run, pause and retry jobs on the Sync Status page.",
      openSync: "Open Sync Status",
      none: "No worker has sent a heartbeat yet.",
      version: "Version",
      lastBeat: "Last heartbeat",
      started: "Started",
      slots: (running: number, total: number) => `${n(running)} of ${n(total)} slots`,
      running: "Running",
      stats: { ok: "OK", failing: "Failing", running: "Running", overdue: "Overdue", errorBudget: "ESI error budget" },
      failing: {
        job: "Failing job",
        owners: "Affected",
        streak: "Failures in a row",
        lastError: "Last error",
        lastRun: "Last run",
        ownerCount: (count: number) => plural(count, "owner", "owners"),
      },
      noFailing: "No failing jobs.",
    },
    config: {
      title: "Configuration",
      subtitle: "Environment variables of this instance. Secret values are never shown, not even here.",
      columns: { variable: "Variable", status: "Status", value: "Value" },
      states: { set: "Set", default: "Default", unset: "Not set" },
      hidden: "Hidden",
      custom: "Custom",
      https: (https: boolean, matches: boolean | null) =>
        [https ? "https" : "http", matches === true ? "matches this address" : matches === false ? "differs from this address" : null]
          .filter(Boolean)
          .join(" · "),
      ids: (count: number) => plural(count, "character", "characters"),
    },
    help: {
      title: "Troubleshooting & reporting an issue",
      checks: { title: "Check the health checks above", body: "Most problems are a stopped worker, a pending migration or a missing ESI scope. The Sync Status page shows each job's last error." },
      search: { title: "Search existing issues", body: "Someone may already have reported it.", link: "Search issues on GitHub" },
      download: {
        title: "Download the support package",
        body: "Technical details only, no pilot or corporation data. If the web app doesn't start, create it from the command line:",
      },
      logs: {
        title: "Collect the logs",
        body: "Keystar doesn't keep logs itself. Copy the last hour from Docker, and remove anything secret before sharing:",
      },
      report: { title: "Open a bug report", body: "The version and a system summary are filled in for you. Attach the support package and the logs." },
    },
    package: {
      title: "Support package",
      intro: "A technical snapshot of this instance for a bug report. Check what's inside before you share it.",
      close: "Close",
      included: "Included",
      includedItems: [
        ["Build & runtime", "version, commit, Node, limits"],
        ["Health checks", "every result"],
        ["Configuration", "set / default / missing"],
        ["Database", "migrations, schema, tables"],
        ["Worker & jobs", "per job, error patterns"],
        ["ESI & zKillboard", "request counters"],
        ["Modules & tokens", "counts only"],
        ["Audit activity", "counts per action, 7 days"],
      ] as [string, string][],
      never: "Never included",
      neverItems: [
        "Pilot, corporation and alliance names or IDs",
        "Secrets, passwords and tokens",
        "Your instance's address and host names",
        "Wallet, mining, kill or mail contents",
        "Who did what in the audit log",
      ],
      removed: "Removed from error messages",
      rules: {
        token: (count: number) => plural(count, "token", "tokens"),
        url: (count: number) => plural(count, "URL", "URLs"),
        email: (count: number) => plural(count, "email", "emails"),
        host: (count: number) => plural(count, "host name", "host names"),
        eveId: (count: number) => plural(count, "EVE ID", "EVE IDs"),
        name: (count: number) => plural(count, "name", "names"),
      },
      preview: "Preview",
      copyJson: "Copy JSON",
      size: (kb: number) => `${n(kb)} KB`,
      auditNote: "Downloads are recorded in the audit log.",
      cancel: "Cancel",
      download: "Download",
    },
    issue: {
      title: "Report an issue",
      intro: "Bug reports go to the Keystar project on GitHub. You need a GitHub account, and reports are public.",
      close: "Close",
      checks: {
        title: "Check the health checks",
        problems: (count: number) => `${plural(count, "problem", "problems")} found`,
        none: "No problems found",
        body: "These often explain the problem without a report:",
      },
      search: {
        title: "Search existing issues",
        body: "If someone already reported it, add a comment there instead.",
        label: "Search issues",
        placeholder: "e.g. corp.wallet 403",
        button: "Search on GitHub",
      },
      download: { title: "Download the support package", body: "Attach it to the report.", button: "Download" },
      logs: { title: "Collect the logs", body: "Run this on the server, then remove anything secret from the file:" },
      open: {
        title: "Open the bug report",
        body: "GitHub opens with the fields on the right filled in. Describe what you did and what went wrong, then drag the support package and the logs into the report.",
      },
      prefilled: "Filled in for you",
      version: "Version",
      summary: "System summary",
      copySummary: "Copy summary",
      openGithub: "Open bug report on GitHub",
    },
  },
};
