import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** The help dialog ("?" in the top bar), the welcome tour and the sidebar's "New" dots. */
export const help = {
  button: "Help",
  buttonTitle: "Help and tour (?)",
  title: "Help",
  intro: "How Keystar works, what it reads from EVE and who sees what.",
  close: "Close help",
  topicsLabel: "Help topics",
  topics: {
    page: "This page",
    basics: "How Keystar works",
    scopes: "Scopes and EVE access",
    data: "Your data and security",
    access: "Who sees what",
  },
  /** `key` renders the keyboard key. */
  shortcut: (key: ReactNode) => <>Press {key} on any page to open this help.</>,
  whatsNew: (version: string) => `What's new in v${version}`,
  takeTour: "Take the tour",
  /** The running version in the footer. */
  version: (version: string) => `Keystar v${version}`,
  /** The sidebar's dot on a page that is new in this release (screen readers). */
  newBadge: "New in this release",

  page: {
    none: "This page has no help of its own. Pick a topic, or open a page from the sidebar and press ? there.",
    whoCanOpen: "Who can open it",
    everyone: "Everyone who is signed in",
    nobody: "No role at the moment",
    /** `role` renders the role badge. */
    fromRole: (role: ReactNode) => <>{role} and above</>,
    ownData: "Only your own data: nobody else sees it here, whatever their role.",
    optional: (access: string) => `Optional access, per character: ${access}.`,
    manage: "Manage access",
  },

  basics: {
    intro: (corp: string | null) =>
      `Keystar is a dashboard for ${corp ?? "your corporation"}. It runs on a server your corporation operates, not by CCP, and it only reads from EVE.`,
    steps: {
      signIn: {
        title: "Sign in with EVE Online",
        body: "You log in on EVE's own login page (EVE SSO). Keystar never sees your EVE password, and signing in only proves which character you are.",
      },
      grant: {
        title: "Grant read-only access",
        body: "To show your data, a character grants ESI scopes: read-only permissions for one kind of data each, such as its mining ledger. All of them are optional: you switch them on per character on the feature's page.",
      },
      sync: {
        title: "Keystar syncs in the background",
        body: "A background worker fetches the data from ESI on a schedule, from every few minutes to every hour depending on the data, and stores it in Keystar's database.",
      },
      read: {
        title: "Pages show what was synced",
        body: "Pages read Keystar's database, not EVE, so data can be a few minutes old. My Characters shows each character's background syncs and can queue them now.",
      },
    },
    public:
      "Some features need no access at all: the Combat Report and Threat Intel use public killmails from zKillboard, the map uses CCP's static data, and appraisals use public market prices.",
  },

  scopes: {
    intro:
      "An ESI scope is a read-only permission for one kind of data of one character, such as its mining ledger or skill queue. EVE lists the scopes on its login page before you agree.",
    facts: {
      signIn: "Signing in, registering and linking a character ask for no scopes: they only prove who you are.",
      readOnly: "Every scope Keystar asks for only reads. Keystar can't move items, ISK or ships, or do anything in game.",
      perCharacter:
        "Each character has its own token. EVE replaces a character's scopes each time it logs in, so Keystar asks again for the ones the character already granted.",
      /** `link` renders the link to EVE's authorised apps page. */
      revoke: (link: (text: string) => ReactNode) => (
        <>
          Switch optional access off on its page in Keystar any time. To revoke Keystar entirely, use {link("Authorized Apps")} on
          the EVE developers site.
        </>
      ),
    },
    member: {
      title: "Asked from everyone",
      body: "Granted when you register or link a character.",
    },
    optional: {
      title: "Optional, per character",
      body: "Off until you switch them on for a character on the feature's page.",
      manage: "Manage",
    },
    corporation: {
      title: "Corporation access",
      body: "Only for corporation data, from one character of a director or officer. They only return data with one of the in-game roles listed.",
      roles: (roles: string) => `In-game role: ${roles}`,
    },
    none: "None",
  },

  data: {
    stored: {
      title: "What Keystar stores",
      body: "Your characters' names and corporations, your Keystar role, and the data your characters return for the access you switch on, such as mining ledgers, skill queues or mail.",
    },
    security: {
      title: "How it is protected",
      tokens: "ESI tokens are encrypted with AES-256-GCM before they are stored. The key comes from the server's secret, which is not in the database.",
      sessions: (days: number) =>
        `Your sign-in is a random cookie. The database only keeps a hash of it, with your IP address and browser, and it expires ${n(days)} days after your last visit.`,
      password: "Keystar never sees your EVE password or your EVE account.",
      selfHosted:
        "Keystar runs on a server your corporation operates. Whoever runs it holds the database and its secret, so they could read anything stored there, private data included.",
    },
    private: {
      title: "Only you",
      body: "EVE Mail, the Mining P&L with your wallet imports, industry jobs and market orders. No role, not even admin, can open them in Keystar.",
    },
    visibility: {
      title: "Who else sees your data",
      intro: "With the role shown or above. Admins can change these roles in Settings.",
      rows: {
        account: "Your account, characters, role and ESI token health (Users & Roles, Member Audit)",
        mining: "What your characters mined (Mining Overview and Mining Ledger, corporation view)",
        skills: "Skill queues of characters you shared skills for (corporation view)",
        audit: "Changes you make to roles, settings and your optional access (Audit Log)",
        scans: "Threat Intel scans you run, by their link; their pilots also feed the corp-wide recently seen list",
        appraisals: "Appraisals you save, by their link",
      },
    },
    delete: {
      title: "Removing data",
      body: "Removing a character on My Characters deletes its token, revokes it at CCP and deletes its wallet, mail, industry and market data; its mining history stays with the corporation unless you delete it first on Mining access. Mining, skill, industry, market, mail and wallet data can also be deleted on their own pages. Keystar has no button to delete your account: ask a director or admin to disable it.",
    },
    retention: (r: { appraisals: number; scans: number; pilots: number; killmails: number }) =>
      `Deleted automatically: appraisals after ${n(r.appraisals)} days, Threat Intel scans after ${n(r.scans)} days, pilot profiles after ${n(r.pilots)} days and killmail summaries after ${n(r.killmails)} days. Mining ledgers (until you delete your own) and the corporation wallet archive are kept for good.`,
    ai: "This server has a Claude API key, so Claude (by Anthropic) writes the weekly situation report and Threat Intel briefings. It gets facts Keystar worked out from public killmails and scans, such as pilot, corporation and ship names, systems and standings; never your tokens, mail, wallets or skills.",
  },

  access: {
    /** `role` renders the viewer's role badge. */
    you: (role: ReactNode) => <>Your Keystar role: {role}</>,
    intro:
      "Keystar roles decide what each account sees, and each role includes everything below it. They are separate from in-game corporation roles; directors and admins assign them on Users & Roles.",
    ladder: "Roles",
    table: {
      title: "Pages and the role they need",
      page: "Page",
      role: "From role",
      you: "You",
      yes: "You can open it",
      no: "Not with your role",
    },
    everyone: "Everyone",
    nobody: "Nobody",
    overrides: "Admins can change the role a permission needs; this table already shows the current settings.",
    manage: "Change in Settings",
    guest: (corp: string | null, autoCorp: boolean, autoAlliance: boolean) =>
      autoCorp
        ? `New members of ${corp ?? "the home corporation"}${autoAlliance ? " and its alliance" : ""} are approved automatically as members. Everyone else starts as a guest until a director approves them.`
        : "Everyone starts as a guest until a director approves them.",
  },

  tour: {
    title: "Welcome to Keystar",
    intro: "A short tour: what Keystar does, what it reads from EVE, and who sees what.",
    stepsLabel: "Tour steps",
    welcome: "Welcome",
    start: "Get started",
    progress: (step: number, total: number) => `Step ${n(step)} of ${n(total)}`,
    back: "Back",
    next: "Next",
    finish: "Done",
    skip: "Skip the tour",
    hello: (name: string | null) => (name ? `Welcome, ${name}` : "Welcome"),
    body: "Keystar brings your corporation's EVE data together: mining, combat, fleets, wallets and more. This tour takes about two minutes.",
    /** `key` renders the keyboard key. */
    /** For admins on the welcome step: an account without a seen version may have just updated (`whatsNew.actionNeeded`). */
    upgrade: (version: string) =>
      `If you just updated Keystar: before everything in v${version} works, whoever runs this server has to:`,
    reopen: (key: ReactNode) => <>You can open it again any time with the ? button in the top bar, or by pressing {key}.</>,
    nextSteps: {
      intro: "A few good first steps:",
      characters: {
        title: "Link all your characters",
        body: "On My Characters, add your alts and check that every token is healthy.",
      },
      optional: {
        title: "Switch on what you want to share",
        body: "Optional access is per character and off until you turn it on:",
      },
      admin: {
        title: "Check the settings",
        body: "Who is approved automatically, valuation, and the role each permission needs.",
      },
      guest: {
        title: "Wait for approval",
        body: "A director has to approve your account before you see corporation data. Until then you can link your characters.",
      },
      dashboard: "Go to the dashboard",
    },
  },
};
