<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Keystar — project notes

Self-hosted EVE Online corporation dashboard. Next.js 16 app + a separate Node worker, PostgreSQL via Drizzle.

- Architecture: `docs/architecture.md`. Adding features: `docs/modules.md` (modules declare scopes, permissions, jobs, nav).
- Auth/permissions go through `src/core/auth/dal.ts` (`requirePermission` in pages, `assertPermission` in server actions).
- All ESI traffic goes through `src/core/esi/client.ts` (compatibility date, caching, rate limits). Background ESI calls belong in jobs (`src/modules/jobs.ts`), not in pages.
- zKillboard traffic goes through `src/modules/killboard/zkill.ts` (User-Agent, request spacing); reuse it rather than calling zKillboard directly.
- Schema changes: edit the Drizzle schema, then `pnpm db:generate --name <change>`; never hand-edit generated migrations.
- UI text lives in the dictionaries (`src/i18n/messages/en` is the source, `de` must match key for key); read it with `getI18n()` (server) or `useI18n()` (client) and format numbers/dates with its `f`. No hard-coded UI strings. See "Languages" in `docs/architecture.md`.
- Chart colours are validated for colour-vision safety (`src/modules/mining/class-colors.ts`); don't add hues ad hoc.
- Checks before committing: `pnpm lint && pnpm typecheck && pnpm test` (set `TEST_DATABASE_URL` to a throwaway database to include integration tests).
- Releases: in a PR, add CHANGELOG.md entries under `## [Unreleased]` (an entry that fixes or implements an issue ends with it as a link in parentheses, `([#14](https://github.com/Theragus/Keystar/issues/14))`; an entry without an issue links its PR instead, `([PR #133](https://github.com/Theragus/Keystar/pull/133))`, added in a follow-up commit once the PR is open) and leave `version` in package.json alone. Merging to main releases nothing; releases are cut by hand (`pnpm release:prepare` picks the bump, commit, then Actions → Release → Run workflow — `docs/releasing.md`).
- Issue links: a PR that fixes or implements an issue says so in its description, one closing keyword per issue (`Closes #14`), so GitHub links the issue while the PR is open and closes it on merge. A `Fixes #14` in a commit message is not enough: the link only appears once the commit reaches main, and a squash merge can drop it. If the PR is opened from the "Create PR" button rather than by you, the generated description won't carry it; add it with the GitHub tools after the PR exists.
- Demo data: `KEYSTAR_DEMO_MODE=true pnpm demo:seed`, then sign in via the demo buttons on /login.
