# Writing a module

Every feature beyond the core (mining today; skills, assets, wallets, fleets, threat intel later) is a **module**.
A module declares what it needs and what it offers; the core takes care of tokens, scheduling, permissions and
navigation. Use `src/modules/mining` as the reference implementation.

## 1. Manifest — `src/modules/<name>/module.ts`

```ts
import { GraduationCap } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const skillsModule: KeystarModule = {
  id: "skills",
  name: "Skills",
  description: "Character skills, queues and corporation skill plans.",
  scopes: [
    { scope: "esi-skills.read_skills.v1", level: "character", reason: (t) => t.skills.module.scopes.skills },
    { scope: "esi-skills.read_skillqueue.v1", level: "character", reason: (t) => t.skills.module.scopes.queue },
  ],
  permissions: [
    {
      key: "skills.view.own",
      label: (t) => t.skills.module.permissions.viewOwn.label,
      description: (t) => t.skills.module.permissions.viewOwn.description,
      group: (t) => t.skills.module.permissionGroup,
      defaultMinRole: "member",
    },
    // … skills.view.corp, skills.plans.manage
  ],
  nav: [
    {
      id: "pilots",
      label: (t) => t.skills.module.navSection,
      order: 20,
      items: [
        {
          href: "/skills",
          label: (t) => t.skills.module.nav.skills,
          icon: GraduationCap,
          anyPermission: ["skills.view.own", "skills.view.corp"],
        },
      ],
    },
  ],
};
```

User-facing text is never written into the manifest directly: `label`, `description`, `group` and `reason` are
selectors into the dictionaries (see step 5), so the sidebar and settings render in the viewer's language.

A nav section may set `tone` (`"industry"`, `"combat"` or `"trade"`) to colour its page headings, the sidebar marker
and the header glow; without one it uses the accent. Sections merged by id share the first tone set, so only one
module needs to declare it. Don't add new tones ad hoc: they are checked for contrast and colour-vision safety in
`src/app/globals.css`.

Register it in `src/core/modules/registry.ts` (`MODULES`). That alone:

- adds its scopes to the SSO requests (`character` scopes for every member, `corporation` scopes for the "link with
  corporation access" flow) and to the scope checklists in the UI,
- adds its permissions to the role system and the Settings → Permissions matrix,
- adds its navigation (filtered by permission).

Remember to enable new scopes on the EVE developer application, and tell members to re-authorise (My Characters
shows "missing scopes" automatically).

Sensitive scopes, or scopes that only some users need, can be **optional**:
`{ scope, level: "character", optional: true, manageHref: "/your-page", managePermission, label, reason }`. They are left out of the
member and corporation scope sets and never reported as missing. Let users enable them per character on the
`manageHref` page (My Characters links there) with `reauthorizeHref(grantedScopes, { add: [scope] })`. Switching one
off happens in Keystar, without an EVE login: an `ActionForm` around `setOptionalScope(characterId, scope, false)`
(`src/app/(app)/characters/actions.ts`). The same action with `true` switches it back on while the token still holds
it (`esi_tokens.disabled_scopes`); see "Optional scopes" in `docs/architecture.md`. `label` names the access in
toasts and notes ("Fleet access"); `managePermission` is the permission `setOptionalScope` requires (the one
the `manageHref` page checks). Jobs that require the scope are only planned for characters that use it. See the
wallet, mail and fleet modules for examples.

## 2. Schema — `src/modules/<name>/schema.ts`

Define Drizzle tables, then export them from `src/core/db/index.ts` (add the import to `schema` and an
`export * from`). Generate a migration:

```bash
pnpm db:generate --name skills
```

Store raw ESI data keyed by its natural identity (character, date, type …) and upsert on sync. Don't add foreign
keys from history tables to `characters` — history should survive a character being unlinked.

## 3. Jobs — `src/modules/<name>/jobs.ts`

```ts
import type { JobDefinition } from "@/core/sync/types";

export const skillsJob: JobDefinition = {
  key: "skills.character-skills",
  label: (t) => t.skills.module.jobs.characterSkills,
  module: "skills",
  owner: "character",                       // character | corporation | global
  requiredScopes: ["esi-skills.read_skills.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const res = await esi.get<{ skills: unknown[] }>(`/characters/${characterId}/skills`, { characterId: characterId! });
    // … upsert into your tables, then resolve names: ensureTypes(...), ensureNames(...)
    return { summary: `${res.data.skills.length} skills`, nextRunAt: res.expiresAt };
  },
};
```

Add the jobs to `src/modules/jobs.ts`. The scheduler creates one row per eligible owner and keeps it in sync with
tokens. For corporation jobs set `preferredCorpRoles` so the scheduler tries the right members' tokens first; a `403`
moves on to the next candidate automatically. If the endpoint needs no in-game role (corporation contacts, for
example), set `anyCorpMember: true` so any member with the scopes can serve it.

A global job with a short `intervalSeconds` can work through a queue: return `nextRunAt` to wait longer, and call
`triggerJobs({ jobKey })` from a server action to wake it immediately (a trigger that arrives while the job runs is
kept, so the job runs again right after).

If the module needs item prices, add a `PriceInterestProvider` to `PRICE_INTEREST` in `src/modules/jobs.ts`.

## 4. Pages

Add routes under `src/app/(app)/<name>/`. In every page, start with the data access layer:

```ts
const user = await requirePermission("skills.view.own", "skills.view.corp");
const corpWide = user.can("skills.view.corp");
// scope queries to user.characterIds unless corpWide
```

Server actions must call `assertPermission(...)` themselves — never rely on the page having checked.

Reuse the UI kit in `src/components/ui` (`Panel`, `StatTile`, `MultiSelect`, `DateRangePicker`, `Segmented`,
`StatusBadge`, `Portrait`, `TypeIcon`, …) and keep filters in the URL like the mining pages do (`PendingProvider`
dims the previous render while new data loads).

To confirm an action or report a refusal from a client component, call `useToast().toast({ tone, title,
description, action, durationMs })` (`src/components/ui/toast.tsx`). The app layout already mounts the
`ToastProvider`. For a single button, a server page can wrap it in `ActionForm` (`src/components/ui/action-form.tsx`)
instead: pass the bound action and the translated `success`, `failed` and `errors` texts, and the action returns an
`ActionResult` (`src/lib/action-result.ts`). A route handler that redirects (like the SSO callback) can't show a
toast; it sets a one-shot cookie with `encodeFlash()` (`src/core/flash.ts`) that `FlashToasts` in the app layout
turns into one. A feature that keeps its own list of richer cards, like the live kills, renders `<Toast>`s
inside a `<ToastViewport>`; they join the same stack. To announce new events as they
happen, declare a live alert (section 6). Server actions behind a toast return a result object, not an exception, so the message can be
translated. For a `<select>` whose value the server can change, avoid `<form action>` plus `defaultValue`.
React 19 resets the form after the action, and a select resets to the value it was first rendered with. Control
the value in a client component, or give the form a `key` that changes with the saved value.

## 5. Texts — `src/i18n/messages/{en,de}/skills.ts`

Add a `skills` namespace to the English dictionary (`src/i18n/messages/en/skills.ts`, registered in
`en/index.ts`) and the German one (`de/skills.ts`, typed `typeof en` and registered in `de/index.ts`). The
typecheck fails until both languages have exactly the same keys. In pages use `const { t, f } = await getI18n()`
(`@/i18n/server`), in client components `useI18n()` (`@/i18n/client`), and format numbers and dates with `f`
(`f.isk`, `f.compact`, `f.relativeTime`, …) — the English helpers in `@/lib/format` are for logs and exports only.

## 6. Live alerts (optional)

A module can announce new events live, the way the killboard announces kills and losses and EVE mail announces new
mail. Users get a switch for every alert they may receive in the top bar's **Alerts** menu. In a tab they are
looking at, alerts show as toasts; with desktop notifications on, they show as system notifications while Keystar
is in the background. The shared engine handles polling, the per-browser switches, focus, cross-tab
de-duplication and desktop notifications. A module supplies four pieces:

1. **Declaration** in the manifest. Its `label` and `hint` appear in the Alerts menu:
   ```ts
   alerts: [
     {
       id: "skills.queue", // <module>.<name>
       label: (t) => t.skills.module.alerts.queue.label,
       hint: (t) => t.skills.module.alerts.queue.hint,
       anyPermission: ["skills.view.own"],
       available: (settings) => true, // optional extra condition on the app settings
     },
   ],
   ```
2. **Query and endpoint**: a route such as `src/app/api/skills/live/route.ts` that answers `GET ?since=<cursor>`
   with `{ events, cursor }`. Without a valid `since`, it returns no events and `liveCursorNow()`, so a fresh page
   never replays old events. Cursors come from `src/core/live-cursor.ts`: the row's `first_seen_at` plus an id,
   formatted with `CURSOR_FORMAT` and compared as `(first_seen_at, id) > (cursor)`. The table needs a
   `first_seen_at` column for this. Also leave out old rows (a first import or backfill) and check permissions
   like any API route. `getLiveEvents` (killboard) and `getLiveMail` (social) are worked examples.
3. **Feed component**: a client component that calls `useLiveFeed` (`src/components/shell/live-feed.ts`) with
   the endpoint, a poll interval, a `claimsKey` (localStorage), `idOf`, `onToasts` (keep a list and render
   `<Toast>`s in a `<ToastViewport>`) and `native` (title, body, icon, tag and click action of the desktop
   notification). See `src/modules/social/components/live-mail.tsx`.
4. **Registration** of the feed under the alert's id in `src/modules/alerts.ts`. `tests/alerts.test.ts` fails when
   a declared alert has no feed or a feed has no declaration.

## Checklist

- [ ] Manifest registered in `MODULES`
- [ ] Schema exported from `src/core/db/index.ts`, migration generated
- [ ] Jobs registered in `src/modules/jobs.ts`
- [ ] Pages check permissions; member views scoped to own characters
- [ ] New scopes added to the EVE application and listed in `docs/deployment.md`
- [ ] Texts in both dictionaries (`src/i18n/messages/en` and `de`), no hard-coded UI strings
- [ ] Live alerts (if any) declared in the manifest and their feeds registered in `src/modules/alerts.ts`
- [ ] Tests for parsing/aggregation logic (`tests/`)
- [ ] ROADMAP.md updated
