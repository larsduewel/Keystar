# Architecture

Keystar is one TypeScript codebase that runs as two processes against one PostgreSQL database:

```
                ┌──────────────┐     HTTPS      ┌──────────────────────────────┐
   Browser ───▶ │    Caddy     │ ─────────────▶ │  app  (Next.js, server.js)   │
                └──────────────┘                │  pages · server actions ·    │
                                                │  /auth/* SSO routes          │
   EVE SSO ◀──── login / token exchange ─────── │                              │
                                                └──────────────┬───────────────┘
                                                               │ Drizzle (postgres.js)
                                                        ┌──────▼──────┐
                                                        │  PostgreSQL │
                                                        └──────▲──────┘
                                                               │
   ESI ◀──── scheduled, cached, rate-limited requests ──┌──────┴───────────────────┐
                                                        │  worker (dist/worker.mjs)│
                                                        │  planner · runner · jobs │
                                                        └──────────────────────────┘
```

- The **app** never calls authenticated ESI routes on page loads; pages read from Postgres. It only talks to EVE
  during sign-in and for public lookups a user asks for (the ore field estimator and the appraisal resolving and
  pricing item types they haven't seen before, a threat intel scan resolving pasted names and affiliations, a gate
  check naming the pilots and ships it shows).
- The **worker** owns all background ESI traffic and token refreshes, and also pulls public killmails and pilot
  statistics from zKillboard and (optionally) asks the Claude API to write the killboard's weekly situation report
  and threat intel briefings. Dossiers and d-scan reads are written when a user asks for them.

## Source layout

```
src/
  app/                 Next.js routes
    (app)/             signed-in area (sidebar shell): dashboard (_dashboard/ holds its panels), mining, industry, market, characters, admin
    auth/              SSO login / callback / logout / demo routes
    setup/             first-start walkthrough for the first admin
    login/, join/      public pages
  i18n/                UI languages: locale detection, typed en/de dictionaries, getI18n() / useI18n()
  core/                framework-level code shared by every module
    auth/              SSO (sso.ts), sessions, provisioning, role policy, data access layer (dal.ts)
    db/                Drizzle client and core schemas (core, eve, sync)
    esi/               ESI client, token refresh, DB-backed response cache
    eve/               EVE data: resolver (names/types/systems), prices, ore classes, image URLs
    help/              help dialog data, welcome tour / What's new selection, release highlights registry
    rbac/              roles and permissions
    sync/              job types, scheduler, core jobs
    modules/           module contract and registry
    settings.ts        typed app settings (stored as JSON rows)
  modules/
    mining/            the mining module: schema, jobs, queries, filters, UI components, estimator
    industry/          opt-in industry jobs of the viewer's own characters: schema, sync job, station/structure names, UI
    killboard/         zKillboard client and sync, combat aggregates, situation report (Claude or template), UI
    intel/             threat intel: paste parser, scans, zKillboard worker, scoring, standings, history with us,
                       d-scan matching, briefings and dossiers (Claude or template), UI
    gatecheck/         gate check: kills near stargates from the live feed, routes (EVE's autopilot weights),
                       route check, camp estimates, UI
    map/               3D universe map, travel check and jump ranges (static data in public/data)
    trade/             appraisal: paste parser, name resolution, Jita pricing, saved shareable snapshots
    market/            opt-in market orders of the viewer's own characters: schema, sync job, UI (station and
                       structure names shared with industry)
    wallet/            opt-in character wallet transactions (raw data used by the mining P&L); corp/: corporation
                       wallet archive (balances, journal, transactions), classification, finances pages' queries
    social/            opt-in EVE mail (read-only): mail sync, EVE HTML parser, link resolution, mail UI
    jobs.ts            registry of background jobs (worker only)
  worker/index.ts      worker entry point
  scripts/             migrate, demo-seed
drizzle/               generated SQL migrations
docker/                entrypoint, Caddyfile
```

## Authentication and accounts

1. `/auth/login?intent=…` creates a PKCE pair and a random `state`, stores them in an encrypted, short-lived
   cookie and redirects to `login.eveonline.com/v2/oauth/authorize`.
   - `login` — identity only, no scopes
   - `join` — register from the `/join` link; like `login`, no scopes
   - `link` / `link-corp` — add a character to the signed-in account (no scopes / the corporation scopes), plus any
     opt-in scopes named in `with=`

   Every character scope is opt-in (enforced by `tests/optional-scopes.test.ts`), so registering and linking only
   prove who the pilot is; a character without a token is a normal state, not a problem (`esiHealth()` in
   `src/core/modules/registry.ts` tells it apart from a revoked token).
2. `/auth/callback` exchanges the code, validates the JWT (signature via CCP's JWKS, issuer, audience contains the
   client id **and** `"EVE Online"`, expiry) and calls `provisionFromSso()`.
3. Provisioning creates or finds the user, links the character, stores the encrypted refresh token, applies the role
   policy and detects **character transfers** (the SSO `owner` hash changes → the old account loses the character
   with its wallet history, mail and industry jobs; an account left without characters is disabled and signed out).
   A character moved between the player's own EVE accounts and linked back to the same Keystar account hasn't
   changed hands: it keeps its data; only the owner hash and token are updated and cached ESI responses refetched.
4. Sessions are random 32-byte tokens; only their SHA-256 hash is stored. 30-day sliding expiry: the database row
   is extended on activity (authoritative) and `src/proxy.ts` renews the cookie on each navigation.

Authorisation is enforced in the **data access layer** (`src/core/auth/dal.ts`): `requireUser()`,
`requirePermission()` for pages and `assertPermission()` for server actions. `src/proxy.ts` only does an optimistic
redirect for visitors without a session cookie.

**Optional scopes.** A module can mark a scope `optional` (e.g. wallet read for the mining P&L): it is never part of
the member or corporation scope sets and never shown as missing. A user enables it per character; the link
(`/auth/login?intent=link&with=<scope>`) is built by `reauthorizeHref()` in `src/core/modules/registry.ts`, which also
re-requests the corporation and optional scopes the character already holds, because EVE replaces a token's scopes
on every login. Re-linking a character through a generic link ("Link a character", corporation access, `/join`)
can't keep them: provisioning reports opt-in scopes the character lost, and unless the user asked to drop them
(`drop=` in the sealed OAuth state) the callback sends them to My Characters with a "turn it back on" warning.
Imported history is kept either way.

Switching an optional scope off happens in Keystar, because EVE can't remove a single scope without a new login.
`src/core/auth/scope-switch.ts` moves it from `esi_tokens.scopes` (what Keystar uses, and what every query and the
job planner read) to `esi_tokens.disabled_scopes` (still in the token, unused). Token refreshes keep it off, and
switching it back on needs no login while the token holds it. My Characters notes such scopes. Re-authorising
requests only the scopes in use, so the new token drops them, and every SSO consent clears `disabled_scopes`. A
re-authorisation that requests no scope at all (the character's last opt-in access was switched off or dropped)
deletes the character's token and revokes its refresh token with CCP; any other login without scopes (signing in,
`/join`, a plain "Link a character" with a character already on the account) leaves an existing token alone.

After an SSO round trip the callback confirms the outcome (character linked, re-authorised, access changed) or
explains a failed link with a one-shot `ks_flash` cookie (`src/core/flash.ts`), which `FlashToasts` in the app
layout shows as a toast. A signed-in user whose link fails goes back to the page they came from instead of `/login`.

Re-authorise links name their character (`reauthorizeHref(granted, { characterId })` → `&character=`, kept in the
sealed OAuth state). EVE lets the user pick any character of their account, and storing that token would give the
picked character the scope set meant for the other one (dropping, for example, its corporation scopes and with
them the corporation jobs). So the callback refuses a login with any other character: it stores nothing and says
which character to pick. "Link a character" and the corporation-access link still accept any character.

## Roles and permissions

Roles are hierarchical: `guest < member < viewer < contributor < director < admin`. Every permission has a default
minimum role; admins can override the minimum per permission (Settings → Permissions), except locked ones such as
`app.settings.manage`. Users can only manage, and assign roles to, users strictly below them (admins excepted).

New users get a role from configuration: `ADMIN_CHARACTER_IDS` → admin; otherwise the first user ever → admin; home
corporation (optionally alliance) members → member; everyone else → guest awaiting approval. Logging in never
demotes anyone.

With **Only members can sign up** (Settings → Access, `access.restrictToMembers`) outsiders get no account at all:
`mayRegister` in `src/core/auth/policy.ts` refuses a new account unless the character is in the home corporation (or
its alliance, when alliance members are auto-approved) or would be admin, and the attempt is audited as
`user.registration.blocked`. Existing accounts and alt links are unaffected. Guests who registered from outside before
the switch can be disabled in one go on the Users page.

## Languages

The UI is available in English and German (`src/i18n`). The language is not part of the URL:

- An explicit choice from the language switch (sidebar footer; sign-in, registration and setup pages) is stored in
  the `ks_locale` cookie by the `setLocale` server action, which also revalidates the root layout.
- Without that cookie, the browser's `Accept-Language` header decides (`negotiateLocale`, by quality then order).
  Anything that doesn't ask for German — including no header at all — gets English.

Texts live in dictionaries, one namespace per area: `src/i18n/messages/en/*` is the source and defines the
`Messages` type; `src/i18n/messages/de/*` must match it exactly, so a missing or extra German key fails the
typecheck. Dynamic text is a function (`selected: (count: number) => …`), text with embedded markup a function
taking React nodes. Server code reads `{ t, f } = await getI18n()`, client components `useI18n()`; `f` is the
locale-aware formatter from `src/lib/format.ts` (German: "9,87 Mio. ISK", "12,3 %", "vor 5 Minuten"). Dates and
times are in EVE time (UTC): `f.date` gives "02 Oct 2026" / "02.10.2026", `f.dateTime` adds "18:00 ET". Module manifests and job definitions name their texts with `Msg`
selectors (`label: (t) => t.mining.module.nav.ledger`) so they can be rendered in any language.

Not translated: names from ESI (items, systems, pilots — ESI is queried in English), CSV exports, log output and the
stored killboard situation reports. Threat intel notes written by Claude stay in the language of whoever asked for
them; its scores, tags and template notes are stored as data and shown in the reader's language.

## ESI client

`src/core/esi/client.ts` handles the ESI rules introduced in 2025:

- versionless routes with an `X-Compatibility-Date` header (`ESI_COMPATIBILITY_DATE`, check `/meta/changelog`
  before bumping it)
- `ETag` / `If-None-Match` revalidation and `Expires`-based caching in the `esi_cache` table, so jobs can run on a
  timer without spending rate-limit tokens
  (the entry is written before the job stores the body, so `notModified` and `fromCache` say the body is unchanged,
  not that it was stored: a job that skips its write on them never repeats a failed write; write idempotently
  instead)
- `X-Pages` pagination
- back-off when the legacy error budget runs low (`X-ESI-Error-Limit-*`) and per rate-limit group on `429`
  (`Retry-After`, `X-Ratelimit-Group`)
- one automatic token refresh on `401`; `403` raises `EsiForbiddenError` (missing scope or in-game role)

Tokens are refreshed in `src/core/esi/tokens.ts`, serialised per character by an advisory lock rather than the
`esi_tokens` row lock, so scope switches and logins don't wait on CCP. The refresh token SSO returns (it may rotate)
is committed right after the SSO call, before the new access token is verified; the access token and its scopes are
stored in a second short transaction. Both writes only apply if the row still holds the refresh token they started
from, so a login that replaced the token meanwhile wins. `invalid_grant` marks the token invalid so the pilot sees
"Re-authorise".

## Sync engine

Jobs are declared with an owner type:

| Owner         | Rows planned for                                                             |
| ------------- | ---------------------------------------------------------------------------- |
| `character`   | every character with an active token that has the job's scopes               |
| `corporation` | the home corporation, if at least one member token has the scopes           |
| `global`      | one row                                                                      |

The worker re-plans every 30 s (new tokens get rows, revoked ones are disabled), claims due rows with
`FOR UPDATE SKIP LOCKED` (several workers are safe), and records the outcome on the row: next run (at least the job
interval, later if ESI's `Expires` says so), status, summary, duration, error, exponential back-off. Corporation jobs
try characters that hold the preferred in-game role first and fall back to the next character on `403`; jobs whose
endpoint needs no role (`anyCorpMember`) can use any member's token. `triggerJobs()` makes a job due now; a trigger
that arrives while the job runs is kept, so it runs again right after.

Current jobs:

| Job                              | Interval | Purpose                                                    |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| `core.server-status`             | 5 min    | Tranquility player count                                   |
| `core.affiliations`              | 1 h      | Character corp/alliance changes                            |
| `core.character-roles`           | 1 h      | In-game roles (picks the right token for corp jobs)        |
| `core.corporation-members`       | 1 h      | Corp roster for the member audit                           |
| `core.market-prices`             | 1 h      | ESI average + Jita 4-4 buy/sell, valuations, daily history |
| `core.housekeeping`              | 6 h      | Expired sessions and cache entries                         |
| `core.universe-systems`          | 30 days  | Every known-space and wormhole system with its region for the system picker (500 a minute until complete) |
| `mining.character-ledger`        | 15 min   | Personal mining ledgers; records mining activity windows   |
| `mining.corporation-observers`   | 1 h      | Moon-refinery observer ledgers (Accountant)                |
| `mining.corporation-structures`  | 6 h      | Refinery names and locations (Station Manager)             |
| `industry.character-jobs`        | 5 min    | Industry jobs of each character (incl. finished ones), names their stations and structures |
| `market.character-orders`        | 20 min   | Open market orders of each character and its order history (90 days), names their stations and structures |
| `killboard.zkill-sync`           | 1 h      | Home corporation kills/losses from zKillboard (no token)   |
| `killboard.live-feed`            | 10 s     | zKillboard's live feed (R2Z2): home-corporation killmails within seconds, for the live notifications; every kill near a stargate for the gate check |
| `killboard.situation-report`     | 1 h      | Writes the weekly situation report once a week has closed  |
| `intel.scan-worker`              | 2 s      | zKillboard work for threat intel scans (idles at 1 min; woken by new scans) |
| `intel.briefings`                | 1 min    | Briefings for scans that became ready (woken by the scan worker) |
| `intel.housekeeping`             | 6 h      | Retention of killmail digests, pilot profiles and scans    |
| `intel.corporation-contacts`     | 15 min   | Home corporation contacts (standings), any member's token  |
| `intel.alliance-contacts`        | 15 min   | Home alliance contacts (standings), any member's token     |
| `trade.housekeeping`             | 6 h      | Deletes appraisals older than a year, old rate-limit rows  |
| `gatecheck.housekeeping`         | 6 h      | Retention of the gate check's kills (60 days at gates, 7 days elsewhere) |
| `wallet.character-transactions`  | 1 h      | Market transactions of characters that opted in to wallets |
| `wallet.corporation-wallets`     | 1 h      | Corporation balances, journal and transactions, all divisions (Accountant / Junior Accountant) |
| `wallet.corporation-divisions`   | 6 h      | Custom wallet division names (Director)                    |
| `social.character-mail`          | 5 min    | EVE mail, labels and mailing lists of characters that opted in to mail |
| `skills.queue`                   | 15 min   | Skill queue of characters that share their skills; static skill attributes and ranks |
| `skills.character`               | 1 h      | Trained skills, skill points and attributes of characters that share their skills |
| `skills.implants`                | 1 h      | Active-clone implants and their attribute bonuses, for characters that share their skills |

## System info and support package

Administration → System Info (`/admin/system`, permission `system.view`: admins only, locked) is built from one
snapshot, `collectSystemSnapshot()` in `src/core/system/collect.ts`. Each collector (database, worker and jobs,
tokens, settings, clock, audit counts) is wrapped so that one failing collector never takes the page down. The web
process can't see the worker's process, so the worker reports its runtime and ESI/zKillboard request counters in
its heartbeat (`worker_heartbeats.info`); the clients count requests in `EsiClient.stats()` and
`ZkillClient.stats()`. The runtime (`runtime.ts`) includes load figures: the process's CPU share since its previous
sample (so the worker's covers one heartbeat interval and the web app's the time since System Info was last
loaded), its memory, the container's cgroup memory and the host's load average.

- `network.ts` probes ESI, EVE SSO (`/oauth/jwks`) and zKillboard with one request each (5 s limit), through
  `EsiClient.ping()` and `ZkillClient.ping()` so the User-Agent, counters and request spacing apply. ESI or SSO
  unreachable fails the network check; zKillboard unreachable or answering 403 (blocked User-Agent or IP), or any
  service answering 5xx, only warns. Each probe is aborted when its time is up.
- `checks.ts` turns a snapshot into health checks. They are pure, so the page, the support package and the tests
  agree; their texts live under `admin.system.checks`.
- `support-package.ts` builds the downloadable package from an **allowlist** of fields. Never add a field that holds
  a pilot, corporation or alliance name or ID, a secret, the instance's address or an audit actor; free text (job
  errors) goes through the scrubber in `redact.ts`, and worker ids are hashed with a per-package salt. Bump
  `SUPPORT_PACKAGE_FORMAT` when the layout changes in a way readers must know about.
- `summary.ts` writes the Markdown summary for GitHub issues, always in English, and the prefilled bug report URL
  (the `version` and `system` fields of `.github/ISSUE_TEMPLATE/bug_report.yml`).
- `src/scripts/support-package.ts` (`dist/support.mjs` in the image) writes the same package to stdout for when the
  web app doesn't start.

Keystar keeps no logs of its own; the page points admins to `docker compose logs`.

## Live alerts

Modules declare live alerts in their manifest (`alerts`; today `killboard.kills` and `social.mail`) and register a
feed component for each in `src/modules/alerts.ts`. The **Alerts** menu in the top bar
(`src/components/shell/live-alerts.tsx`) shows a per-browser switch (localStorage) for every alert the user may get
(`availableAlerts`: permissions and settings), plus one for desktop notifications. Each feed polls its endpoint
through `useLiveFeed` (`src/components/shell/live-feed.ts`), with a cursor from `src/core/live-cursor.ts`. How to
add one is described in docs/modules.md.

- A tab the user is looking at (visible and focused) shows new events as toasts. A hidden tab stops polling, and
  after 2 minutes hidden it starts over from "now" instead of replaying what it missed.
- With **desktop notifications** on (the browser's Notification API; needs permission and HTTPS), a tab the user
  isn't looking at keeps polling and shows each event as a native notification (Windows notification center, macOS
  Notification Center) instead. Focused tabs record a heartbeat in localStorage, and unfocused tabs leave events
  to a focused one so they show as toasts there. Browsers slow timers in background tabs (Chrome to about once a
  minute), so a notification can arrive later. There is no service worker or Web Push: with no Keystar tab open,
  nothing is announced.
- Tabs claim each event in a shared localStorage record under a Web Lock, so one browser announces it once.

## Help, welcome tour and What's new

The **?** button in the top bar (or the `?` key outside a text field) opens the help dialog
(`src/components/help/`): "This page", "How Keystar works", "Scopes and EVE access", "Your data and security" and
"Who sees what". The app layout builds its data on the server (`buildHelpData` in `src/core/help/data.ts`) from the
module manifests and the settings, so it can't drift from what Keystar enforces:

- "This page" is the `help` text of the sidebar page the path belongs to (the longest matching `href`, so
  `/industry/settings` explains Industry Jobs), with the role it needs (`minRoleFor`: the lowest role whose
  permissions, overrides included, reach one of the item's `anyPermission`) and `ownDataOnly`.
- "Scopes" lists `allScopeRequirements()` grouped as asked from everyone, optional per character (by `manageHref`)
  and corporation access (with their in-game roles), with the scopes' `reason` texts.
- "Who sees what" is every sidebar page with its minimum role and whether the viewer may open it, and "Your data"
  says who else sees a member's data by the effective role of the permission that shows it (`DATA_VISIBILITY`).
  Retention periods come from the modules' constants.

**Opening by itself.** `users.seen_version` is the newest version an account was shown something for; it is only
ever raised (`shouldRecordSeen`). `onboarding()` (`src/core/help/onboarding.ts`, pure) decides what the layout opens
once: null (a new account, or one from before this column) gets the **welcome tour** (the help topics in order,
between a welcome and a "get started" step); an older version gets **What's new** for every release in between;
the same or a newer version (a downgrade) gets nothing. When it opens, or when there was nothing to show for the
viewer, the client calls `markVersionSeen()`, which stores the running version, never one the client names.

**What's new** shows a release's highlights (at most four cards, newest release first, "and N more") and a link to
its GitHub release (`SOURCE_URL/releases/tag/vX`, or the release list when it covers several releases). Highlights
are curated in the release PR (docs/releasing.md): icons, links and permissions in `RELEASES`
(`src/core/help/releases.ts`), titles and texts in the `whatsNew.releases` dictionaries, keyed the same way so the
typecheck catches a missing translation. A highlight is only shown to viewers with one of its `anyPermission`. A
release's `upgrade` text (the short form of its CHANGELOG "Upgrade notes") is shown to whoever may manage the settings,
as "Action needed", and on the welcome tour's first step too, since an existing account gets the tour (not What's new)
after the update that adds `seen_version`. The sidebar's version link opens What's new when the running release has
highlights, and links to the release notes otherwise.

**"New" dots.** The sidebar marks the pages of the newest release's highlights (`navNews`) with a dot until the
page is opened in that browser (`ks_nav_seen` in localStorage, `src/components/shell/nav-news.ts`). The dot only
appears after hydration, so server and client render the same.

## EVE mail

Social → EVE Mail lets pilots read their characters' mail in Keystar. It is **read-only**: Keystar never
sends, deletes, labels or marks mail as read in game, so it only needs `esi-mail.read_mail.v1`, which is opt-in per
character (enabled from the mail page). The page only ever shows the signed-in account's own mail
(`social.mail`, default member). No role, including admin, can read another account's mail.

- **Sync** (`social.character-mail`, every 5 minutes): mail labels (with ESI's unread counts and fixed colours) and
  mailing lists are replaced each run. Headers are read newest first, paging back with `last_mail_id` until stored
  mail is reached; the first import stops after 20 pages (about 1,000 mails). The first page is always read, so
  read state and labels of recent mail stay current. Mail inside the id range ESI just listed in full that is no
  longer listed was deleted in game, and is deleted here too. Bodies are downloaded at up to 60 per run, newest
  first. Mail ESI returns 404 for is dropped. A body already stored for another of the account's mailboxes is
  copied instead of fetched again, for example a corporation mail to three alts. All mail routes share ESI's
  `char-social` rate-limit group (600 tokens per 15 minutes per character), so this stays well within budget. The
  job summary carries counts only, never subjects.
- **Storage**: `mail_messages` has one row per mailbox (`character_id`, `mail_id`) with the owning account
  (`user_id`). `mail_labels` and `mail_lists` store labels and mailing lists the same way. Mailing-list names come
  only from `mail_lists`, because `/universe/names` can't resolve them. As with the wallet, mail never follows a
  sold character: it is deleted with the account, when the character is removed, when it is transferred to another
  account, and on request once mail access is turned off. Mail bypasses the ESI response cache.
- **Folders**: Inbox, Sent, Corporation and Alliance are the built-in labels 1, 2, 4 and 8. Sent means sent by the
  mailbox's character. Mailing lists come from the recipients, and custom labels are merged by name across
  characters. A mail in several of the account's mailboxes is listed once, with the characters that received it.
- **Live alerts**: the top bar polls `/api/mail/live` every 30 s and shows a toast for each unread mail stored after
  its cursor (same cursor format as the killboard). Mail sent more than 3 h ago (a first import), mail sent from one
  of the account's own characters, and a mail already announced for another of its mailboxes are left out. The toast
  opens the mail in Keystar.
- **Rendering**: bodies are EVE HTML, not HTML (`<font size= color=>`, `<color=0xAARRGGBB>`, `<url=…>`, unquoted
  attributes, tags that are never closed). `src/modules/social/eve-html.ts` follows
  [CCP's reference](https://developers.eveonline.com/docs/guides/eve-html/): it tokenises, re-nests (an unclosed
  tag owns the rest, stray closes are dropped, the outer tag wins when tags cross), decodes only the four EVE
  entities, and validates colours (alpha first; text that would vanish on a dark surface keeps the normal colour)
  and font sizes (scaled to EVE's 12 px, clamped). The result is a typed tree rendered as React elements, never
  injected HTML.
- **Links**: `src/modules/social/links.ts` classifies links. `showinfo:` links are resolved with CCP's
  group/category table (the job stores the linked types and names). Characters, corporations, alliances,
  factions, systems, constellations and regions open zKillboard; item types open everef.net; `killReport:` opens
  the kill on zKillboard. `fitting:` shows the hull with a copy button for the DNA. `http(s)` opens in a new tab.
  Client-only schemes (`joinChannel:`, `contract:` …) become labelled chips. Anything else, such as
  `javascript:` or `data:`, is never a link.

## Mining data model

- `mining_character_ledger` — one row per character, day, system, ore (ESI aggregates per day; rows are upserted).
- `mining_observer_ledger` — one row per refinery, character, day, ore; includes pilots outside the corporation.
- The **combined** view adds observer rows only when the same character/day/ore is not already in a personal ledger,
  so moon mining by registered members is never counted twice.
- **Corporation-wide views** include characters currently in the home corporation and refineries owned by it —
  guests from other corporations or a previous home corporation's data never show up. The **My characters** view
  (`view=own`) shows all of a user's linked characters, alts in other corporations included; it is what members
  without `mining.view.corp` always see, and viewers with it can switch to it on the overview, the ledger and the
  export. Until a home corporation is set, everyone sees only their own characters.
- Values come from `type_values` (current) or `type_value_history` (price on the day mined). Raw ore without its own
  market falls back to its compressed variant (by portion size), then the ESI average and adjusted prices.
- `core.market-prices` prices the types the `PriceInterestProvider`s return (every ore in the ledgers) plus the types
  in `price_interest`: anything appraised or valued in the field estimator in the last 14 days. A type whose Jita
  orders can't be fetched keeps its previous values and counts as failed in the job summary; the rest are still
  written. On a rate limit the run stops fetching, writes what it has and retries when the limit lifts.

The personal ledger is opt-in per character (Mining → Access, `/mining/settings`): `mining.character-ledger` is only
planned for tokens holding the scope, and re-checks it before calling ESI and again under a share lock on the token
row before writing, so switching the ledger off stops reading at once. The history stays (also in corporation
figures) until the pilot deletes it on the same page (`deleteMiningData`, only while the ledger is off): the
character's ledger rows, its mining activity and the cached ESI copy go; moon-drill records stay with the corporation.

ESI keeps 30 days of ledger history; Keystar keeps everything it has synced until a pilot deletes their own.

## Mining P&L

A personal income/expense sheet (Industry → Mining P&L), only ever showing the signed-in account's own characters,
whatever corporation-wide permissions the user has (`mining.pnl`, default member).

- **Income** reuses the mining `ledger` CTE (own characters, combined sources, the corporation's valuation setting) and
  applies the account's income rate (`mining_pnl_settings`, e.g. 90% for buyback sellers) unless a per-ore price rule
  (`mining_pnl_price_rules`, optional date range, latest start wins) sets the price.
- **Wallet import** is opt-in per character (optional `esi-wallet.read_character_wallet.v1` scope). The wallet job
  pages back with `from_id` until it reaches stored transactions and stores personal transactions in
  `wallet_transactions` with the owning account (`user_id`), so wallet data never follows a sold character: it is
  deleted with the account, when the character is removed and when it is transferred to another account. Trades
  between the account's own characters are ignored (neither costs nor sales). Wallet responses bypass the ESI response cache, so
  deleting the history leaves no copy behind.
- **Expenses**: buys are auto-tagged by item group/type (`src/modules/mining/pnl/categories.ts`, with an SQL twin):
  mining crystals, Heavy Water, Mining Foreman burst charges, mining drones, mining hulls and fittings. A tagged
  purchase is *suggested* until the user includes it, or counted automatically for characters where the user
  switched that on (`mining_pnl_characters`, off by default); the user's category/include decisions
  (`mining_pnl_tx_overrides`) always win. Everything else stays out unless tagged. Manual entries
  (`mining_pnl_entries`) cover PLEX/Omega, contracts etc. and can be spread evenly over up to a year.
- **Income from wallet sales**: the account picks the income basis (`mining_pnl_settings.income_source`): `mined`
  (default) values the mined ore as above; `sales` counts market sells instead, on the day of the sale. Sells are
  auto-tagged by the activity they come from (`classifySale`, with an SQL twin): ore, moon ore, ice and gas, raw or
  compressed, plus minerals, moon materials and ice products. They go through the same suggested/counted/excluded
  review as purchases, with their own per-character switch (`mining_pnl_characters.auto_include_sales`) and the same
  override table. Volume, active hours and ISK/h always come from the mined ore. Only market sales count; anything
  the wallet doesn't show stays out.
- **Mined vs sold** (`getOreFlows`, `ore-flows.ts`): per raw ore, the mined units of the period against market sells
  of the ore or its compressed variant, converted to raw units by portion size like the valuation (1:1 for current
  ores; compression only shrinks the volume). Excluded sales and internal trades are left out; the ore left over is
  valued at the current valuation. Compressed gas has its own names and group, so it isn't linked to raw gas.
- **Taxes & fees**: `wallet.character-fees` reads the personal wallet journal with the same opt-in scope and keeps only
  `transaction_tax` and `brokers_fee` entries (`wallet_fees`, owned and deleted like `wallet_transactions`; the
  cursor is the newest journal id seen). Sales tax is matched to its sale by the journal's market transaction id,
  else the character's sale whose journal entry (`journal_ref_id`) comes right before the tax at the same time (a
  multi-sell books sale, tax, sale, tax …). Sales tax has no review of its own: it is deducted from its sale, so sale
  rows, the report's income and the mined-vs-sold table are net of tax. Broker fees belong to orders (ESI gives no
  context, so the stored journal `description` is shown), stay suggested until included, and are wallet expenses in
  the "fees" category, only when income comes from wallet sales. `mining_pnl_fee_overrides` holds the user's
  include/exclude decisions on broker fees. The job reads ESI's 30 days once more to fill in descriptions of fees
  imported before they were kept (`descriptions` in the job meta).
- **Sale hints**: wallet sells of a mined ore or its compressed variant, converted to raw units with the valuation's
  compression ratio, offered as one-click price rules.
- **Active hours / ISK per hour**: the ledger job compares each fresh ESI snapshot with the stored ledger in one
  transaction and records the window in which a character's quantities grew (`mining_activity`, per ledger day and
  ore; `mining_activity_coverage` per character). Observation time is ESI's `Last-Modified` when it is a plausible
  snapshot time; snapshots from Keystar's own cache are ignored; gaps over 40 minutes are not guessed at; growth
  within 35 minutes of the previous growth continues the session. Hours are unions of those windows (`range_agg`):
  wall-clock across characters, and per character and activity. ISK/h values the measured growth itself, so it only
  covers mining since the feature was deployed. Expenses are split across activities by active hours when measured
  activity covers ≥ 90% of income, otherwise by m³.

## Corporation wallets

Finances → Corporation wallet and Corp wallet journal show the home corporation's wallet divisions (`wallet.corp.view`,
default Director). ESI returns only about 30 days per division — the journal at most 10 pages of 1,000 entries
(CCP won't change this, esi/esi-issues#1172) — so `wallet.corporation-wallets` builds a long-term archive:

- Every hour it reads the balances (`corp_wallet_divisions`, plus the day's closing balance in
  `corp_wallet_balance_history`), then per division the journal (`page`/`X-Pages`, newest first) and market
  transactions (`from_id`). Paging stops at the first page that reaches stored ids, so a normal run makes two
  requests per division; all routes share the `corp-wallet` rate-limit group (300 tokens per 15 minutes). Responses
  bypass the ESI response cache: the archive is the copy that matters.
- `corp_wallet_journal` and `corp_wallet_transactions` are insert-only and never deleted. They are keyed by
  corporation and division with no foreign keys to characters, so the history survives members leaving and tokens
  being revoked. `ref_type` is stored as text: CCP adds values without a new compatibility date.
- `corp_wallet_sync_state` records per division and stream where the archive starts and its **gaps**: when an import
  no longer reaches stored data (no Accountant token for over a month, or more than 10,000 entries since the last
  run), the uncovered stretch is stored and shown on both pages instead of being silently lost.
- **Income and expenses** are positive and negative journal amounts, except **transfers between the corporation's own
  divisions** (`corporation_account_withdrawal` from the corporation to itself), which appear in both divisions'
  journals and are reported separately. Ref types are grouped into categories in
  `src/modules/wallet/corp/classify.ts` (with an SQL twin; a test checks the map against the ESI enum).
- Division names come from `/corporations/{id}/divisions` (Director only, renamed divisions only); others use the
  default names from the dictionaries.

The archive is meant to grow into spending and income breakdowns (by category, counterparty and item via the
transactions), trends from the balance history and office rent tracking (`office_rental_fee` by `context_id`)
without schema changes.

## Skills

Pilots → Skill queues shows, per character, the skill in training, when it and the whole queue finish, every queued
skill with its finish time, and the character's attributes and remap availability. Both skills scopes
(`esi-skills.read_skillqueue.v1`, `esi-skills.read_skills.v1`) are opt-in per character and are turned on and off
together on the Skills access page (`/skills/settings`). `skills.view.own` (default member) shows the viewer's own
characters; `skills.view.corp` (default director) adds a corporation view of home-corporation characters that share
their queue. Turning sharing off hides the queue at once, also from the corporation view; the stored rows stay until
the owner deletes them.

- **Sync**: `skills.queue` replaces `skills_queue` with what ESI returns. ESI only refreshes the queue when the
  character logs in, so the pages hide entries whose finish time has passed; a queue without dates is paused.
  `skills.character` upserts `skills_character_skills` (dropping skills ESI no longer lists) and `skills_character`
  (total and unallocated SP, the five attributes, bonus remaps and the yearly remap date).
- **Static data**: `skills_type_attributes` holds each queued skill's primary and secondary attribute (dogma
  attribute ids 164–168) and rank, read from the `dogma_attributes` of `/universe/types/{id}`.
- **Implants**: `esi-clones.read_implants.v1` is part of skill sharing (`SKILLS_SCOPES`): "Share skills" requests
  it, and Keystar switches it on and off with the skills scopes. Being shared only takes the queue and skills scopes
  (`SKILLS_CORE_SCOPES`), so characters that shared before implants were added stay shared and are asked to
  re-authorise. `skills.implants` replaces `skills_implants` with the active clone's implants;
  `skills_implant_attributes` caches each implant's attribute bonuses (dogma 175–179, zeros for implants without
  one), read before the implant names so a name lookup failure can't hold them up.
- **Remap optimiser** (`/skills/remap`, `src/modules/skills/remap.ts`, pure): a skill trains at primary + secondary
  / 2 SP per minute. ESI's attributes include implant bonuses, so the base is the ESI attributes minus implants. The
  SP still to train is summed per primary/secondary pair, and every legal remap (2,885: 17–27 per attribute, 99 in
  total) is timed with the implants on top; ties keep the current attributes, then the closest remap. When the base
  isn't a legal remap (unknown implants or a booster), nothing is recommended: unknown implants change which remap is
  fastest, not only the times. A queue shorter than 180 days after the remap (or as it trains now, without a
  recommendation) gets a warning, since the yearly remap only returns after 365 days.
- **Planned on top of it**: corporation skill plans checked against `skills_character_skills`.
  ESI has no skill-plan endpoint, so plans would be pasted from the in-game "copy to clipboard" text and resolved
  with `/universe/ids`.

## Killboard

- `src/modules/killboard/zkill.ts` is the only code that talks to zKillboard: a descriptive User-Agent (with
  `ESI_CONTACT`), gzip, requests spaced ≥ 1.1 s apart, retries on 429/5xx. zKillboard caches API responses for an
  hour, so the sync runs hourly.
- **Live feed**: `killboard.live-feed` reads zKillboard's R2Z2 feed (`r2z2.zkillboard.com/ephemeral/{sequence}.json`,
  the replacement of RedisQ, which closed in May 2026). Every killmail in New Eden gets the next sequence number;
  the job counts upwards from its stored position (job meta) until a 404, at most 300 files a run spaced 100 ms
  apart, then waits 10 s (zKillboard asks for at least 6). The feed is unfiltered: killmails without the home
  corporation are skipped, the rest go through `storeKillmails` and their names (plus the outside final-blow
  pilot, corporation tickers and regions) are resolved right away. A missing number below the published pointer is
  skipped as a gap; a position older than 20 h (files are kept for at least 24 h) or for another corporation starts
  over at the pointer, and the hourly sweep fills anything in between. A 403/429 keeps it away for 10 minutes.
  Starting over, it reads `START_BACKLOG` (2,500) files back from the pointer, a few hours of New Eden, so the gate
  check knows recent camps at once. The same read feeds the gate check (see below), so the job also runs without a
  home corporation.
- **Live notifications**: for users with `killboard.view`, the top bar polls `/api/killboard/live` every 15 s and
  shows a toast for each kill or loss stored after its cursor (`first_seen_at` to the microsecond plus the killmail
  id, since one insert stores many rows with the same timestamp; killmails older than 3 h are never announced, so
  backfills stay quiet). A toast shows
  the destroyed hull, the corporation's pilot (loss: the victim; kill: the final blow, or top damage when an outsider
  landed it), the other side, system and ISK value, stays 30 s (the countdown bar pauses on hover) and opens the
  killmail on zKillboard. Demo mode doesn't run the live job. The polling, the per-browser switches and the desktop
  notifications are shared with the mail alerts; see "Live alerts" below.
- The first sync imports 90 days month by month (`/corporationID/{id}/year/{y}/month/{m}/`); afterwards an hourly
  7-day sweep (`/pastSeconds/604800/`) also catches killmails zKillboard receives late. A gap longer than six days,
  or a new home corporation, triggers another backfill.
- `killmails` stores the victim and zKillboard's values (total/fitted/destroyed/dropped, points, solo, npc, awox,
  labels); `killmail_attackers` stores every attacker. Corporation ids are the ones recorded at the time of the kill.
- A **kill** is a killmail with a home-corporation attacker and a victim from another corporation; a **loss** is a
  killmail whose victim flew for the home corporation (an awox counts as a loss only). ISK counts in full for every
  pilot and hull involved, as on zKillboard. Week-over-week figures compare the last 7 complete EVE days with the 7
  days before.
- **Situation report**: once a 7-day window has closed (plus a 2-hour grace period for late killmails),
  `killboard.situation-report` gathers the week's facts (totals, leaders, movers, hot systems, biggest kill and
  loss), and Claude writes the report via structured outputs (JSON validated with zod) when `ANTHROPIC_API_KEY` is
  set; otherwise, or if the call fails, a deterministic template writes it. Reports use a tiny inline markup
  (`**bold**`, `{+good}`, `{-bad}`, `{@Pilot}`) rendered as React text — model output is never rendered as HTML.
  Reports are stored with the facts they were written from (`killboard_reports`).

## Gate check

`/gatecheck` (Combat; `gatecheck.use`, every role down to guest, since everything it shows is public) plans a
stargate route and checks it gate by gate. Nothing on the page calls zKillboard.

- **Data**: `killboard.live-feed` already reads every killmail in New Eden from R2Z2; it hands each batch to
  `recordFeedKillmails` (`src/modules/gatecheck/ingest.ts`), which keeps the ones in known-space systems with
  stargates in `gatecheck_kills`: the stargate within 150 km of the victim's position (`gate_id`, null away from the
  gates; without a position, zKillboard's `locationID` if it is one of the system's gates), the victim, zKillboard's
  `npc` flag, whether CONCORD is on the mail (a suicide gank), and the player attackers (at most 100, by damage) as
  aligned arrays of character, corporation, alliance, hull and weapon. Hull and weapon types are named through the
  resolver, so tags can be told from their inventory groups. `gatecheck_feed` records since when the feed has been
  read without a gap and when it last caught up: without a catch-up in the last 3 minutes a quiet gate shows as
  "unknown", after 15 minutes the feed counts as offline. Kills at gates are kept 60 days, others 7.
- **Routes** (`route.ts`, pure): Dijkstra over the static stargate network (`public/data/map-gates.json`) with EVE's
  autopilot weights (`developers.eveonline.com/docs/guides/route-calculation`): every system entered costs 1 on
  "shortest"; on "safer" high-sec costs 0.9, low-sec e^(0.15 × 50) and null-sec twice that ("less secure" swaps high
  and low). Avoided systems are left out (never the start or destination); Zarzakh is never passed through, since
  its emanation lock keeps you at the gate you came in by.
- **Check** (`check.ts`, pure): per system the gate you arrive by and the gate you leave by; kills there in the last two
  hours are "route" kills, the rest of the system's kills are listed apart. Tags (`tags.ts`):
  smartbomb (a weapon in the Smart Bomb group), interdictor, HIC, gank (CONCORD on the mail), hot drop (Black Ops,
  capitals) and pod. Status: camp (a player kill at a route gate in the last 30 minutes, or three within the hour),
  recent, activity elsewhere in the system, quiet, or unknown while the feed is behind.
- **Camp estimate** (`predict.ts`, pure) for the time each gate is reached (leaving now, about a minute a jump): history
  (on how many of the last up to 30 days there were kills at these gates within an hour of that time of day,
  smoothed as (days + ½) / (N + 1)), live (the newest route-gate kill, half-life 45 minutes to the arrival), and
  regulars (pilots with kills at these gates on two or more days, seen killing within 5 jumps in the last two hours
  anywhere but at these gates; half-life 60 minutes). They combine as independent chances; under 3 days of history
  the history part is left out. The page shows the parts, the busiest hours, the regulars and the groups behind most
  kills.
- The map's travel check (`/api/map/gate-check`) reads the same table instead of zKillboard.

## Threat intel

A scan is a pasted list of pilots (local member list, fleet composition, chat lines, names) and an optional d-scan,
saved under an unguessable id like an appraisal. Only the normalised names are stored, never the raw paste.

- **Instantly** (in the server action): names resolve through `eve_entities`, then ESI `POST /universe/ids`;
  affiliations through `POST /characters/affiliation` (cached an hour in `intel_pilots`); standings from the home
  corporation and alliance (own corp/alliance always friendly; otherwise the most specific contact wins, the
  corporation's list before the alliance's); and **history with us** from the killboard tables: kills on us,
  losses to us and the hulls flown against us, plus fights (our killmails with any pasted pilot, clustered by system
  and a 30-minute gap) with what they brought and who else was there. D-scan types we don't know yet are fetched from
  ESI (`GET /universe/types/{id}`) within limits, because a pasted made-up id costs a 404 from the per-IP error budget
  that pauses all ESI calls once drained: at most 50 lookups per paste (most common types first), at most 20 pastes
  with lookups per user in 10 minutes (`intel_dscan_lookups`, reserved in a locked transaction), none once the shared
  client reports fewer than 50 errors left, and ids ESI answered 404 for are not asked again for 6 hours. Ships still
  unknown are left out; known ones always show.
- **The worker** (`intel.scan-worker`) works through `intel_queue`, one row per pilot shared by every scan, in
  stages: zKillboard statistics for every pilot first (`/api/stats/characterID/`), then each pilot's newest 200
  killmails, highest quick score first, then older pages only until 30 days are covered (at most 3 pages; a stored
  cursor stops at known killmails), and for dangerous pilots with few losses one page of losses for fit evidence
  (cyno, cloak, tackle). Data is fresh for an hour, so rescans are nearly instant. Killmails are kept as a compact
  per-pilot digest (`intel_pilot_killmails`), not in the killboard tables. A `403` from zKillboard stops the run;
  other errors back off per pilot. In demo mode a deterministic generator replaces zKillboard.
- **Scoring** (`score/`, pure functions): every event is weighted by recency (half-life 14 days); the digest covers
  the newest killmails exactly and zKillboard's monthly statistics the time before, so nothing counts twice. Eight
  dimensions (activity, lethality, style, specialties, nearby, history with us, active now, character), each 0–100
  with a reason (stored as data, written out in the reader's language by `text.ts`), average into a composite that a **recency gate** damps for pilots who are not active now, so
  lifetime fame alone never ranks high. Tags (cyno, hunter, tackle, capital, gate camper, ganker, …) come from hull
  and module groups (`hulls.ts`, checked against ESI) and loss fits; evidence older than 30 days is marked historic.
- **Claude** (`ai/`) only reads computed facts — each pilot's latest killmails first, lifetime numbers last — and
  writes the narrative via structured outputs: a briefing per scan (automatically once the top pilots are read;
  `intel.ai` permission of the creator, at least three non-friendly pilots), dossiers and d-scan reads on request.
  D-scan reads may only name pilots the deterministic matcher proposed. Output is sanitised and rendered through
  the killboard's safe markup. Without a key, without permission, over the hourly budget (20 per user, 120 per
  instance; every call counts, failed ones too, and is reserved in a locked transaction before it is made) or on
  failure, templates write the same notes. Notes are stored with their facts in `intel_ai_notes` and
  reused for unchanged facts in the same language. Facts are always English; Claude writes in the language of
  whoever asked (the scan creator's for automatic briefings, `intel_scans.locale`). Template notes are stored as
  drafts (keys, numbers, names) and written out in each reader's language.
- The **current system** field suggests systems as you type from `eve_systems`, which `core.universe-systems` fills
  with every known-space and wormhole system and its constellation and region (`/api/universe/systems`, filtered in
  the browser). Wormholes show their class, read from the region name (A-R… is C1, G-R00031 Thera, K-R00033 Drifter). Any typed name
  still works: it resolves on submit, through ESI if it is not cached yet.
- The **recently seen hostiles** feed lists pilots from anyone's scans in the last 7 days, without friendlies.

## Security notes

- Refresh/access tokens are encrypted with AES-256-GCM using keys derived from `APP_SECRET` via HKDF (separate keys
  for tokens and OAuth state).
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `APP_URL` is https.
- Every server action re-checks permissions; members' queries are scoped to their own character IDs in SQL.
- CSV export neutralises spreadsheet formulas; security headers are set in `next.config.ts` and Caddy.
- Administrative actions are written to the audit log (`src/core/audit.ts`). Role and access changes, settings and
  scope switches use `auditInTx` inside the change's own transaction, so the change and its entry commit or roll
  back together. Everything else uses `audit`, which never throws: a failed write is logged and counted, and System
  Info's "Audit log written" check warns about it.

## Appraisal

- `src/modules/trade/appraisal/parse.ts` turns a paste into candidate (name, quantity) pairs per line: tab
  separated inventory/contract/survey copies (English or German numbers), d-scan, EFT, killmail lines and free text
  ("x 10", "10x", "10 Name", "Name 10"). Ambiguous lines yield several candidates in order of preference. A quantity
  above `MAX_QUANTITY` (10¹²) is not read as a quantity.
- Names resolve against `eve_types`, then ESI `POST /universe/ids` (case-insensitive exact matches); new types are
  stored through the resolver. Prices are the Jita 4-4 `type_values`; types without a value, or older than two
  hours, are priced live with the same code as the hourly price job, which then keeps them fresh for 14 days after
  the last appraisal that asked for them. An appraisal is refused if any of them can't be priced.
- An appraisal is a snapshot (items, unit prices, totals, unrecognised lines, input) in `appraisals`, opened by an
  unguessable id. "Appraise again" creates a new snapshot at current prices. A user can start
  `APPRAISAL_RATE_LIMIT` appraisals per ten minutes (counted in `appraisal_attempts`, so failed, empty and deleted
  ones count too); `trade.housekeeping` deletes them after
  `APPRAISAL_RETENTION_DAYS` (a year), and their share links stop working.
