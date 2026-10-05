# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, releases with new features bump the minor version (0.1.5 → 0.2.0) and releases with only fixes bump the patch
version (0.2.0 → 0.2.1). Releasing is described in [docs/releasing.md](docs/releasing.md).

## [Unreleased]

- **Route light particles.** Animate a glowing core with separate fading sparks and a departure pulse between route systems, while keeping the route guide faint. Respect reduced-motion settings.

- **Map planning beside the map.** Stack Travel Check and Jump Range to the left on desktop, with a single-column layout on smaller screens. Enter selects the best matching system in map and planning searches, prioritizing exact names, then prefixes and substring matches.

- **Azure hosting and automated checks.** Check every pull request and branch push for code quality, tests and container builds. Deploy main to production and other branches to separate staging URLs, with one active preview at a time, using password-free Azure authentication.

### Added

- Link Threat Intel systems to a centered map with automatic jump-range highlighting and LY distances from the chosen origin.

- Add shortest stargate route planning with two-hour gate-kill evidence and linked killmails, plus carrier, jump freighter and Black Ops range highlighting with Jump Drive Calibration selection.

- Add a searchable, interactive 3D EVE universe map under Combat, with real system positions and security status.

- **Sortable ore breakdown.** Click any column header of the mining dashboard's ore breakdown to sort by it; click
  again to reverse the order.
- **Grouped ore types.** The ore breakdown combines the grades and variants of each ore (Scordite, Scordite
  II-Grade, Scordite III-Grade; Blue Ice and Thick Blue Ice; Zeolites and Glistening Zeolites) into one row, with
  the unit price averaged by units. Clicking a grouped row filters the dashboard to all of its types. "Group ore
  types" in the panel header switches back to one row per type.
- **Survey scanner groups ice and anomaly ore variants.** The field estimator now counts Thick Blue Ice, Pristine
  White Glaze, Hadal Talassonite and similar variants under their base ore.
- **Mail alerts.** New EVE mail for your characters now shows a notification in Keystar, like kills and
  losses. It shows the subject, sender and receiving character (with the corporation, alliance or mailing list it
  went to), and clicking it opens the mail. It needs mail access for the character and checks every 30 seconds.
  Mail usually reaches Keystar within five minutes of arriving in game.
- **Desktop notifications.** Kill, loss and mail alerts can also appear as system notifications (Windows notification
  center, macOS Notification Center) while Keystar is open but not in focus, for example in a background tab or
  behind the EVE client. Clicking one opens the killmail on zKillboard or the mail in Keystar. While a Keystar tab is
  in focus, alerts stay in-page toasts. This needs the browser's permission and an HTTPS address.

### Changed

- Add mouse panning (right-, middle-, or Shift-drag), a continuously looping light beam along selected travel routes, and a star-map navigation icon; retain reduced-motion support.

- Align the universe map with Threat Intel’s glass panels and compact controls; batch canvas rendering and cache geometry and labels for smoother rotation. Remove the system sidebar, center searched systems with a fading rotation, and keep wheel zoom from scrolling the page.

- Keep browser-fetched zKillboard counters in a private, temporary preview only. Remove browser uploads to the shared pilot cache; the worker verifies statistics before shared profiles and danger scores use them.

- Remove the retired rescan action, button, translations and scan-parent metadata; users create a new Local snapshot with New scan.

- Widen the Local Situation engagement report and compact ship rows to ship and pilot names inline; remove hull counts and loss labels while retaining red loss backgrounds.

- Add bottom page indicators to the Local Situation engagement report to slide between recorded fights, newest first. Engagement legends, paging and notes stay at the bottom of the card.

- Engagement ship rows support alliance/corporation highlighting and per-side legends, initially selecting the affiliation with the most recorded pilots on each side.

- Reorganize Threat Intel Local Situation around wrapping pilot affiliation tags, last combat evidence, recent observed co-attacks, and the latest engagement with us. Pilot and legend selection highlights matching alliance members, falling back to corporation membership.
- Show both sides of the latest engagement with observed ships, loss counts and ISK lost; highlight destroyed hulls in red and identify incomplete evidence. Give the engagement column more width than the observed-group column and show recorded pilot names inline beside each hull.
- Use compact equal-height pilot cards, direct character/corporation/alliance killboard links, and the three latest kills and losses as ship tags with detailed tooltips.
- Calculate danger from combat capability and local relevance, with confidence and escalation evidence kept separate. Show explanatory 0–10 badges (green below 5, orange from 5 to below 8, red from 8); no recent sample is unknown.
- Move D-scan input and matching results into a header dropdown and generate optional written briefings from the blue Briefing button in a dialog.
- Replace loading prose with evidence overlays and independent loading indicators for each pending pilot tag/card.
- Fetch pending statistics from the scan creator’s browser at 100 ms intervals with at most four concurrent requests for private provisional previews and rate-limit backoff. Only server-verified results enter the shared cache and danger scores. Server zKillboard calls are spaced by 200 ms; statistics requests avoid a redirect.
- **Account-based Codex reviews.** Remove the inherited Claude review workflow and document automatic GitHub reviews using the owner Codex account, without CI API credentials.


- **Revoking optional access stays in Keystar.** "Revoke access" on the Live fleet page, "Stop wallet import" and
  "Stop" for EVE mail now switch the access off right away instead of opening the EVE login. Turning it back on works
  the same way while the character's EVE token still includes it. My Characters notes which access is only switched
  off in Keystar; re-authorising the character there removes it from the token for good.
- **Feedback for account and access actions.** A toast now confirms or explains the outcome when you link a
  character, re-authorise one, grant corporation access, enable or switch off optional access, make a character your
  main, queue its syncs or remove it, start or stop sharing a fleet, delete imported mail or wallet history, approve,
  disable or re-enable a user, and run or pause syncs. If linking a character fails while you're signed in, you now
  return to the page you came from with the reason instead of landing on the dashboard without one.
- **Re-authorising checks the character.** Re-authorise buttons, and enabling fleet access, wallet import or mail,
  now only accept the character they are for. Picking another character on the EVE login used to give that
  character the wrong set of permissions, which could drop its corporation access and stop the corporation sync
  jobs. Now nothing is changed, and a message says which character to pick.
- **Alerts menu.** The kill alert button in the top bar is now an "Alerts" menu with switches for kills and losses,
  EVE mail and desktop notifications. Each choice is saved per browser; an earlier "kill alerts off" choice is kept.
- Keep sidebar icons and section-heading prefixes fixed while labels expand to the right. Show three-character collapsed headings, remove fade flicker, use a 300 ms width animation, disable collapsed navigation scrolling, and move branding to the top bar with the toggle in the sidebar.

- **"Combat Report" instead of "Killboard".** In English, the sidebar entry, the killboard page heading and the
  dashboard's killboard button now read "Combat Report".
- **"Corp wallet journal" instead of "Wallet journal".** The sidebar entry, the journal page heading and the button
  on the corporation wallet page now make clear that the journal covers the corporation's wallets, not your own.
- **"Moon drills" instead of "Moon Observers" and "Refineries".** The mining menu entry and the ledger source option
  now use the same name, so it is clear they show the same corporation moon-mining data. The mining overview and
  ledger only show the Combined / Member ledgers / Moon drills choice when the corporation has moon drills on record,
  since without them all three show the same entries.

### Fixed

- Page content no longer shifts a few pixels sideways between pages that scroll and pages that don't (with
  scrollbars that take up space, such as macOS "Show scroll bars: Always" or Windows).

## [0.10.0] - 2026-10-03

### Added

- **"Today" and "Yesterday" date ranges.** The date-range picker on the mining, P&L, finances and killboard pages
  offers single-day presets for the current and the previous EVE day, above "7 days".

### Changed


- **Main character listed first.** The Characters page, the dashboard's character panel, fleet tracking, the mail
  character list and the P&L wallet status show your main character at the top, followed by the others
  alphabetically.
- **Dates in your language's format.** Dates read "02 Oct 2026" in English and "02.10.2026" in German instead of
  2026-10-02: in the mining ledger's day headers, the daily mining and kill tables, timestamps (journal, audit log,
  mail, fleets, reports), and the killboard, wallet archive, mail and pilot history notes. Times are still EVE time
  (ET).

## [0.9.0] - 2026-10-03

### Added

- **Mining ledger grouped by day.** Ledger entries sit under a header for each day showing its date, weekday,
  entry and character counts, and the day's units, volume and value. The totals cover the whole day even when its
  entries run onto the next page; the header then says how many of them the current page shows. Days start
  expanded; click one to collapse it, or use "Collapse all" for a day-by-day summary of the page.
- **Live kill notifications.** When a corporation member gets a kill or loses a ship, a notification appears in the
  top-right corner, usually 10–30 seconds after zKillboard posts it, for everyone who can view the killboard. It
  shows the destroyed ship (the one you lost, or the one you killed) with your pilot's portrait, the victim, who
  landed the final blow (on kills your pilot, or your top-damage pilot when someone else landed it), the system with
  its security and region, and the ISK value. It stays for 30 seconds with a countdown bar (paused while you hover
  it) and opens the killmail on zKillboard when clicked; with several tabs open, only one of them shows it. A bell in
  the top bar mutes them for your browser. The worker reads zKillboard's R2Z2 live feed every 10 seconds (not in demo
  mode), so these killmails also reach the killboard right away instead of with the hourly sync.
- **Light mode.** Switch between light and dark beside the language selector in the sidebar or on sign-in, join,
  and setup pages. The preference is remembered for a year and applied before rendering, with matching glass
  surfaces, readable status colours, controls, tables, chart chrome, and keyboard focus. Charts get their own
  colour-vision-checked series and rarity/threat colours for the light surface, and EVE mail colours that would be too
  pale on it are darkened. Dark remains the default.
- **Collapsible sidebar.** The menu button at the left of the top bar shrinks the sidebar to a narrow icon rail
  and back with a short slide and fade (instant when reduced motion is requested). On the rail, hovering or focusing
  an icon opens its section as a menu beside it, and hovering the portrait shows the pilot's name, role and corp.
  The choice is remembered for a year and applied before rendering.
- **Notifications for your own actions.** Short toasts confirm actions, in the same stack and style as the live
  kill notifications, closing after six seconds unless hovered or focused. Changing a user's role now
  confirms the new role and offers Undo, and a refused change says why. Saving Settings confirms the save, or
  says why it was refused and keeps what you entered.

### Changed


- **Dropdowns match the theme.** In Chrome, Edge and Safari 27+, the open list of every dropdown is a glass panel
  in the current theme with an accent check mark, instead of the system's list. Other browsers keep their native
  list. On Users & Roles the save button only appears once a different role is picked.
- **Sync status is grouped by who a job syncs for.** Corporation jobs, character jobs and app-wide system jobs now
  sit in their own sections. Character jobs collapse to one row per character (portrait, account, job count, worst
  status, next run) and open automatically when one of them fails. Long results such as a character's in-game roles
  are clipped to two lines, with the full text on hover.
- **Releasing an older version line no longer moves `:latest` back.** The Release workflow now tags an image
  `:latest` (and marks the GitHub release *Latest*) only when its version is newer than every earlier release, and
  moves `:<major.minor>` only to the newest patch of that line.
- **Threat Intel puts evidence first.** A compact Local Situation summary, early D-scan input, timestamped
  local co-attacker observations, and always-visible latest kill, loss and cyno-history fields replace the dense
  briefing-led layout. Historical ship profiles and optional score details are clearly separated from scanner
  observations; missing data and incomplete fitting history stay explicit. Latest records retain five kills and
  five losses, and loss chips now name the lost hull rather than the final-blow attacker’s hull.

### Fixed

- **Mining class filter lists only mined classes.** Like the ore, system and member pickers, the class picker now
  offers only ore classes that appear in the ledgers you can see, instead of every class.
- Extend the sidebar surface to the bottom of long pages while keeping navigation and footer controls in the viewport.
- Preserve the original dark-mode table separators and scrollbar colours when adding light mode.
- Search boxes with an icon (filter pickers, page searches, mail search, field estimator inputs) draw the focus
  ring around the whole rounded box instead of a square outline around the text area inside it.
- After a role change on Users & Roles, the dropdown no longer jumps back to the old role. After saving
  Settings, the valuation and permission dropdowns no longer show the old values.

## [0.8.0] - 2026-10-03

### Added

- **Threat Intel system picker.** The current-system field suggests systems as you type, every known-space and
  wormhole system with its region and its security status (wormholes show their class, C1–C6, C13, Thera or Drifter).
  A new background job loads the system list from ESI once (about 20 minutes on a new install) and checks for new
  systems every 30 days.
- **My characters view on the mining pages.** Viewers with corporation-wide mining access can switch the overview,
  the ledger and the CSV export between **Corporation** and **My characters**. The latter shows all of their linked
  characters, so alts in another corporation show up next to their main without counting towards the home
  corporation's totals.

### Changed


- **Fleet access is opt-in per character.** Members are no longer asked for `esi-fleets.read_fleet.v1` when they join
  or link a character: only the fleet boss's character can read a fleet's members, so pilots who run fleets turn it on
  for that character with "Enable fleet access" on the Live fleet page (and can revoke it there). Characters that already
  granted the scope keep it.
- **Member audit** lists registered characters first, and sorts names without regard to upper and lower case.

### Fixed

- The optional-scope badges on My Characters all linked to the mining P&L settings; the mail badge now opens EVE Mail
  and the fleet badge the Live fleet page.

## [0.7.0] - 2026-10-03

### Changed


- **Member audit** handles large corporations: search by character, account (main) or character ID as you type, click a
  stat tile (In-game roster, Registered, Not registered, Missing or revoked ESI) to show only those characters, and page
  through 50 at a time. Searching, filtering and paging happen in the database, and the state is in the URL, so a
  filtered view can be bookmarked or shared.
- The unregistered-members count on Mining Overview and the token warnings on Users & Roles now open the member audit
  already filtered to the characters concerned.

### Fixed

- Sign-in could redirect to another site when `returnTo` contained a tab, line feed or carriage return (for example
  `/%09/evil.example`). The return path is now resolved like the browser would and rejected unless it stays on Keystar.
  ([#14](https://github.com/Theragus/Keystar/issues/14))
- The mining CSV export no longer turns negative security status (`-0.45`) into text, so null-sec and wormhole rows
  stay numeric in spreadsheets. Names starting with `=`, `+`, `-` or `@` are still neutralised.
  ([#18](https://github.com/Theragus/Keystar/issues/18))
- Two admins demoting or disabling each other at the same moment could both succeed and leave Keystar without an
  admin, after which the next pilot to sign in became admin. Role and access changes now re-check both users at the
  moment of the change, one at a time, and only the very first account ever is made admin automatically.
  ([#16](https://github.com/Theragus/Keystar/issues/16))
- When EVE's ESI is down or rate limiting, the appraisal no longer saves real items as unrecognised lines or with
  missing or stale prices: it shows "ESI unavailable, try again" and saves nothing. The ore field estimator says
  which ores couldn't be priced and tries them again, and both log the ESI error so admins can tell an outage from bad
  input. ([#17](https://github.com/Theragus/Keystar/issues/17))
- Name lookups no longer multiply ESI requests during an outage. Keystar splits a batch only when ESI rejects it for
  an invalid id; a server error, timeout or rate limit now fails the job, so the scheduler backs off instead of
  sending about two failing requests per id and reporting success. ([#19](https://github.com/Theragus/Keystar/issues/19))
- The hourly market price job no longer throws away a whole run, including the ore values the mining dashboard uses,
  when a single item can't be priced. Items that fail keep their previous values and are counted in the job summary.
  The job now prices only ores in the mining ledgers and items appraised or valued in the field estimator in the last
  14 days, rather than every item ever appraised. When a background job fails part-way, its remaining ESI requests
  stop instead of running on into the retry. ([#15](https://github.com/Theragus/Keystar/issues/15))
- The ESI client no longer pauses a whole rate-limit group for 15 seconds after a response that names the group but
  doesn't report its remaining tokens.

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
