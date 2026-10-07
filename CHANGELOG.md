# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, releases with new features bump the minor version (0.1.5 → 0.2.0) and releases with only fixes bump the patch
version (0.2.0 → 0.2.1). Releasing is described in [docs/releasing.md](docs/releasing.md).

## [Unreleased]

## [0.18.0] - 2026-10-07

### Added

- **Route-gate kill counts and smartbomb evidence.** Show the number of recorded kills at route gates and a bomb icon only for capsule killmails with recorded smartbomb damage. Resolve weapon groups through the shared background cache.
- **2D/3D map views.** Switch projection from the Universe header while retaining route particles, gate-kill pulses, Skyhook highlights and focus animations. In 2D, drag to pan and right-drag to rotate; jump reach remains based on real 3D distances. Dim non-route systems and labels while Travel Check is active.
- **Skyhook map filter.** Highlight systems with public current or upcoming raiding windows, with a scrollable system/planet list, opening and closing times, and explicit stale or unavailable data. Cache ESI windows and planet names in the worker.

### Changed

- **Map panel balance.** Expand Travel Check so it and Jump Range align with Universe, keep results scrollable, and increase route-line opacity to 45%.

- **Gate-kill waypoint pulse.** Add a red spherical pulse to route waypoints with recorded gate kills and shorten the result labels and killmail links, omitting IDs and abbreviating relative times. Reduced-motion mode shows a static halo. ([PR #20](https://github.com/larsduewel/Keystar/pull/20))
- **Route security status.** Show each system’s security status beside its name in Travel Check results. ([PR #19](https://github.com/larsduewel/Keystar/pull/19))

- **Gate attacker list.** Show each recorded attacker on a separate ship-and-character row and remove the Focus route button. ([PR #18](https://github.com/larsduewel/Keystar/pull/18))

## [0.17.0] - 2026-10-07

### Added

- **Route overview and attacker composition.** Frame the entire travel route and orbit it slowly. Show deduplicated attacker ship counts and character names from recent route-gate killmails, with explicit unknown ships and current-fleet uncertainty. Resolve missing character and ship names in a durable background queue without delaying gate evidence. ([PR #17](https://github.com/larsduewel/Keystar/pull/17))

## [0.16.0] - 2026-10-06

### Added

- **Map regions.** Add CCP region names and system membership, region highlighting and focus, zoom-aware labels and selected-system region/security context. ([PR #16](https://github.com/larsduewel/Keystar/pull/16))

### Changed

- **Compact map planning.** Widen Travel Check and Jump Range by 24 pixels and shorten their evidence notes in English and German. ([PR #16](https://github.com/larsduewel/Keystar/pull/16))

- **Jump Range controls.** Move Ship Class below Origin System and give its dropdown the full panel width. ([PR #15](https://github.com/larsduewel/Keystar/pull/15))

- **Upstream review fixes.** Sync PR #87 while preserving the fork’s map controls, jump classes and Azure deployment. ([PR #14](https://github.com/larsduewel/Keystar/pull/14))

## [0.15.0] - 2026-10-05

### Changed
- **Jump Range ship classes.** Expand ship classes to cover command carriers, supercapitals, force auxiliaries, lancer dreadnoughts and Rorquals. ([PR #13](https://github.com/larsduewel/Keystar/pull/13))
- **Travel Check system inputs.** Use the Threat Intel system picker, including keyboard selection, region names and security status. ([PR #13](https://github.com/larsduewel/Keystar/pull/13))

## [0.14.0] - 2026-10-05

### Upgrade notes

Industry jobs need two optional character scopes.

1. Add `esi-industry.read_character_jobs.v1` and `esi-universe.read_structures.v1` to the scopes of your EVE
   application at <https://developers.eveonline.com/applications>. Nobody is asked for them unless they enable
   industry access, but without them that EVE login fails with `invalid_scope`.
2. Update as usual; the database migrations run on start.

### Fork updates

- **Route light particles.** Animate a glowing core with separate fading sparks and a departure pulse between route systems, while keeping the route guide faint. Respect reduced-motion settings. ([PR #11](https://github.com/larsduewel/Keystar/pull/11))
- **Map planning beside the map.** Stack Travel Check and Jump Range to the left on desktop. Enter selects the best matching system, including special-space systems. Keep search suggestions above adjacent panels and cap long results lists with viewport-based scrolling. Show jump ranges beside ship names in the dropdown, updating with calibration level, instead of a separate Range field. ([PR #11](https://github.com/larsduewel/Keystar/pull/11))

- **Upstream sync.** Import upstream main through 492118b (including releases 0.11.0–0.13.0), preserving the fork map, Azure deployments and account-based Codex review setup. Generate a combined schema update after the migrations already deployed in this fork.
- **Map and travel planning.** Keep the interactive 3D universe map, Threat Intel system links, jump ranges and gate-kill evidence route checks.
- **Azure hosting and automated checks.** Keep protected main, branch previews, quality checks and production deployment using federated Azure authentication.
- **Account-based Codex reviews.** Keep automatic GitHub reviews through the owner account without CI API credentials.

### Fixed

- **Map and Intel review fixes.** Cache map route lookups; let scan viewers read saved briefings without regenerating them, keep rewriting permission-gated, restore a pilot profile shortcut and align briefing severity with the three-tier danger model. ([PR #87](https://github.com/Theragus/Keystar/pull/87))

- A token refresh keeps the new refresh token EVE SSO hands out even if checking the new access token then fails
  (for example when CCP's key endpoint is unreachable), so pilots are no longer asked to re-authorise for nothing.
  Refreshes no longer hold the token row locked while waiting on CCP, so switching scopes or logging in doesn't stall
  behind them, and a malformed SSO response no longer leaves a token that can't be refreshed.
  ([#141](https://github.com/Theragus/Keystar/issues/141))
- Disabling an account now pauses its characters' background syncs (wallet, mail, industry, skills) and token
  refreshes until it is enabled again, and corporation syncs no longer use its characters. Unlinking a character also deletes its imported wallet and mail data in the
  same step as the link, so an interrupted unlink can't leave it behind to reappear when the character is linked
  again. ([#151](https://github.com/Theragus/Keystar/issues/151))
- The corporation roster and industry jobs are stored again after a failed sync, or after a character was
  unlinked and linked again, instead of waiting until ESI's data changes. Unlinking or transferring a character, and
  deleting its industry data, also removes the ESI responses Keystar had cached for it, and cached responses
  without an expiry are cleaned up after a week. ([#139](https://github.com/Theragus/Keystar/issues/139))
- In English, the killboard's permissions in Users & Roles, its background jobs and its browser tab title now
  say "Combat Report" like the sidebar, instead of "Killboard".
- Wallet imports read ESI's available history again after deleting wallet data or relinking a character, instead
  of skipping it because of a stale sync cursor. ([#138](https://github.com/Theragus/Keystar/issues/138))
- Linking a character back to your own account after moving it to another of your EVE accounts no longer deletes
  its wallet history, mail and industry jobs; they are only removed when a character changes hands.
  ([#140](https://github.com/Theragus/Keystar/issues/140))
- Mail sync no longer removes older stored messages if ESI ignores a paging cursor or returns an empty page while
  listing a mailbox. ([#137](https://github.com/Theragus/Keystar/issues/137))
- Right-aligned column headers in tables (the Load and Database tables on System Info, the actions column on
  Users) now line up with their values instead of sitting on the left.
  ([PR #133](https://github.com/Theragus/Keystar/pull/133))
- Role and access changes, settings changes and scope switches now write their audit log entry in the same
  transaction as the change, so a database error can no longer leave a change without an audit trail. Other audit
  entries that can't be written are counted, and System Info warns about them in a new "Audit log written" check.
  ([#156](https://github.com/Theragus/Keystar/issues/156))

### Added

- **3D universe map.** Add a searchable star map under Combat with system names, security status and real positions; Threat Intel system links focus the map and show jump range and light-year distances. ([PR #87](https://github.com/Theragus/Keystar/pull/87))
- **Travel and jump planning.** Calculate shortest stargate routes with two-hour gate-kill evidence and linked killmails, plus carrier, jump freighter and Black Ops range highlighting with Jump Drive Calibration selection. ([PR #87](https://github.com/Theragus/Keystar/pull/87))

- **Industry jobs.** A new Industry Jobs page under Industry lists the industry jobs of your own characters:
  manufacturing, material and time efficiency research, copying, invention and reactions, each with a progress bar,
  the time left (counting down live) and the end time, and the station or structure it runs in with its system.
  Filter by running or finished jobs, character, activity, system and station; tiles count running jobs, jobs ready
  to deliver and jobs ending within a day. Access is opt-in per character on the new Industry access page, like
  skills and mail, so nobody is asked for the two new scopes (`esi-industry.read_character_jobs.v1`,
  `esi-universe.read_structures.v1`) at sign-up; add them to the EVE application (see `docs/deployment.md`). Only you
  see your characters' jobs. ([#105](https://github.com/Theragus/Keystar/issues/105))
- **Skill queue timeline.** Each character's card shows the queue as one strip, like the training-time bar in
  game: every skill takes a slice proportional to the time it still needs, with day, week or month marks below.
  Pointing at a slice highlights its row in the queue table and the other way round.
- **Load on System Info.** The page now shows the CPU share, memory and JS heap of the web app and the worker, the
  container's memory against its limit, free host memory and the host's load average.

### Changed

- **Map interaction.** Use compact glass panels, batched rendering and cached geometry; support mouse rotation and panning, looping route illumination, system focus with fading rotation, reduced motion and wheel zoom without page scrolling. ([PR #87](https://github.com/Theragus/Keystar/pull/87))

- **Mining P&L**: when income comes from wallet sales, it is now net of sales tax instead of counting the tax as an
  expense: each sale on the Income tab shows the tax paid on it and its net, and the tax counts whenever the sale
  does, without a review of its own. Broker fees stay expenses and are easier to review: each shows the journal's
  description and time, and "Include all" counts every suggested broker fee at once.
- Null-sec security status (0.0 and below) is shown in red instead of purple in every security pill, so the
  security colours run from blue at 1.0 to red.

## [0.13.0] - 2026-10-04

### Added

- **Delete appraisals.** A small trash button next to each of your recent appraisals, and on the appraisal itself,
  deletes it after a confirmation; its share link stops working. Only the person who created an appraisal can delete it.
- **System Info for admins.** A new last page under Administration shows the technical state of the instance:
  - **Health checks** for the database, migrations and schema, the worker and its version, failing or stuck jobs,
    paused syncing, EVE SSO, `APP_URL`, clock skew and ESI rate limits.
  - **Network**: whether this server can reach ESI, EVE SSO and zKillboard right now, with the HTTP status and
    response time of each, or why not (DNS, refused, timeout); proxy settings show whether they are set.
  - **Instance details**: the running version and build, the database with its largest tables, the worker and
    background jobs, and the configuration without secret values.
  - **Report an issue** walks through a bug report and opens it on GitHub with the version and a system summary
    filled in. Privacy warnings point out where logs or the public issue could expose pilot or corporation names,
    IDs or the server's address.

  ([#102](https://github.com/Theragus/Keystar/issues/102))
- **Support package** for bug reports:
  - A JSON download with what's needed to debug an instance: build, runtime and container limits, health checks,
    configuration, migrations and schema drift, table sizes, connections, per-job statistics with scrubbed error
    patterns, ESI and zKillboard request counters, and token and scope counts.
  - Never contains pilot, corporation or alliance names or IDs, secrets, the instance's address or who did what.
    Admins see its exact contents before downloading, and every download is recorded in the audit log.
  - When the web app doesn't start: `pnpm support:package`, or `node dist/support.mjs` in the image.

  ([#102](https://github.com/Theragus/Keystar/issues/102))
- Published images record their git commit, tag and build date, shown in System Info ([#102](https://github.com/Theragus/Keystar/issues/102)).
- The sidebar footer of an unreleased image (`:main`) shows its tag and commit next to the version, e.g.
  `Keystar v0.12.0 · main @ c7bfb85`, on an amber warning badge whose tooltip notes that the build may be unstable,
  and links to that commit instead of the releases page.
- **Only members can sign up.** A new switch under Settings → Access stops Keystar from creating accounts for
  characters outside the home corporation (or its alliance, when alliance members are auto-approved). They see a
  message on the login page instead of waiting as guests, and each refused attempt is in the audit log. Existing
  accounts and linked alts are unaffected; guests who registered from outside before can be disabled in one go on
  the Users page.
- **Mining P&L**: income can come from what you actually sold instead of the value of the ore you mined. A new
  Income tab lists your wallet sales; sales of ore, moon ore, ice and gas (raw or compressed), minerals, moon
  materials and ice products are suggested as mining income and reviewed like purchases (include, exclude,
  re-categorise, or count them automatically per character). Choose the basis under Settings → Income; it stays
  on the mined value until you switch.
- **Mining P&L**: a "Mined vs sold" table on the Income tab compares, per ore, what you mined with what you sold
  of it, raw or compressed (compressed ore counts 1:1 in units), with what you got per unit against the valuation
  and the value of the ore still unsold.
- **Mining P&L**: sales tax and broker fees from your characters' wallet journals count as a "Taxes & fees" expense
  when income comes from wallet sales (same wallet access, no new login). Sales tax follows the sale it was paid on,
  even in a multi-sell, so tax on counted mining sales counts on the character that sold; broker fees are suggested
  until you include them.

### Changed

- **Sidebar.** The pilot portrait and name at the bottom of the sidebar link to My Characters, in the expanded sidebar, the collapsed rail and its hover card alike.
- **Ore field estimator**
  - The ore table can be sorted by any column, including volume, ISK/m³, scanner and Keystar value and share;
    grades stay under their ore and follow the same order.
  - The unit price column is replaced by ISK/m³, the value that matters when choosing which rocks to mine.
  - Fleet yield is entered in m³/s, as mining lasers show it, instead of m³/h.
- **Mining P&L**: industrial cores, Mining Foreman Burst modules and drone mining augmentor rigs are auto-tagged as
  "Ships & fittings" expenses, including purchases already imported.
- **Live fleet**: the fleet structure is drawn as a tree, stepping in from fleet command to wings, squads and
  pilots, with a pilot count on every wing and squad.

### Removed

- **Ore field estimator**: the max distance filter and the closest-distance note on each grade.

### Fixed

- The P&L overview's per-character table and the manual expenses list show character portraits, like the rest of
  the mining pages.
- `docker compose pull` fetches a newer Keystar image again when the tag (e.g. `main` or `latest`) is already
  present on the server; it used to report "Image is already present locally" and keep the old image.

## [0.12.0] - 2026-10-04

### Added

- **Threat Intel, rebuilt.** Threat Intel has been reworked from the ground up around the evidence that matters
  before a fight: who is in local, how dangerous they are right now, who they fly with and how they last fought us.
  - **Local Situation**
    - Organised around wrapping pilot affiliation tags, last combat evidence, recently observed co-attacks and the
      latest engagement with us.
    - Selecting a pilot or a legend entry highlights the members of the same alliance, or of the same corporation
      when there is no alliance.
    - The engagement column is wider than the observed-group column.
  - **Engagement report**
    - Shows both sides of the latest engagement with the observed ships, loss counts and ISK lost, and marks
      incomplete evidence.
    - Wide layout with compact ship rows: ship and pilot names inline, destroyed hulls on a red background; hull
      counts and loss labels are gone.
    - Page indicators slide between recorded fights, newest first. Legends, paging and notes stay at the bottom of
      the card.
    - Alliance/corporation highlighting with a legend per side, starting with the affiliation that has the most
      recorded pilots on each side.
  - **Pilot cards**
    - Compact cards of equal height with direct zKillboard links for the character, corporation and alliance.
    - The three latest kills and losses as ship tags, with details in their tooltips.
    - Each pending tag and card shows its own evidence overlay and loading indicator instead of loading text.
  - **Danger score**
    - Calculated from combat capability and local relevance; confidence and escalation evidence are shown
      separately.
    - Explained 0–10 badges: green below 5, orange from 5 to below 8, red from 8. Pilots without a recent sample
      are shown as unknown.
  - **D-scan and briefings**
    - D-scan input and matching results live in a dropdown in the report header.
    - Written briefings are optional and open in a dialog from the blue Briefing button.
  - **Statistics collection**
    - The scan creator's browser fetches pending zKillboard statistics (100 ms apart, at most four at once, backing
      off on rate limits) for a private, temporary preview.
    - Browsers no longer upload to the shared pilot cache: only statistics verified by the worker reach shared
      profiles and danger scores.
    - Server-side statistics requests skip a redirect.

### Changed

- **More sections have their own colour.** Pilots is violet and Social pink, checked for contrast and colour-vision
  separation in both themes like the existing ones.
  - Finances shares Trade's teal.
  - Overview, Account and Administration keep the cyan accent.
- **Income is green and expenses red** in the mining P&L and corp wallet charts.
  - The P&L shows income as one bar instead of stacking it by resource; the tooltip and the By activity panel still
    break it down.

### Removed

- **Threat Intel rescan.** The rescan action and button, their translations and the scan-parent metadata are gone;
  start a new Local snapshot with New scan instead.

### Fixed

- **Notifications no longer run out unseen.** The countdown of kill, loss and mail notifications only runs while the
  Keystar tab is visible and its window has focus, so a kill that came in while you were in game is still there when
  you switch back.
- **Scrolling stays inside lists.** Scrolling the sidebar navigation or the system and multi-select picker lists past
  their top or bottom no longer scrolls the page behind them.
- **Desktop notifications switch that did nothing.** When the browser or an extension turns the request down without
  asking (Safari with websites not allowed to ask, or AdGuard's "Block Push API"), the switch now shows it as
  blocked instead of silently staying off.
  - The blocked hint also names system settings and extensions, which can block notifications for every site.

  ([#90](https://github.com/Theragus/Keystar/issues/90))

## [0.11.0] - 2026-10-03

### Upgrade notes

Skill queues need two optional character scopes.

1. Add `esi-skills.read_skillqueue.v1` and `esi-skills.read_skills.v1` to the scopes of your EVE application at
   <https://developers.eveonline.com/applications>. Nobody is asked for them unless they share their skills on the
   Skills access page, but without them on the application that EVE login fails with `invalid_scope`.
2. Update as usual; the database migrations run on start.

### Added

- **Skill queues.** A new Pilots section shows, for each character:
  - the skill in training with its progress, and when every queued skill and the whole queue finish;
  - paused, empty and ending-soon queues;
  - the character's attributes and remap availability.

  Sharing is opt-in per character on the new Skills access page. Directors also get a corporation view of every
  home-corporation member who shares. Needs `esi-skills.read_skillqueue.v1` and `esi-skills.read_skills.v1` on your
  EVE application (see docs/deployment.md).
- **Mail alerts.** New EVE mail for your characters shows a notification in Keystar, like kills and losses.
  - Shows the subject, sender and receiving character (with the corporation, alliance or mailing list it went to);
    clicking it opens the mail.
  - Needs mail access for the character and checks every 30 seconds. Mail usually reaches Keystar within five minutes
    of arriving in game.
- **Desktop notifications.** Kill, loss and mail alerts can also appear as system notifications (Windows notification
  center, macOS Notification Center) while Keystar is open but not in focus, for example in a background tab or
  behind the EVE client.
  - Clicking one opens the killmail on zKillboard or the mail in Keystar.
  - While a Keystar tab is in focus, alerts stay in-page toasts.
  - Needs the browser's permission and an HTTPS address.
- **Mining: sortable ore breakdown.** Click any column header of the ore breakdown to sort by it; click again to
  reverse the order.
- **Mining: grouped ore types.** The ore breakdown combines the grades and variants of each ore into one row (Scordite,
  Scordite II-Grade, Scordite III-Grade; Blue Ice and Thick Blue Ice; Zeolites and Glistening Zeolites).
  - The unit price is averaged by units.
  - Clicking a grouped row filters the dashboard to all of its types.
  - "Group ore types" in the panel header switches back to one row per type.
- **Survey scanner groups ice and anomaly ore variants.** The field estimator counts Thick Blue Ice, Pristine White
  Glaze, Hadal Talassonite and similar variants under their base ore.

### Changed

- **Revoking optional access stays in Keystar.** "Revoke access" on the Live fleet page, "Stop wallet import" and
  "Stop" for EVE mail switch the access off right away instead of opening the EVE login.
  - Turning it back on works the same way while the character's EVE token still includes it.
  - My Characters notes which access is only switched off in Keystar; re-authorising the character there removes it
    from the token for good.
- **Feedback for account and access actions.** A toast confirms or explains the outcome when you:
  - link, re-authorise or remove a character, grant corporation access, make a character your main or queue its
    syncs;
  - enable or switch off optional access, start or stop sharing a fleet, or delete imported mail or wallet history;
  - approve, disable or re-enable a user, or run or pause syncs.

  If linking a character fails while you're signed in, you return to the page you came from with the reason instead
  of landing on the dashboard without one.
- **Re-authorising checks the character.** Re-authorise buttons, and enabling fleet access, wallet import or mail,
  only accept the character they are for.
  - Picking another character on the EVE login used to give that character the wrong set of permissions, which could
    drop its corporation access and stop the corporation sync jobs.
  - Now nothing is changed, and a message says which character to pick.
- **Alerts menu.** The kill alert button in the top bar is now an "Alerts" menu with switches for kills and losses,
  EVE mail and desktop notifications. Each choice is saved per browser; an earlier "kill alerts off" choice is kept.
- **Steadier collapsible sidebar.**
  - Icons and section headings stay in place while the sidebar expands; collapsed section headings show three
    characters.
  - The width animates over 300 ms without flicker, and the collapsed navigation no longer scrolls.
  - The Keystar branding moves to the top bar, the collapse toggle into the sidebar.
- **Clearer names.**
  - "Combat Report" instead of "Killboard" (English): the sidebar entry, the killboard page heading and the
    dashboard's killboard button.
  - "Corp wallet journal" instead of "Wallet journal": the sidebar entry, the journal page heading and the button on
    the corporation wallet page make clear that the journal covers the corporation's wallets, not your own.
  - "Moon drills" instead of "Moon Observers" and "Refineries": the mining menu entry and the ledger source option
    use the same name, so it is clear they show the same corporation moon-mining data.
- **Mining source choice only when it matters.** The mining overview and ledger only show the Combined / Member
  ledgers / Moon drills choice when the corporation has moon drills on record, since without them all three show the
  same entries.

### Fixed

- **No sideways page shift.** Page content no longer moves a few pixels between pages that scroll and pages that
  don't (with scrollbars that take up space, such as macOS "Show scroll bars: Always" or Windows).

## [0.10.0] - 2026-10-03

### Added

- **"Today" and "Yesterday" date ranges.** The date-range picker on the mining, P&L, finances and killboard pages
  offers single-day presets for the current and the previous EVE day, above "7 days".

### Changed

- **Main character listed first.** The Characters page, the dashboard's character panel, fleet tracking, the mail
  character list and the P&L wallet status show your main character at the top, followed by the others
  alphabetically.
- **Dates in your language's format.** Dates read "02 Oct 2026" in English and "02.10.2026" in German instead of
  2026-10-02. Times are still EVE time (ET). This covers:
  - the mining ledger's day headers and the daily mining and kill tables;
  - timestamps in the journal, audit log, mail, fleets and reports;
  - the killboard, wallet archive, mail and pilot history notes.

## [0.9.0] - 2026-10-03

### Added

- **Light mode.** Switch between light and dark beside the language selector in the sidebar or on the sign-in, join
  and setup pages. Dark remains the default.
  - The preference is remembered for a year and applied before rendering.
  - Matching glass surfaces, readable status colours, controls, tables, chart chrome and keyboard focus.
  - Charts get their own colour-vision-checked series and rarity/threat colours for the light surface, and EVE mail
    colours that would be too pale on it are darkened.
- **Live kill notifications.** When a corporation member gets a kill or loses a ship, a notification appears in the
  top-right corner, usually 10–30 seconds after zKillboard posts it, for everyone who can view the killboard.
  - Shows the destroyed ship (the one you lost, or the one you killed) with your pilot's portrait, the victim, who
    landed the final blow (on kills your pilot, or your top-damage pilot when someone else landed it), the system with
    its security and region, and the ISK value.
  - Stays for 30 seconds with a countdown bar (paused while you hover it) and opens the killmail on zKillboard when
    clicked. With several tabs open, only one of them shows it.
  - A bell in the top bar mutes them for your browser.
  - The worker reads zKillboard's R2Z2 live feed every 10 seconds (not in demo mode), so these killmails also reach
    the killboard right away instead of with the hourly sync.
- **Collapsible sidebar.** The menu button at the left of the top bar shrinks the sidebar to a narrow icon rail and
  back with a short slide and fade (instant when reduced motion is requested).
  - On the rail, hovering or focusing an icon opens its section as a menu beside it, and hovering the portrait shows
    the pilot's name, role and corp.
  - The choice is remembered for a year and applied before rendering.
- **Notifications for your own actions.** Short toasts confirm actions, in the same stack and style as the live kill
  notifications, closing after six seconds unless hovered or focused.
  - Changing a user's role confirms the new role and offers Undo; a refused change says why.
  - Saving Settings confirms the save, or says why it was refused and keeps what you entered.
- **Mining: ledger grouped by day.** Ledger entries sit under a header for each day showing its date, weekday, entry
  and character counts, and the day's units, volume and value.
  - The totals cover the whole day even when its entries run onto the next page; the header then says how many of
    them the current page shows.
  - Days start expanded; click one to collapse it, or use "Collapse all" for a day-by-day summary of the page.

### Changed

- **Threat Intel puts evidence first.** A compact Local Situation summary, early D-scan input, timestamped local
  co-attacker observations, and always-visible latest kill, loss and cyno-history fields replace the dense
  briefing-led layout.
  - Historical ship profiles and optional score details are clearly separated from scanner observations; missing
    data and incomplete fitting history stay explicit.
  - Latest records retain five kills and five losses, and loss chips name the lost hull rather than the final-blow
    attacker's hull.
- **Dropdowns match the theme.** In Chrome, Edge and Safari 27+, the open list of every dropdown is a glass panel in
  the current theme with an accent check mark, instead of the system's list. Other browsers keep their native list.
- **Users & Roles:** the save button only appears once a different role is picked.
- **Sync status is grouped by who a job syncs for.** Corporation jobs, character jobs and app-wide system jobs sit in
  their own sections.
  - Character jobs collapse to one row per character (portrait, account, job count, worst status, next run) and open
    automatically when one of them fails.
  - Long results such as a character's in-game roles are clipped to two lines, with the full text on hover.
- **Releasing an older version line no longer moves `:latest` back.** The Release workflow tags an image `:latest`
  (and marks the GitHub release *Latest*) only when its version is newer than every earlier release, and moves
  `:<major.minor>` only to the newest patch of that line.

### Fixed

- **Mining class filter lists only mined classes.** Like the ore, system and member pickers, the class picker offers
  only ore classes that appear in the ledgers you can see, instead of every class.
- **Sidebar on long pages.** The sidebar surface extends to the bottom of long pages while navigation and footer
  controls stay in the viewport.
- **Dark mode unchanged by light mode.** The original dark-mode table separators and scrollbar colours are kept.
- **Focus ring on search boxes.** Search boxes with an icon (filter pickers, page searches, mail search, field
  estimator inputs) draw the focus ring around the whole rounded box instead of a square outline around the text area
  inside it.
- **Dropdowns keep the saved value.** After a role change on Users & Roles, the dropdown no longer jumps back to the
  old role. After saving Settings, the valuation and permission dropdowns no longer show the old values.

## [0.8.0] - 2026-10-03

### Added

- **Threat Intel system picker.** The current-system field suggests systems as you type: every known-space and
  wormhole system with its region and security status (wormholes show their class, C1–C6, C13, Thera or Drifter).
  - A new background job loads the system list from ESI once (about 20 minutes on a new install) and checks for new
    systems every 30 days.
- **Mining: My characters view.** Viewers with corporation-wide mining access can switch the overview, the ledger and
  the CSV export between **Corporation** and **My characters**.
  - My characters shows all of their linked characters, so alts in another corporation show up next to their main
    without counting towards the home corporation's totals.

### Changed

- **Fleet access is opt-in per character.** Members are no longer asked for `esi-fleets.read_fleet.v1` when they join
  or link a character.
  - Only the fleet boss's character can read a fleet's members, so pilots who run fleets turn it on for that character
    with "Enable fleet access" on the Live fleet page (and can revoke it there).
  - Characters that already granted the scope keep it.
- **Member audit** lists registered characters first, and sorts names without regard to upper and lower case.

### Fixed

- **Optional-scope badges link to the right page.** On My Characters they all linked to the mining P&L settings; the
  mail badge now opens EVE Mail and the fleet badge the Live fleet page.

## [0.7.0] - 2026-10-03

### Changed

- **Member audit handles large corporations.**
  - Search by character, account (main) or character ID as you type.
  - Click a stat tile (In-game roster, Registered, Not registered, Missing or revoked ESI) to show only those
    characters.
  - Page through 50 at a time.
  - Searching, filtering and paging happen in the database, and the state is in the URL, so a filtered view can be
    bookmarked or shared.
- **Links into the member audit.** The unregistered-members count on Mining Overview and the token warnings on Users &
  Roles open the member audit already filtered to the characters concerned.

### Fixed

- **Sign-in redirect.** Sign-in could redirect to another site when `returnTo` contained a tab, line feed or carriage
  return (for example `/%09/evil.example`). The return path is now resolved like the browser would and rejected unless
  it stays on Keystar.
  ([#14](https://github.com/Theragus/Keystar/issues/14))
- **Mining CSV export keeps negative numbers.** Negative security status (`-0.45`) is no longer turned into text, so
  null-sec and wormhole rows stay numeric in spreadsheets. Names starting with `=`, `+`, `-` or `@` are still
  neutralised.
  ([#18](https://github.com/Theragus/Keystar/issues/18))
- **No admin-less instance.** Two admins demoting or disabling each other at the same moment could both succeed and
  leave Keystar without an admin, after which the next pilot to sign in became admin.
  - Role and access changes re-check both users at the moment of the change, one at a time.
  - Only the very first account ever is made admin automatically.

  ([#16](https://github.com/Theragus/Keystar/issues/16))
- **Appraisal during ESI outages.** When EVE's ESI is down or rate limiting, the appraisal no longer saves real items
  as unrecognised lines or with missing or stale prices: it shows "ESI unavailable, try again" and saves nothing.
  - The ore field estimator says which ores couldn't be priced and tries them again.
  - Both log the ESI error so admins can tell an outage from bad input.

  ([#17](https://github.com/Theragus/Keystar/issues/17))
- **Name lookups during ESI outages.** Keystar splits a batch only when ESI rejects it for an invalid id; a server
  error, timeout or rate limit fails the job, so the scheduler backs off instead of sending about two failing requests
  per id and reporting success.
  ([#19](https://github.com/Theragus/Keystar/issues/19))
- **Market price job survives single failures.** The hourly job no longer throws away a whole run, including the ore
  values the mining dashboard uses, when a single item can't be priced.
  - Items that fail keep their previous values and are counted in the job summary.
  - The job prices only ores in the mining ledgers and items appraised or valued in the field estimator in the last
    14 days, rather than every item ever appraised.
  - When a background job fails part-way, its remaining ESI requests stop instead of running on into the retry.

  ([#15](https://github.com/Theragus/Keystar/issues/15))
- **ESI rate-limit pause.** The ESI client no longer pauses a whole rate-limit group for 15 seconds after a response
  that names the group but doesn't report its remaining tokens.

## [0.6.0] - 2026-10-03

### Changed

- **Each section has its own colour:** Industry amber, Combat crimson, Trade teal. Overview, Account and
  Administration keep the cyan accent.
  - It shows in the page heading label, the sidebar marker and a faint glow at the top of the page.

## [0.5.0] - 2026-10-03

### Upgrade notes

Corporation wallets need two corporation scopes, EVE Mail one optional character scope.

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
  - Balance, income, expenses and net for all wallet divisions, per day, week or month, with a chart and a
    per-division table. ISK moved between the corporation's own divisions is shown separately, not as income or
    expense.
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

- **Killboard:** the situation report starts collapsed; click its header to read it.

## [0.4.0] - 2026-10-03

### Upgrade notes

Wallet import in the mining P&L needs one optional character scope.

1. Add `esi-wallet.read_character_wallet.v1` to the scopes of your EVE application at
   <https://developers.eveonline.com/applications>. Nobody is asked for it unless they enable wallet import in the
   mining P&L, but without it on the application that EVE login fails with `invalid_scope`.
2. Update as usual; the database migrations run on start. Nobody needs to re-authorise.

### Added

- **Mining P&L** (Industry → Mining P&L, German "Mining-GuV"): a personal income/expense sheet for pilots mining with
  alts, visible only to the account itself, in English and German.
  - Income: ore mined by your characters, valued like the mining dashboard, with an optional buyback % and per-ore
    price rules (with date ranges); realised prices from your wallet sells can be applied with one click.
  - Expenses: opt-in wallet import per character. Purchases of mining crystals, Heavy Water, Mining Foreman burst
    charges, mining drones and mining hulls/fittings are auto-tagged and only suggested until you include them;
    "count tagged purchases automatically" can be switched on per character (off by default). Other purchases stay
    out unless you tag them. Manual costs (PLEX/Omega, contracts …) can be spread over up to a year.
  - Net profit per day / week / month, ISK per hour (gross and net), cost per m³, and splits per character and per
    activity (ore / moon / ice / gas).
- **Mining activity tracking.** The personal ledger sync records when each character's ledger grows, which gives
  active hours (wall-clock across alts and per character) from now on.
- **Optional ESI scopes.** Modules can declare scopes that users enable per character instead of every member being
  asked for them. The first is wallet read access.

### Changed

- **Re-authorise keeps scopes.** "Re-authorise" on My Characters keeps the character's corporation and optional
  scopes instead of requesting only the member scopes. When another EVE login drops an opt-in scope anyway, My
  Characters says so and offers to turn it back on.
- **Mining ledger sync** no longer re-applies a snapshot from Keystar's own cache or an older snapshot.
- **Mining P&L:** trades between your own characters are left out (neither a cost nor a sale).

### Fixed

- **Compressed gas.** Gas types seen for the first time are linked to their compressed variants again; 0.3.0 only did
  that for ore and ice.
  - Valuation falls back to the compressed price when raw gas has none.
  - The mining P&L recognises sales of compressed gas.

## [0.3.0] - 2026-10-03

### Upgrade notes

Threat intel reads blues and reds from the corporation's and alliance's contacts, which needs two corporation scopes.

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
  - English and German: scores, tags and template notes follow the reader's language, and Claude writes in the
    language of whoever asks for a note (the scan's creator for automatic briefings).
- **New permissions:** **Use threat intel**, **Use Claude for intel** (both members by default) and **Manage threat
  intel** (directors).

### Fixed

- **ESI client** no longer pauses for a second after responses without error-limit headers.
- **Sync jobs** triggered while running run again right after instead of waiting for their next interval.
- **Type lookups** for ships or modules no longer fetch every type of their group (only ores, ice and gas need that).

## [0.2.0] - 2026-10-03

### Upgrade notes

Live fleet needs the new character scope `esi-fleets.read_fleet.v1`.

1. Add `esi-fleets.read_fleet.v1` to the scopes of your EVE application at
   <https://developers.eveonline.com/applications>.
2. Update as usual (`KEYSTAR_VERSION=0.2.0`, `docker compose pull`, `docker compose up -d`); the database
   migrations run on start.
3. Members who run fleets re-authorise their characters under My Characters, which shows the missing scope.

### Added

- **Live fleet** (Combat → Live fleet): a fleet boss clicks "Track fleet" on one of their characters and the worker
  reads the fleet from ESI every 15 seconds.
  - Members by wing and squad with ship, system and role, the composition by ship class and hull, who joined and
    left, and a list of past fleets with their participants.
  - Only the tracked character is polled, because ESI shows members and wings only to the fleet boss. Tracking stops
    on its own when the character leaves the fleet.
  - Texts are in English and German, and the demo data includes a live and two past fleets.
- **New character scope** `esi-fleets.read_fleet.v1`: enable it on the EVE application, then members re-authorise
  under My Characters to share fleets.

## [0.1.5] - 2026-10-03

### Changed

- **Cards that looked clickable now are, or are gone.** Links only appear for viewers who can open the target page,
  and a hover state plus an arrow marks them.
  - Dashboard KPI tiles open the page behind the number: the killboard tiles open the killboard on the same 30 days
    (ISK destroyed jumps to the ISK breakdown, ISK efficiency to pilot efficiency), and the mining tile opens Mining.
  - The dashboard info row links to the corporation on zKillboard, Member Audit, My Characters and Sync Status.
- **Users & Roles links where it can.**
  - The role cards filter the user table (`?role=director`; click again to show everyone).
  - Character names open zKillboard.
  - An ESI health warning links to where it can be fixed: My Characters for your own account, Member Audit for
    others.
  - Admins get a "Role permissions" shortcut to the permission matrix in Settings.
  - The Actions column is hidden when there is no account you can manage, and otherwise shows "—" with an
    explanation where nothing can be done.
- **Top bar:** the corporation name links back to the dashboard.
- **Translations:** the new texts (filter line, tooltips, "Role permissions") are available in English and German.

### Removed

- **Dashboard corporation card**, which repeated the kills, losses and efficiency shown in the tiles below it. The
  corporation logo and ticker moved into the "Home corporation" item, and the active pilot count into the kills tile.
- **Corporation "switcher" icon** next to the corporation name in the top bar. Keystar has one home corporation, so
  there was nothing to switch.

## [0.1.4] - 2026-10-03

### Fixed

- **German digit grouping** for changes in killboard tables and the top-systems lists (e.g. "+1.234").
- **Field estimator placeholder** uses the number format of the EVE client in the chosen language.

## [0.1.3] - 2026-10-02

### Added

- **German interface.** Keystar now speaks English and German.
  - The language follows the browser's preferred language on the first visit (anything other than German gets
    English).
  - Change it with the language switch in the sidebar footer, next to your pilot, or at the bottom of the sign-in,
    registration and setup pages. The choice is remembered in a cookie.
- **Localised numbers and dates.** In German: "9,87 Mio. ISK", "1.234.567", "12,3 %", "vor 5 Minuten", "02. Okt.".
  EVE times stay in `YYYY-MM-DD HH:mm ET`.

### Changed

- **Module texts from dictionaries.** Module manifests and sync jobs name their texts with dictionary selectors
  instead of English strings (see docs/modules.md). Item, system and pilot names, CSV exports and stored situation
  reports remain in English.

## [0.1.2] - 2026-10-02

### Changed

- **Larger small text** across the app for readability at 100% zoom on large monitors:
  - section titles (e.g. "Top pilots") go from 11px to 13px;
  - field labels and table headers from 9–11px to 12px;
  - badges and chips to 11px;
  - subtitles and hints from 12px to 13px.

  The sizes are now a shared scale (`text-3xs`, `text-2xs`, `text-xs`) defined in `globals.css` instead of one-off
  values.
- **KPI tiles** keep their values aligned across a row when a hint wraps onto a second line.

## [0.1.1] - 2026-10-02

### Added

- **Killboard** (Combat → Killboard): the home corporation's kills and losses from zKillboard.
  - Week-over-week KPIs and a weekly situation report (written by Claude with an optional `ANTHROPIC_API_KEY`,
    otherwise from a template).
  - Top pilots with the period's MVP and awards, pilot efficiency, top systems, ISK breakdown, recent activity and
    ship statistics.
- **Appraisal** (Trade → Appraisal): paste cargo, inventory, contracts, EFT fittings, d-scans, killmails or item lists
  and get Jita 4-4 buy/sell/split values, volume and a percentage price, saved as a shareable link.
- **Releases:** tagged versions with Docker images on `ghcr.io/theragus/keystar`; `docker compose pull` updates
  without building on the server. The version is shown in the sidebar and in `/api/health`.

### Changed

- **Dashboard leads with combat:** kills, ISK destroyed and efficiency for 30 days, a kills-over-time chart, the
  latest kills and losses and the MVP. Mining is down to one tile.
- **Corporation card** shows active pilots (on a killmail in the last 30 days) and the member count instead of
  "pilots in game".

### Fixed

- **Native dropdowns** (e.g. Settings → Permissions) showed light text on a white list in Edge and Chrome on Windows.
- **Killboard import** runs right after the home corporation is set or changed instead of up to an hour later.

## [0.1.0] - 2026-10-02

First version (not published as an image): EVE SSO login, ESI token management, Keystar roles and permissions, the
background sync worker, the mining module with moon observers and the ore field estimator, the first-start
walkthrough and the Docker Compose deployment.
