# Releasing Keystar

Keystar's version lives in `package.json`. Merging a pull request into `main` releases nothing: `main` may carry
unreleased work, and a release is cut only when you start one by hand.

## Pull requests

Describe user-facing changes under `## [Unreleased]` at the top of [CHANGELOG.md](../CHANGELOG.md), sorted into
`### Added`, `### Changed`, `### Removed`, `### Fixed` and `### Security`. Leave the version in `package.json` alone.

Each entry is one bullet that starts with a short bold headline saying what changed, followed by a sentence or two.
Put further details in sub-bullets rather than a long paragraph. A large feature gets one entry with a sub-bullet
group per area.

When an entry fixes or implements a GitHub issue, end it with the issue number in parentheses, as a link so it is
clickable both in CHANGELOG.md and in the release notes. Several issues share one pair of parentheses:
`([#14](https://github.com/Theragus/Keystar/issues/14), [#18](https://github.com/Theragus/Keystar/issues/18))`.
An entry without an issue links its pull request instead, with a `PR` prefix so the number isn't mistaken for an
issue: `([PR #133](https://github.com/Theragus/Keystar/pull/133))`. The number only exists once the pull request is
open, so add the link in a follow-up commit on the same branch.

```markdown
## [Unreleased]

### Fixed
- **Sign-in redirect.** Sign-in could redirect to another site when `returnTo` contained a tab.
  ([#14](https://github.com/Theragus/Keystar/issues/14))
- **Table headers.** Right-aligned column headers now line up with their values.
  ([PR #133](https://github.com/Theragus/Keystar/pull/133))
```

## Cutting a release

1. Prepare the release on `main` (directly or in a small release pull request):

   ```bash
   pnpm release:prepare          # picks the next version from the Unreleased section (see below)
   pnpm release:prepare patch    # or minor, major, or an exact version such as 0.2.0
   ```

   While Keystar is below 1.0:
   - a release with new features bumps the minor number and resets the patch (0.1.5 → 0.2.0),
   - a release with only fixes bumps the patch number (0.2.0 → 0.2.1),
   - a change that needs action on the server when updating (a new or renamed `.env` variable, an edit to the
     compose file, characters to re-link for new ESI scopes) also bumps the minor number; spell out the steps under
     `### Upgrade notes` at the top of its CHANGELOG section.

   Without an argument the script bumps the patch number when the Unreleased section only has `### Fixed` and
   `### Security` entries, and the minor number otherwise; it never picks a major bump. Pass the bump explicitly
   when that guess is wrong. It then sets `"version"` in `package.json`, renames `## [Unreleased]` to the
   version and today's date, and adds a fresh empty `## [Unreleased]` above it. It refuses to run when the Unreleased
   section is empty. It commits nothing; review the diff, commit and push. (The same edits by hand work too.)

   ```markdown
   ## [Unreleased]

   ## [0.2.0] - 2026-10-20

   ### Added
   - …
   ```

   For a release with new features, also add its **What's new highlights**: the dialog that each account sees once,
   on its next visit after the update (see "What's new highlights" below). The script reminds you.

2. Wait for CI to pass on that commit on `main`, then open the Actions tab → **Release** → **Run workflow** (on
   `main`). The workflow (`.github/workflows/release.yml`) checks that `v0.2.0` doesn't exist yet and that CI passed
   on the commit, then:
   - builds the Docker image and pushes `ghcr.io/theragus/keystar:0.2.0`, `:0.2` and `:latest`. `:latest` only moves
     when the version is newer than every earlier release, and `:0.2` when it is the newest `0.2.x`, so a fix for an
     older line (e.g. `0.1.6` after `0.2.0`) gets its own tags without moving them back; the GitHub release is then
     not marked *Latest* either,
   - creates the `v0.2.0` tag and a GitHub release whose notes are that CHANGELOG section.

   If the version is already tagged, CI hasn't passed yet or the CHANGELOG section is missing, the workflow stops
   with an error and publishes nothing. A failed release (e.g. a registry outage) is retried the same way.

The version shows in the sidebar footer, in System Info and in `GET /api/health`. In the sidebar footer it opens the
release's What's new when the release has highlights, and links to the release notes otherwise.

## What's new highlights

After an update, each account sees a short **What's new** dialog once (new accounts get the welcome tour instead):
the release's most important additions as cards, each with an icon, a "New" or "Improved" badge, a sentence or two
and a link to its page, and a button to the release's GitHub page with the full notes. Pick 2–4 entries from the
release's `### Added` and `### Changed` sections that members will notice; fixes stay in the release notes.

1. Add the texts to `whatsNew.releases` in `src/i18n/messages/en/whats-new.ts` and, translated, in
   `src/i18n/messages/de/whats-new.ts`:

   ```ts
   "0.15.0": {
     items: {
       helpTour: { title: "Help and welcome tour", body: "Press ? on any page …" },
     },
   },
   ```

   Titles are a few words; bodies one or two sentences that say what you can do now, not how it was built.
2. Add the same keys to `RELEASES` in `src/core/help/releases.ts`, in display order:

   ```ts
   "0.15.0": {
     helpTour: { icon: CircleHelp, kind: "new", href: "/" },
   },
   ```

   `href` must be a sidebar page; it gets the card's "Open" link and a "New" dot in the sidebar until each member
   opens it. Give `anyPermission` the permissions of that nav item, so a highlight is only shown to members who can
   use it (a corporation-wallet feature isn't news to a member).
3. If the release has `### Upgrade notes`, add `upgrade` next to `items` with a one- or two-sentence summary of what
   whoever runs the server has to do. Admins see it as "Action needed" with a link to the release notes.

The typecheck fails when a highlight is missing on either side or in either language, and `tests/whats-new.test.ts`
checks that each release with highlights has a CHANGELOG section, that `upgrade` matches its upgrade notes, that
every `href` is a sidebar page and every permission exists. A release without highlights (e.g. a patch release)
still records the version, so nothing opens. Old releases can be removed from both files when they no longer
matter; an account that skipped them then sees fewer cards.

## Trying unreleased changes

Every commit on `main` that passes CI is also published as `ghcr.io/theragus/keystar:main` (and
`:sha-<commit>`) by the **Main image** workflow (`.github/workflows/main-image.yml`). Set `KEYSTAR_VERSION=main` on a
test server to follow it. `main` can be unstable; its sidebar footer shows the last released version together with the
image tag and commit it was built from (e.g. `Keystar v0.12.0 · main @ c7bfb85`) on an amber warning badge, and
links to that commit. `:latest` and the version tags only ever point at releases.

## One-time setup

- **Package visibility:** the first published image is private. Open the package
  (github.com/users/theragus/packages/container/keystar) → *Package settings* → *Change visibility* → **Public**,
  so servers can `docker compose pull` without logging in.
- Images are built for `linux/amd64`. For ARM servers, add `linux/arm64` to `platforms` in the workflow (the build
  then takes considerably longer).

## Installing a release

On the server, in the Keystar checkout:

```bash
# .env: KEYSTAR_VERSION=0.2.0   (or "latest" to always take the newest release)
git pull                          # compose file and docs of the new version
docker compose pull
docker compose up -d
```

Database migrations run when the `app` container starts. To build from the checkout instead of pulling an image:
`docker compose up -d --build`.
