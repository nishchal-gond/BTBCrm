# Contributing

This is a private product repository. A change to a decision is proposed as a
short note in [`adrs/`](./adrs/). A change to code is a pull request. Lead with
why, and keep the diff small enough to hold in your head.

Report security vulnerabilities privately. See [`SECURITY.md`](./SECURITY.md).

## Running it

```sh
cp .env.example .env      # fill in ALLOWED_SIGN_IN and one identity provider
bun install
docker compose up -d
bun run db:deploy && bun run db:seed
bun run dev
```

## Before you push

```sh
bun run check-types
bun run lint
bun run lint:slop
bun run test
```

CI runs the same four. `test` runs the packages serially because the integration
tests share one database. Do not raise the concurrency without giving each
package its own database.

Things that trip people up:

- **The tRPC router type is generated, and committed.** If the app cannot see a
  procedure you added, run `bun run --filter=api trpc:generate` and commit
  `apps/api/src/generated/server.ts` with the router change.
- **Schema changes need a migration**, not `db:push`. `bun run db:migrate`
  creates one.
- **New environment variables need three homes.** `.env.example`,
  `apps/api/src/config/env.validation.ts` if the API reads it, and
  `globalPassThroughEnv` in the root `turbo.json`.

## Shipping a change

**Start from `main`.** `release` is the default branch so that a plain clone runs
the last tagged release. Nothing merges into `release` by hand: the Release
workflow fast-forwards it onto each tag.

```
push a branch ──▶ a pull request into main opens by itself
                        │
                  CI runs; the title follows the diff as you push
                        │
                  ◀── click 1: squash into main
                        │
        release-please opens `chore(main): release x.y.z`
                        │
        ◀── click 2: tag, notes, CHANGELOG.md, and the tag lands on release
```

**The pull request title is the release note.** The repo squashes, so the title
becomes the commit subject on `main` and the changelog line. It has to be a
[Conventional Commit](https://www.conventionalcommits.org/):

| Title | Bump | Appears under |
| --- | --- | --- |
| `feat(app): …` | minor | Features |
| `fix(db): …` | patch | Fixes |
| `perf:`, `refactor:`, `docs:`, `revert:` | patch | their own heading |
| `feat(db)!: …` | major | Features, flagged as breaking |
| `chore:`, `ci:`, `test:`, `build:`, `style:` | none | nothing |

`.github/scripts/pr-title.sh` writes the title from the diff when the pull
request opens and rewrites it on every push. Retitle it yourself and it stops.
The script uses the `ANTHROPIC_API_KEY` secret when present and falls back to
the changed paths and the branch name.

## Releases

Merging the release pull request writes `CHANGELOG.md`, bumps the version, tags
the release, publishes the GitHub Release, then opens and merges a pull request
from `main` into `release`. `release` carries a ruleset that requires a pull
request, so the workflow never pushes to it directly.

- A run of `chore:` and `test:` commits bumps nothing, so no release pull
  request appears, and those commits do not reach `release` until the next
  release carries them. If something has to ship, a `fix:` is the floor.
- A pull request opened by `GITHUB_TOKEN` cannot trigger workflows. Set an
  `AUTOMATION_TOKEN` secret (a PAT or GitHub App token) so the automated pull
  requests run CI like any other.
- `workflow_dispatch` is enabled on the Release workflow. Re-run it from the
  Actions tab after you fix a jam.

If release-please reports `There are untagged, merged release PRs outstanding`,
create the tag and GitHub Release at that pull request's merge commit, then swap
its `autorelease: pending` label for `autorelease: tagged`.

## House style

- [`AGENTS.md`](./AGENTS.md) — the rules that apply to everything, and where the others live.
- [`docs/design.md`](./docs/design.md) — UI. `packages/ui` is the only place components come from.
- [`docs/api.md`](./docs/api.md) — logging, tRPC, caching, and why intelligence never lives in the API.

**Nothing about a person is guessed.** A confidently wrong fact about a real
client is worse than a blank field, because nobody can tell it is wrong.
