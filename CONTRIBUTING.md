# Contributing to Keystar

## Issues, ideas and the roadmap

Everything starts as an issue; pick the matching form when you
[open one](https://github.com/Theragus/Keystar/issues/new/choose):

- **Bug report**: something is broken.
- **Feature request or idea**: something new or better. Rough ideas are fine. If the idea already exists, add a 👍
  instead; votes help decide what comes next.
- **Question or help**: setting up or using Keystar.
- **Security problems** are reported [privately](SECURITY.md), never as a public issue.

New issues land on the [Keystar Roadmap](https://github.com/Theragus/Keystar/projects) project as **Idea**. When one is
accepted it moves to **Planned** with a horizon (Now / Next / Later), then **In progress** and **Done**. Ideas that
won't be built are closed as *not planned* with a short reason. Larger features are split into sub-issues.

[ROADMAP.md](ROADMAP.md) still lists older plans and ideas; they move to issues over time and get an issue link when
they do.

## Pull requests

Getting a development setup running is described under [Develop](README.md#develop). Before you start on something
larger, comment on the issue so work isn't duplicated.

- New features are built as modules ([docs/modules.md](docs/modules.md)); [docs/architecture.md](docs/architecture.md)
  explains how the pieces fit together.
- UI text goes into the dictionaries in `src/i18n/messages`: English is the source, German must match key for key.
- Schema changes: edit the Drizzle schema, then `pnpm db:generate --name <change>`. Never hand-edit generated
  migrations.
- Run `pnpm lint && pnpm typecheck && pnpm test` before pushing.
- Describe user-facing changes in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` and leave the version in
  `package.json` alone ([docs/releasing.md](docs/releasing.md)).
- If the pull request fixes or implements an issue, say so in its description with one closing keyword per issue
  (`Closes #14`).
- New pull requests start from the [template](.github/pull_request_template.md): what changes and why, how you tested
  it beyond CI, and the changelog and upgrade notes.
