# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, releases with new features bump the minor version (0.1.5 → 0.2.0) and releases with only fixes bump the patch
version (0.2.0 → 0.2.1). Releasing is described in [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Fixed

- The mining CSV export no longer turns negative security status (`-0.45`) into text, so null-sec and wormhole rows
  stay numeric in spreadsheets. Names starting with `=`, `+`, `-` or `@` are still neutralised.

## [0.6.0] - 2026-10-03

### Changed

- Each section has its own colour: Industry amber, Combat crimson, Trade teal (Overview, Account and Administration
  keep the cyan accent). It shows in the page heading label, the sidebar marker and a faint glow at the top of the page.

## [0.5.0] - 2026-10-03

**When updating:** corporation wallets need two corporation scopes, EVE Mail one optional character scope.

1. Add `esi-wallet.read_corporation_wallets.v1`, `esi-corporations.read_divisions.v1` and `esi-mail.read_mail.v1` to
   the scopes of your EVE application at <https://developers.eveonline.com/applications>. Nobody is asked for the mail
   scope unless they enable mail on the EVE Mail page, but without it on the application that EVE login fails with
   `invalid_scope`.
2. Update as usual; the database migrations run on start.
3. A member with the in-game Accountant or Junior Accountant role re-links their character with corporation access
   (My Characters → Link with corporation access); a Director also brings the division names. ESI only keeps about
   30 days of wallet history, so the archive starts there.

### Added

- **Corporation wallets** (Finances → Corporation wallet / Wallet journal, default Director and up):
  - Balance, income, expenses and net for all wallet divisions, per day, week or month, with a chart and a per-division
    table. ISK moved between the corporation's own divisions is shown separately, not as income or expense.
  - Wallet journal with category, counterparties and reason; filters by division, category and income, expenses or
    transfers.
  - Long-term archive: the worker imports new journal entries, market transactions and daily balances every hour and
    never deletes them, so history grows beyond the ~30 days ESI keeps. Periods it could not import (no token with the
    Accountant role for over a month) are shown as gaps.
- **EVE Mail** (new Social section, German "EVE-Mail"): read your characters' EVE mail in Keystar, in English and
  German. It is read-only: Keystar never sends, deletes or marks mail as read in game.
  - Opt-in per character from the mail page (`esi-mail.read_mail.v1`). Only you can read your mail; no role, admins
    included, can read another account's mail. Mail is deleted when you remove or transfer the character, and can be
    deleted once mail access is off.
  - Inbox, Sent, Corporation, Alliance, mailing lists and your own labels (in their EVE colours), with unread counts,
    search by subject or sender, and all characters at once or one at a time. A corp mail received by several of your
    alts is listed once.
  - Mail bodies render the way the EVE client shows them: fonts, sizes and colours, links to characters,
    corporations, alliances and systems (with portraits and logos, opening zKillboard), item types (everef.net), kill
    reports, fittings (with a copy button for the DNA) and web links. Client-only links are labelled. Malformed
    markup can't break the page or inject anything.
  - New mail, read state and in-game deletions sync every five minutes. The first import brings in the newest
    1,000 mails.

### Changed

- The situation report on the killboard starts collapsed; click its header to read it.

## [0.4.0] - 2026-10-03

**When updating:** wallet import in the mining P&L needs one optional character scope.

1. Add `esi-wallet.read_character_wallet.v1` to the scopes of your EVE application at
   <https://developers.eveonline.com/applications>. Nobody is asked for it unless they enable wallet import in the
   mining P&L, but without it on the application that EVE login fails with `invalid_scope`.
2. Update as usual; the database migrations run on start. Nobody needs to re-authorise.

### Added

- **Mining P&L** (Industry → Mining P&L, German "Mining-GuV"): a personal income/expense sheet for pilots mining
  with alts, visible only to the account itself, in English and German.
  - Income: ore mined by your characters, valued like the mining dashboard, with an optional buyback % and per-ore
    price rules (with date ranges); realised prices from your wallet sells can be applied with one click.
  - Expenses: opt-in wallet import per character. Purchases of mining crystals, Heavy Water, Mining Foreman burst
    charges, mining drones and mining hulls/fittings are auto-tagged and only suggested until you include them;
    "count tagged purchases automatically" can be switched on per character (off by default). Other purchases stay
    out unless you tag them. Manual costs (PLEX/Omega, contracts …) can be spread over up to a year.
  - Net profit per day / week / month, ISK per hour (gross and net), cost per m³, and splits per character and per
    activity (ore / moon / ice / gas).
- **Mining activity tracking**: the personal ledger sync now records when each character's ledger grows, which gives
  active hours (wall-clock across alts and per character) from now on.
- **Optional ESI scopes**: modules can declare scopes that users enable per character instead of every member being
  asked for them. The first is wallet read access.

### Changed

- "Re-authorise" on My Characters keeps the character's corporation and optional scopes instead of requesting only
  the member scopes. When another EVE login drops an opt-in scope anyway, My Characters says so and offers to turn
  it back on.
- The personal mining ledger sync no longer re-applies a snapshot from Keystar's own cache or an older snapshot.
- Trades between your own characters are left out of the P&L (neither a cost nor a sale).

### Fixed

- Gas types seen for the first time are linked to their compressed variants again; 0.3.0 only did that for ore and
  ice. Valuation falls back to the compressed price when raw gas has none, and the mining P&L recognises sales of
  compressed gas.

## [0.3.0] - 2026-10-03

**When updating:** Threat intel reads blues and reds from the corporation's and alliance's contacts, which needs two
corporation scopes.

1. Add `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` to the scopes of your EVE
   application at <https://developers.eveonline.com/applications>.
2. Update as usual; the database migrations run on start.
3. One member of the corporation re-authorises a character under My Characters. Without the scopes, only your own
   corporation and alliance count as friendly.
4. Optional: `INTEL_MODEL` picks the Claude model for intel briefings, dossiers and d-scan reads (default
   `claude-sonnet-5-5`); Claude is only used when `ANTHROPIC_API_KEY` is set.

### Added

- **Threat intel** (Combat → Threat Intel): paste local, a fleet composition, chat lines or names, optionally with a
  d-scan, and get:
  - corporations, standings and **history with us** at once: kills on us, losses to us, the hulls they flew against
    us, and the fights from our killboard with what they brought, who else was there and how it went;
  - a **threat score** per pilot from zKillboard, filled in live: statistics for everyone first, then each pilot's
    newest killmails (most dangerous first). Scores are weighted toward recent activity, explained in eight
    dimensions and damped for pilots who are not active now; tags such as cyno (from loss fits), hunter, tackle,
    capital, gate camper and ganker; the latest kills and losses and "last seen flying …" for every pilot;
  - a group view (tiers, likely composition, roles, pilots who fly together), d-scan matching, a pilot page
    (latest kills, ships, activity heatmap, fights with us, wingmen, corporation history);
  - a **briefing** per scan, pilot **dossiers** and **d-scan reads** written by Claude when `ANTHROPIC_API_KEY` is
    set (model `INTEL_MODEL`, default `claude-sonnet-5-5`; capped at 20 calls per user and 120 per instance an
    hour), otherwise from templates;
  - shareable scan links and a corp-wide **recently seen hostiles** feed;
  - in English and German: scores, tags and template notes follow the reader's language, and Claude writes in the
    language of whoever asks for a note (the scan's creator for automatic briefings).
- New permissions **Use threat intel**, **Use Claude for intel** (both members by default) and **Manage threat
  intel** (directors).

### Fixed

- The ESI client no longer pauses for a second after responses without error-limit headers.
- A sync job triggered while it is running now runs again right after instead of waiting for its next interval.
- Looking up ship or module types no longer fetches every type of their group (only ores, ice and gas need that).

## [0.2.0] - 2026-10-03

**When updating:** Live fleet needs the new character scope `esi-fleets.read_fleet.v1`.

1. Add `esi-fleets.read_fleet.v1` to the scopes of your EVE application at
   <https://developers.eveonline.com/applications>.
2. Update as usual (`KEYSTAR_VERSION=0.2.0`, `docker compose pull`, `docker compose up -d`); the database
   migrations run on start.
3. Members who run fleets re-authorise their characters under My Characters, which shows the missing scope.

### Added

- **Live fleet** (Combat → Live fleet): a fleet boss clicks "Track fleet" on one of their characters and the worker
  reads the fleet from ESI every 15 seconds. The page shows members by wing and squad with ship, system and role,
  the composition by ship class and hull, who joined and left, and a list of past fleets with their participants.
  Only the tracked character is polled, because ESI shows members and wings only to the fleet boss. Tracking
  stops on its own when the character leaves the fleet. Texts are in English and German, and the demo data
  includes a live and two past fleets.
- New character scope `esi-fleets.read_fleet.v1`: enable it on the EVE application, then members re-authorise
  under My Characters to share fleets.

## [0.1.5] - 2026-10-03

### Changed

- Cards that looked clickable now are, or are gone. On the dashboard, the KPI tiles open the page behind the
  number: the killboard tiles open the killboard on the same 30 days (ISK destroyed jumps to the ISK breakdown, ISK
  efficiency to pilot efficiency), and the mining tile opens Mining. The info row links to the corporation on
  zKillboard, Member Audit, My Characters and Sync Status. Links only appear for viewers who can open the target
  page, and a hover state plus an arrow marks them.
- Users & Roles: the role cards filter the user table (`?role=director`; click again to show everyone). Character
  names open zKillboard. An ESI health warning links to where it can be fixed: My Characters for your own account,
  Member Audit for others. Admins get a "Role permissions" shortcut to the permission matrix in Settings. The
  Actions column is hidden when there is no account you can manage, and otherwise shows "—" with an explanation
  where nothing can be done.
- The corporation name in the top bar links back to the dashboard.
- The new texts (filter line, tooltips, "Role permissions") are available in English and German.

### Removed

- The corporation card on the dashboard, which repeated the kills, losses and efficiency shown in the tiles below
  it. The corporation logo and ticker moved into the "Home corporation" item, and the active pilot count into the
  kills tile.
- The up/down "switcher" icon next to the corporation name in the top bar. Keystar has one home corporation, so
  there was nothing to switch.

## [0.1.4] - 2026-10-03

### Fixed

- German: changes in killboard tables and the top-systems lists (e.g. "+1.234") now use German digit grouping.
- The ore field estimator's example placeholder uses the number format of the EVE client in the chosen language.

## [0.1.3] - 2026-10-02

### Added

- **German interface.** Keystar now speaks English and German. The language follows the browser's preferred
  language on the first visit (anything other than German gets English) and can be changed with the language
  switch in the sidebar footer, next to your pilot, or at the bottom of the sign-in, registration and setup pages.
  The choice is remembered in a cookie.
- Numbers and dates follow the chosen language: in German, "9,87 Mio. ISK", "1.234.567", "12,3 %", "vor 5 Minuten",
  "02. Okt.". EVE times stay in `YYYY-MM-DD HH:mm ET`.

### Changed

- Module manifests and sync jobs name their texts with dictionary selectors instead of English strings (see
  docs/modules.md). Item, system and pilot names, CSV exports and stored situation reports remain in English.

## [0.1.2] - 2026-10-02

### Changed

- Larger small text across the app for readability at 100% zoom on large monitors: section titles (e.g. "Top
  pilots") go from 11px to 13px, field labels and table headers from 9–11px to 12px, badges and chips to 11px, and
  subtitles and hints from 12px to 13px. The sizes are now a shared scale (`text-3xs`, `text-2xs`, `text-xs`)
  defined in `globals.css` instead of one-off values.
- KPI tiles keep their values aligned across a row when a hint wraps onto a second line.

## [0.1.1] - 2026-10-02

### Added

- **Killboard** (Combat → Killboard): the home corporation's kills and losses from zKillboard, with week-over-week
  KPIs, a weekly situation report (written by Claude with an optional `ANTHROPIC_API_KEY`, otherwise from a
  template), top pilots with the period's MVP and awards, pilot efficiency, top systems, ISK breakdown, recent
  activity and ship statistics.
- **Appraisal** (Trade → Appraisal): paste cargo, inventory, contracts, EFT fittings, d-scans, killmails or item
  lists and get Jita 4-4 buy/sell/split values, volume and a percentage price, saved as a shareable link.
- **Releases**: tagged versions with Docker images on `ghcr.io/theragus/keystar`; `docker compose pull` updates
  without building on the server. The version is shown in the sidebar and in `/api/health`.

### Changed

- The dashboard leads with combat: kills, ISK destroyed and efficiency for 30 days, a kills-over-time chart, the
  latest kills and losses and the MVP. Mining is down to one tile.
- The corporation card shows active pilots (on a killmail in the last 30 days) and the member count instead of
  "pilots in game".

### Fixed

- Native dropdowns (e.g. Settings → Permissions) showed light text on a white list in Edge and Chrome on Windows.
- The killboard now imports right after the home corporation is set or changed instead of up to an hour later.

## [0.1.0] - 2026-10-02

First version (not published as an image): EVE SSO login, ESI token management, Keystar roles and permissions, the
background sync worker, the mining module with moon observers and the ore field estimator, the first-start
walkthrough and the Docker Compose deployment.
