# Fleet Loot Organizer

Open Combat → Fleet Loot (`/loot`). Create an operation with a UTC start/end (up to seven days), optionally linked to an already tracked fleet. The daily filter groups operations by their start date. Existing Fleet tracking and its optional fleet-boss access must be enabled to collect the roster; the Loot module requests no new ESI scopes. It does not recover past rosters that were never tracked.

## Import and value

Export the in-game fleet Loot History before leaving the fleet. Upload a tab-separated text export or paste it. Supported column names include Time, Character, Item Type and Quantity; a plain Item-tab-Quantity inventory list needs a collector. A maximum of 1,000 rows, 500 distinct item names and 200,000 characters is accepted per import. Unknown item names remain in the ledger for review. Invalid rows fail the import rather than disappearing. A time-stamped row must fall within the operation window.

Exact normalized imports are deduplicated. Overlapping time-stamped imports are deduplicated by time, collector, item, quantity and occurrence count, preserving repeated identical events inside one source. Untimed inventory lists are user assertions, not proof of looting, and partially overlapping lists require manual review. Exclude erroneous entries rather than importing transfers as additional loot.

The background worker resolves names and fetches prices through the existing shared ESI and Jita market clients. Only direct Jita 4-4 sell prices are accepted; absent or unmarketable items stay unpriced. Snapshots retain the source price timestamp and do not change on subsequent syncs. An organizer can enter a manual unit value. The estimated total is a partial subtotal when entries are unpriced, not a claim that unknown items are worthless.

## Reconcile killmails

Add killmail IDs or zKillboard links. The worker obtains their hashes from the existing zKillboard client and reads authoritative ESI killmails. Only killmails inside the operation window are accepted. The comparison uses dropped quantities, including container contents, never destroyed quantities. A possible match is only a suggestion: a killmail does not establish who collected the drop. The organizer may confirm an allocation or mark it disputed. Confirmed allocations of each item cannot exceed the killmail drop, and cannot occur after a recorded loot event. Salvage/PvE loot may legitimately remain unmatched.

## Select participants and split

Every observed pilot remains listed. Use **Receives payout** to include or exclude any character; the recalculated payout is shown above the member list. Excluding an alt gives it zero share without deleting its loot or payment records. Assign the same share-recipient name to alts to group them under one entitlement; the highest eligible weight in the group is used, rather than adding alt weights. Zero weight is also supported. Equal weights split equally; rounding distributes leftover cents deterministically.

Estimate basis splits the known value of all non-excluded recovered items. Actual-sales basis splits entered net sale proceeds plus the snapshot value of items retained as shares, excluding unsold items. Expenses are deducted first, then the corporation percentage. Kept loot and recorded ISK payments reduce the recipient's remaining cash balance. A negative balance means that recipient should return value to the pool. Payments are records only: no ISK transfer is made through ESI. Automatic wallet reconciliation is deliberately outside this first release.

Handed-to-organizer, sold and retained are states of the same loot entry; a transfer never creates a second asset. If only part of a stack is sold, record the stack in separate entries at import so each entry has one state and one net proceeds value.

## Access and operations

Only the creator edits. Operations are private by default. Sharing is limited to authenticated users owning a character listed by verified EVE character ID; it does not create an anonymous public link. Names in unverified uploads are not authentication. Worker writes use revision checks and organizer mutations lock the row, rejecting stale changes instead of overwriting them.

Closed ledgers stop edits and worker updates until reopened by the owner. Finalization refuses missing basis values, uncovered expenses or no eligible recipients. CSV export supports the loot ledger; formula-like cells are escaped. A generated migration creates `loot_operations`; the normal app/worker migration process applies it. No additional cloud resources or credentials are needed.

## Copied history and attendance splits

Chat-style copied entries (`21:06:00 Ancient Wolf has looted 3,005 x Nova Fury Heavy Missile`) are accepted directly. Choose their UTC loot date because the clipboard text contains no date. The operation time window still applies. Invalid line numbers, duplicates and out-of-window times are shown explicitly.

On Fleet Loot, select your character and **Track my current fleet**. Enable the existing optional fleet access on `/fleet` first. ESI only exposes the full roster to the fleet boss; a non-boss tracker shows that limitation instead of inventing members. An active character's tracked fleet is preferred when creating an operation. Existing operations can link the owner's tracked fleet in Participants.

Every successful 15-second fleet poll saves visits keyed by fleet, character and ESI join time. A missing member receives an approximate detected departure time. Rejoining creates a separate visit; stopping tracking ends coverage at the last actual observation, not an assumed fleet departure. API outages and cache delays can widen uncertainty. Historical attendance that was never tracked cannot be recovered.

New operations default to **Share each item among pilots present at loot time**. Existing operations retain equal splitting unless changed in Split settings. Per-item mode applies the manual eligibility checkbox and weights, deduplicates alts grouped under the same recipient, and allocates each item's net pool to attendees at its timestamp. Expenses and corporation cuts reduce every item's available share proportionally. Untimed loot or loot with no eligible observed attendee stays unallocated and prevents closing the ledger. Organizers can use the explicit equal-share rule when reliable historical attendance is unavailable.
