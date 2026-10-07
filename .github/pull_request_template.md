<!-- One closing keyword per issue this fixes or implements (Closes #14). Delete the line if there is none. -->
Closes #

## What and why

<!-- What changes for users or server admins, and why. The diff shows how; only add what a reviewer can't see in it. -->

## Testing

<!-- CI runs lint, typecheck, tests and the migration check. Say what else you checked: integration tests with
     TEST_DATABASE_URL, the page with demo data (pnpm demo:seed), screenshots for UI changes. -->

## Release

<!-- See docs/releasing.md. -->
- [ ] CHANGELOG.md entry under `## [Unreleased]` (no issue? link the PR in a follow-up commit), or: no user-facing
  change
- [ ] Needs action on the server when updating (new ESI scope, `.env` variable, compose change)? Then it's under
  `### Upgrade notes`
