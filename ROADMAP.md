# Keystar roadmap

Features that are planned or being considered. Each larger feature gets its own
branch and is built as a module (see [docs/modules.md](docs/modules.md)), so it
brings its own ESI scopes, permissions, sync jobs and pages without touching the
core.

Status: ✅ done · 🚧 in progress · 📝 planned · 💡 idea

> **Moving to GitHub.** Plans and ideas are moving, a few at a time, to
> [issues](https://github.com/Theragus/Keystar/issues?q=is%3Aissue%20type%3AFeature) and the
> [Keystar Roadmap](https://github.com/Theragus/Keystar/projects) project, which becomes the source of truth. Items
> with an issue link are tracked there; vote with a 👍 on the issue. New ideas go in as a
> [feature request](https://github.com/Theragus/Keystar/issues/new?template=feature_request.yml), not into this file.

## Foundation (MVP)

- ✅ EVE SSO login (OAuth2 + PKCE, JWT validation), multiple characters per account
- ✅ ESI token management ("ESI keys"): encrypted refresh tokens, scope tracking, re-authorisation, shareable `/join` registration link
- 💡 Admin setting to only let characters from the home corporation or alliance register: the `/join` link and EVE
  login turn everyone else away
- ✅ Keystar roles: Admin, Director, Contributor, Viewer, Member, Guest — with a per-permission override matrix
- ✅ Background sync worker: ESI caching (ETag/Expires), pagination, error-limit and rate-limit back-off, compatibility date
- ✅ Member audit: in-game roster vs registered characters, missing/revoked ESI
- ✅ Self-hosting: Docker Compose (Postgres, app, worker, Caddy HTTPS)
- ✅ English and German UI: browser language detection (English fallback), language switch in the sidebar footer, localised number and date formats
- 💡 German item, system and ship names (ESI `language=de`) for German-speaking corporations
- 💡 Situation report in the reader's language (today it is written once, in English)

## Mining

- ✅ Personal mining ledgers and corporation moon-observer ledgers, de-duplicated
- ✅ Personal mining ledger opt-in per character (Mining → Access), with deletion of the stored history
- ✅ Filters: date range, members, ore class, ore type, system, data source
- ✅ Daily value / volume / units, resource mix, moon rarity, top miners (pilots or characters), ore and system breakdowns
- ✅ Valuation from Jita 4-4 buy/sell/split or ESI average, current or historical prices
- ✅ Ledger table and CSV export
- ✅ **Ore field estimator** — paste a survey scanner result and get the total value of the field, grouped by ore type and sub-grouped by grade (e.g. Scordite / II-Grade / III-Grade). Handles German and English number formats.
- ✅ **Personal mining P&L (income / expense sheet)** — for pilots mining with alts:
  - *Income*: ore mined by your own characters, valued like the dashboard, adjusted by a buyback % and per-ore price
    rules; realised prices from your wallet sells are offered as one-click rules.
  - *Expenses*: opt-in wallet import per character (`esi-wallet.read_character_wallet.v1`). Purchases are auto-tagged
    by item group — mining crystals, Heavy Water, mining foreman burst charges, mining drones, mining hulls and
    fittings — and only *suggested* until you include them (or switch on automatic counting per character); anything
    else stays out unless you tag it. Manual entries (optionally spread over up to a year) cover PLEX/Omega for alts,
    contracts and other costs ESI can't see.
  - *Breakdown*: net profit per day / week / month, ISK per hour from measured ledger activity (wall-clock and per
    character), cost per m³, per-character and per-activity (ore / moon / ice / gas) splits.
- 💡 Mining P&L: recurring manual costs (monthly Omega), contract import for buyback sales
- 💡 Mining tax / buyback calculations per member
- 💡 Moon extraction timers (`/corporation/{id}/mining/extractions`, Station_Manager)

## Industry

- ✅ **Industry jobs** of your own characters: manufacturing, ME/TE research, copying, invention and reactions with
  progress, time left and end time; filters for state, character, activity, system and station; stations and
  docking-accessible structures named; opt-in per character on the Industry access page
- 💡 Corporation industry jobs (`esi-industry.read_corporation_jobs.v1`, Factory Manager) for directors
- 💡 Job cost and output value, profit per job from Jita prices
- 💡 Live alert when a job is ready to deliver

## Combat

- ✅ **Killboard** for the home corporation, built from zKillboard (no ESI scopes needed) — brought over from the
  Lucky.Punch performance dashboard:
  - Kills, losses, ISK destroyed / lost, ISK efficiency with week-over-week changes, for any date range
  - Weekly **situation report**, written by Claude (optional API key) or from a template
  - Top systems by kills and losses, ISK breakdown, recent activity with zKillboard links
  - Most effective / most used / most lost ships and pilot efficiency (final blows, solo, net ISK), all sortable
- ✅ **Live fleet** from the ESI fleet endpoints (`esi-fleets.read_fleet.v1`): the fleet boss starts tracking on the
  fleet page and the worker reads the fleet every 15 seconds:
  - Members by wing and squad with ship, system and role; composition by ship class and hull; joins and leaves
  - Past fleets with duration and participants
- 📝 Fleet doctrine compliance check (allowed hulls per doctrine) and logi/DPS/tackle counts
- 📝 Fleet participation history per pilot (PAP-style tracking)
- 💡 Post the weekly situation report to Discord
- 💡 Doctrine tags for hulls and per-doctrine performance
- 💡 Track additional corporations or the alliance alongside the home corporation

## Threat intelligence

- ✅ **Scans**: paste local, a fleet composition, chat lines or names (up to 500 pilots); names and affiliations from
  ESI, shareable scan links, rescans, a corp-wide "recently seen hostiles" feed
- ✅ **Friend or foe** from the home corporation/alliance and their ESI contacts (optional contact scopes)
- ✅ **History with us** from the killboard: kills on us, losses to us, hulls flown against us, and fights grouped by
  system and time with what they brought, who else came and how it went
- ✅ **Threat scores** from zKillboard statistics and each pilot's newest killmails, weighted toward recent activity:
  eight explained dimensions, a recency gate, role tags (cyno from loss fits, hunter, tackle, capital, gate camper,
  ganker, logi, FC …), timezone heatmap, wingmen, corporation history, latest kills strip and "last seen flying"
- ✅ **Group view**: tiers, likely composition, roles, pilots who fly together
- ✅ **D-scan matching**: which scanned pilot probably flies which hull on scan
- ✅ **Claude** (optional API key, reused from the killboard): a briefing per scan, dossiers and d-scan reads on
  request, from computed facts only; templates otherwise
- 💡 Live watch: zKillboard's R2Z2 feed to flag kills by recently seen hostiles near the home systems
- 💡 History with alliance mates, not only the home corporation (needs the alliance killboard)
- 💡 Manual red/blue lists and notes per pilot, shared in the corporation
- 💡 Ask Claude follow-up questions about a scan

## Trade

- ✅ **Appraisal**: paste cargo, contracts, fits, d-scans or lists; Jita 4-4 buy/sell/split, volume, percentage
  price, shareable links, "appraise again" at current prices
- ✅ **Market orders** of your own characters (`esi-markets.read_character_orders.v1`): open buy and sell orders with
  price, remaining quantity, station or structure, issue date and expiry, closed orders of the last 90 days, totals
  for selling, buying and escrow, orders about to expire; opt-in per character on the Market access page
- 💡 Market orders: compare each order with the best price at its location (outbid / undercut), order slots per
  character from the trade skills
- 💡 Corporation market orders (`esi-markets.read_corporation_orders.v1`, Accountant / Trader) for directors
- 💡 Live alert when an order is filled or about to expire
- 💡 More markets (Amarr, Dodixie, Rens, Hek) and a market selector
- 💡 Corp buyback: a configured percentage per item group, contract instructions for members

## Finances

- ✅ **Corporation wallets** (`esi-wallet.read_corporation_wallets.v1`, Accountant/Junior Accountant; division names
  with `esi-corporations.read_divisions.v1`, Director):
  - Balances, income, expenses and net for all seven divisions, per day / week / month, with transfers between
    divisions kept out of income and expenses
  - Wallet journal with categories, counterparties, filters by division, category and income/expense/transfer
  - Long-term archive: ESI keeps only ~30 days, Keystar keeps every journal entry, market transaction and daily
    balance, and shows any gaps it could not fill
- 💡 Where the money goes and comes from: top categories, ref types and counterparties per period
- 💡 Item-level spending and sales from the archived market transactions
- 💡 Balance and spending trends (daily balance history, month over month)
- 💡 Office rent tracking per station/structure (`office_rental_fee`) with due-date reminders
- 💡 Corporation tax income per member (bounty and mission tax by `context_id`)
- 💡 CSV export of the journal

## Social

Everything ESI groups as "social" (`char-social`: mail, calendar, contacts, standings) shares one rate budget per
character, so it lives in one module.

- ✅ **EVE Mail** (read-only, opt-in per character, `esi-mail.read_mail.v1`): inbox, sent, corporation, alliance,
  mailing lists and custom labels with unread counts; bodies rendered from EVE HTML with resolved links (portraits,
  zKillboard, everef, kill reports, fittings); search; mail shared by several alts listed once; private to the account
- 💡 Organise mail from Keystar: mark read, labels, delete (`esi-mail.organize_mail.v1`)
- 💡 Write and reply to mail (`esi-mail.send_mail.v1`)
- 💡 Calendar: corp ops and events with attendance (`esi-calendar.read_calendar_events.v1`)
- 💡 Personal contacts and standings (`esi-characters.read_contacts.v1`, `esi-characters.read_standings.v1`)

## Planned modules

### 🚧 Skills & corporation skill plans

- ✅ **Skill queues** (opt-in per character, `esi-skills.read_skillqueue.v1`, `esi-skills.read_skills.v1`): skill in
  training with progress, finish time of every queued skill and of the whole queue, paused/empty/ending-soon
  warnings, attributes and remap availability; own characters, plus a corporation view for directors
- ✅ **Remap optimiser** (`esi-clones.read_implants.v1` with skill sharing, for implants): the attribute remap that finishes the
  current queue fastest, time saved, remap availability, and a warning for queues shorter than 180 days
- 💡 Corporation skill plans: paste a plan copied from the game, see which members have it trained and what is missing

### 📝 Assets / inventory

- Look up inventory for specific players (`esi-assets.read_assets.v1`) and corporation hangars (`esi-assets.read_corporation_assets.v1`, Director).
- Search by item across all members, with location names and valuation (reuses market prices).

### 📝 Personal wallets

- 🚧 Personal wallets per character (`esi-wallet.read_character_wallet.v1`): opt-in transaction import exists (used
  by the mining P&L); journal, balances and a wallet page are still to come.
- 📝 Wallet page like the corporation wallets: balance per character, journal and market transactions, income /
  expenses / net per day, week and month, categories and counterparties, and a long-term archive beyond ESI's ~30 days
- 📝 Opt-in per character on the ESI access page; works for every registered character, including alts outside the
  corporation; private to the account
- 💡 Combined view across all of an account's characters, with transfers between your own characters kept out of
  income and expenses

### 📝 Industry jobs

- Manufacturing, research, copying, invention and reaction jobs with progress, finish time and ready-to-deliver
  status (opt-in per character, `esi-industry.read_character_jobs.v1`)
- Several characters per account, including alts outside the corporation; private to the account
- Corporation jobs for directors and factory managers (`esi-industry.read_corporation_jobs.v1`)
- 💡 Slot usage per character (manufacturing / science / reactions) and "job finished" notifications

### 🚧 Wormhole navigator

A shared, Pathfinder-style map of the corporation's wormhole chain.

- 🚧 Chain map and system lookup (class, effects, statics), wormhole lifetime and mass tracking
  ([#32](https://github.com/Theragus/Keystar/pull/32))
- 💡 Auto-mapping from character locations (`esi-location.read_location.v1`), signature paste, route through the
  chain to k-space, kills in the chain from zKillboard

### 💡 Jump planner

Route planning for ships with a jump drive.

- Jump range per hull and Jump Drive Calibration level, with a range map around a start system
- Several ship types: black ops, jump freighters, Rorquals, carriers, dreadnoughts, force auxiliaries, supercarriers
  and titans, each with its racial isotope fuel
- Fuel per jump and per route (Jump Fuel Conservation, Jump Freighters skill) with an approximate ISK cost from Jita
  prices; midpoint stops and an estimate of jump fatigue

## Platform ideas

- 💡 Discord notifications (sync failures, revoked tokens, new registrations)
- 💡 Saved views / dashboards per user
- 💡 Custom roles in addition to the built-in hierarchy
- 💡 SDE import for reprocessing values (refined ore value) and offline type data

## Universe map

- ✅ Interactive 3D map under Combat with system search, names and security status from CCP static data.

## Gate check

- ✅ Route planning (shortest, safer, less secure, avoided systems) with kills at every gate on the route, live from
  zKillboard's feed, tagged smartbombs, interdictors, HICs, gankers, hot drops and pod kills
- ✅ Camp estimates for the time you reach each gate: history by time of day, live camps, regular campers seen nearby
- 💡 Ansiblex jump bridges and Thera/Turnur wormhole connections (EVE Scout) as route options
- 💡 Backfill of camp history from EVE Ref's daily killmail archives, so estimates are useful from day one
- 💡 System traffic from ESI (`/universe/system_jumps`) to weigh kills against how busy a system is
- 💡 A live alert when a camp appears on a saved route
