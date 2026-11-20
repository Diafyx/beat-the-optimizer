# Contributing to Beat the Optimizer

Thanks for your interest. This guide lists every rule that CI enforces, so a
failing check should never surprise you.

## Principles

1. Nothing reaches `main` except through a pull request.
2. Every pull request starts from an issue. Bot PRs (Dependabot, the release
   bot) are the only exception.
3. Every issue belongs to a milestone, and every release is a closed milestone.
4. CI is the source of truth. `npm run check` runs the same scripts as the CI
   jobs, so local and CI results do not drift.
5. Anything that needs PostgreSQL (level authoring and its checks) runs only in
   CI. You never need Docker or a local database.
6. When the project grows, CI grows in the same pull request.
7. Rules are enforced by tooling wherever possible.

## Questions, bugs and ideas

- Questions go to [Discussions](https://github.com/Diafyx/beat-the-optimizer/discussions).
- Bugs and feature requests use the issue forms. Blank issues are disabled.
- Security problems are reported privately; see [SECURITY.md](SECURITY.md).

Issue titles are short and imperative, for example `Show the cost of each
join`. A bug title describes the symptom, not the guessed cause.

## Levels are not open for contributions

Everything in `levels/` (level files, level specs, stories and explanations) is
all rights reserved; see [`levels/LICENSE`](levels/LICENSE). Pull requests that
add or change level content are closed. You are welcome to open an issue if a
level looks wrong or unfair.

## Setup

1. Install Node.js 22 (22.18 or later), 24 or 26. `.nvmrc` names the version
   the maintainer uses. Scripts in `scripts/` are TypeScript that Node runs
   directly, which needs 22.18 or later.
2. Install dependencies with `npm ci`.
3. Optional but recommended: install [pre-commit](https://pre-commit.com/) and
   run `pre-commit install`. The hooks run the fast checks on staged files:
   end-of-file and trailing whitespace fixes, check-yaml, typos, actionlint,
   zizmor, ESLint and Prettier.
4. For `npm run coverage` and `npm run hooks`, install
   [uv](https://docs.astral.sh/uv/) and pre-commit. CI installs both itself.
5. For the browser checks (`e2e`, `a11y`, `lighthouse`), install Playwright's
   browsers with `npx playwright install chromium firefox webkit`. On Linux,
   WebKit also needs system libraries, which
   `sudo npx playwright install-deps webkit` installs.

## Local checks

```bash
npm run check       # the local part of PR CI
npm run check-all   # every job that can run locally
```

Every CI job calls an npm script of the same name, so you can run any job on
its own:

| Script           | What it runs                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| `lint`           | ESLint with `--max-warnings 0`, then `prettier --check`                  |
| `hooks`          | Every pre-commit hook on every file (typos, actionlint, zizmor and more) |
| `typecheck`      | `tsc --strict` for the app, and again for `src/engine` without DOM types |
| `unit`           | Vitest with coverage gates                                               |
| `coverage`       | diff-cover: 100% coverage of the lines changed since `origin/main`       |
| `levels`         | Every level file in `levels/` against the schema and the format's rules  |
| `docs`           | markdownlint on every Markdown file, then a link check on changed ones   |
| `check-filters`  | Fails if a file matches no group in `.github/filters.yml`                |
| `check-lockfile` | Fails if a `package-lock.json` URL is not on `registry.npmjs.org`        |
| `e2e`            | Playwright on Chromium, Firefox, WebKit and a mobile viewport            |
| `a11y`           | axe (WCAG 2.2 A and AA) on desktop Chromium and the mobile viewport      |
| `lighthouse`     | Lighthouse CI on mobile, budgets in `lighthouserc.json`                  |
| `bundle-size`    | Gzipped JavaScript in `dist/` within 60 kB                               |
| `mutation`       | Stryker on `src/engine`, at least 90% of mutants killed (nightly)        |
| `links-all`      | The link check on every Markdown file (nightly)                          |
| `build`          | Production build into `dist/`                                            |
| `pr-size`        | CI only: counts the changed lines and sets the `size/*` label            |
| `pr-hygiene`     | CI only: checks the pull request rules below through the GitHub API      |

`pr-size` and `pr-hygiene` need a pull request and a GitHub token, so they run
only in CI; their rules are in `scripts/lib/pr-size.ts` and
`scripts/lib/pr-rules.ts`, and `npm run unit` tests them.

## Branches

- `main` is the only long-lived branch.
- Branch names are `<type>/<issue-number>-<short-slug>`, for example
  `feat/12-share-card` or `fix/31-wrong-index-cost`. CI checks the pattern.
- To bring a branch up to date, merge `main` into it (or use the "Update
  branch" button). Do not rebase and force-push.
- Branches are deleted automatically after merge.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) for branch
  commits too. They become the body of the squashed commit.
- `main` accepts only signed commits. The squash commit that GitHub creates on
  merge is signed by GitHub, so your branch commits are fine either way, but
  signing them is encouraged.
- No attribution trailers (`Co-authored-by`, `Assisted-by`, `Generated-by`).
- Never commit secrets or `.env` files.
- `package-lock.json` is committed, and every package in it resolves from
  `registry.npmjs.org`. The project `.npmrc` sets that registry, overriding a
  mirror in your own npm config, and `check-lockfile` (in the `lint` job)
  fails on any other URL.

## Pull requests

**Title**: `type(scope): summary`, following Conventional Commits.

- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `build`,
  `chore`, `revert`.
- Scopes: `engine`, `levels`, `authoring`, `ui`, `share`, `analytics`,
  `deploy`, `ci`, `docs`, `release`, plus `deps` for dependency updates.
- A breaking change adds `!`, for example `feat(engine)!: ...`, and gets the
  `breaking-change` label.
- The title becomes the squash commit subject, so it drives the changelog and
  the version bump.

**Body**: use the pull request template and keep every heading. Write "No" or
"N/A" rather than deleting one. The body must contain `Closes #N` (or `Fixes`
or `Resolves`) for an open issue.

**Labels and milestone**: one `type/*` label matching the title type, at least
one `area/*` label, and the milestone of the linked issue. The maintainer adds
them for pull requests from forks. CI sets the `size/*` label.

**Scope**: one pull request normally closes one issue. Up to three closely
related small issues may share a pull request.

**Merging**: squash merge only, done by the maintainer after all required
checks pass and all conversations are resolved. Auto-merge is disabled.

### Size

Size counts lines added plus lines deleted. Files marked `linguist-generated`
in `.gitattributes` (the lockfile and generated level files) do not count.

| Label      | Lines changed | Rule                                                                              |
| ---------- | ------------- | --------------------------------------------------------------------------------- |
| `size/S`   | up to 100     | Fine, but consider bundling it with related work                                  |
| `size/M`   | 101 to 300    | Target                                                                            |
| `size/L`   | 301 to 700    | Target                                                                            |
| `size/XL`  | 701 to 1500   | Allowed                                                                           |
| `size/XXL` | over 1500     | Allowed only with a filled-in "Why is this PR large?" section; CI fails otherwise |

## What CI checks

The `main` branch ruleset requires, before a pull request can merge:

- the checks `pr-hygiene` and `ci-gate`, reported by GitHub Actions;
- a branch that is up to date with `main` (use "Update branch" or merge
  `main` in);
- CodeQL code scanning results with no new alert of high severity or above
  and no new error;
- all review conversations resolved, and squash merge.

It also blocks force pushes and deletion of `main`, and requires signed
commits and a linear history there. Only repository and organization admins
can bypass these rules, and only on a pull request; a bypass is an emergency
measure, and the pull request gets the `emergency-bypass` label with a comment
explaining why.

**`pr-hygiene`** checks the title format, the branch name, the issue link (an
open issue), the `type/*` and `area/*` labels, the `breaking-change` label
against the `!` in the title, the milestone of the linked issue, the template
headings and the result of `pr-size`. It runs again when you edit the title or
description, push, or change labels or the milestone, and its job summary says
what to fix. Bot PRs skip the issue-link, milestone, branch-name and template
checks.

The `pr-size` job, in the same workflow, counts the changed lines and keeps
exactly one `size/*` label on the pull request, updating it on every push. It
fails a `size/XXL` pull request whose "Why is this PR large?" section is empty
or "N/A". A pull request from a fork has a read-only token, so its size is
checked but not labelled.

**`ci-gate`** passes only when every CI job either passed or was skipped
because the path filters said it was not needed:

- **Path filters** live in `.github/filters.yml`. Changes to shared inputs
  (the `shared` group: `.github/**`, `package.json`, `package-lock.json`,
  `.npmrc`, `.gitattributes` and the tool configuration files) run every job.
- **No file escapes the filters**: `check-filters` (in the `lint` job) fails if
  any file matches no filter group. If you add a folder, add it to a filter group in
  the same pull request.
- **Full runs** happen on every push to `main`, nightly, before every release,
  on manual runs and on any pull request labelled `ci:full`.
- **Docs-only** pull requests still run `lint`, `docs`, `pr-hygiene` and the
  gate.

**Gates that fail the build:**

| Gate                                              | Threshold                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Line and branch coverage, `src/engine`            | 100%                                                                                                                       |
| Line and branch coverage, `authoring`             | 100%                                                                                                                       |
| Line and branch coverage, whole project           | 95% or more                                                                                                                |
| Diff coverage (lines changed in the pull request) | 100%                                                                                                                       |
| Warnings                                          | Errors: ESLint `--max-warnings 0`; a `console.warn` or `console.error` in a test fails it                                  |
| Types                                             | `tsc --strict` with no errors                                                                                              |
| Formatting and spelling                           | Prettier, typos, markdownlint                                                                                              |
| Workflows                                         | actionlint and zizmor                                                                                                      |
| Level files                                       | Schema, solvable, stored costs match a recomputation, stored optimizer plan matches its metadata                           |
| Level authoring                                   | Pull requests touching `authoring/` or `levels/` regenerate the levels against PostgreSQL in CI and fail on any difference |
| Browsers                                          | Playwright end-to-end tests pass on Chromium, Firefox, WebKit and a mobile viewport                                        |
| Accessibility                                     | No serious or critical axe violations                                                                                      |
| Performance                                       | Lighthouse CI budgets on mobile (`lighthouserc.json`) and 60 kB of gzipped JavaScript                                      |
| Mutation score, `src/engine` (nightly)            | 90% or more of mutants killed; a drop below fails the nightly run and opens an issue                                       |

Each coverage exclusion comment needs a reason on the same line.

### Security scanning and dependency updates

- **CodeQL** (`codeql.yml`) analyses the TypeScript and the workflow files on
  every pull request, on pushes to `main` and weekly. It is an advanced setup,
  so the repository's CodeQL default setup stays off; the two cannot run
  together.
- **OpenSSF Scorecard** (`scorecard.yml`) runs on pushes to `main` and weekly.
  Results are published to scorecard.dev (the README badge) and shown in code
  scanning.
- **Dependabot** (`.github/dependabot.yml`) proposes npm and GitHub Actions
  updates every Monday, only for versions public for at least a week. Minor
  and patch updates are grouped into one pull request per ecosystem, and each
  major update has its own. Titles start with `build(deps)` or `ci(deps)` and
  the labels are set, so these pull requests pass `pr-hygiene`. They are never
  merged automatically. A `@playwright/test` update also needs the e2e
  container image in `ci.yml` (tag and digest) to match; a unit test fails
  until it does. Two majors are ignored: `@types/node`, which stays on
  the oldest supported Node (22), and `typescript` until typescript-eslint
  supports TypeScript 7.
- **Overrides**: when a development tool depends on a vulnerable package and
  has no fixed release yet, `overrides` in `package.json` pins a patched
  version, and the override is removed once the tool catches up. Today: `glob`
  14 under `linkinator` and `minimatch` 11 under `@stryker-mutator/core`
  (minimatch advisory), `qs` 6.16 under `typed-rest-client` (Stryker) and
  `katex` 0.18 under `micromark-extension-math`.

### Scheduled workflows

Both run on `main` and can be started by hand from the Actions tab. Neither is
a required check.

- **Nightly** (`nightly.yml`, daily): every CI job (`ci.yml` with
  `full: true`), Stryker mutation testing of `src/engine` (`npm run mutation`,
  report in the `mutation` artifact) and the link check on every Markdown file
  (`npm run links-all`).
- **Canary** (`canary.yml`, weekly): type check, unit tests and build on the
  newest Node.js release. Node.js now has a Current line only from a major's
  release in April until its LTS promotion in October; the rest of the year
  the newest release is the `.nvmrc` version and the canary repeats the unit
  job. The authoring run against the next PostgreSQL major joins it once the
  authoring pipeline exists.
- **Failures**: the `report` job opens one issue per workflow, titled
  "Nightly workflow failed" or "Canary workflow failed" and labelled
  `type/ci`, `area/ci` and `status/triage`. Later failures comment on that
  issue while it is open; close it when the workflow passes again. To test
  this, start a run by hand with **force-failure** checked.
- **One run at a time**: each workflow keeps at most one run waiting behind
  the running one, so a newly queued run cancels the one already waiting.
  When starting runs by hand, wait for one to start before queuing the next.

## Tests

- The engine is pure TypeScript in `src/engine`: no DOM, no Node APIs and no
  runtime dependencies. Unit tests and fast-check property tests cover it. The
  key invariant is that the best plan never costs more than the optimizer's
  plan.
- A bug fix includes a test that fails without the fix.
- Test order is shuffled. Vitest prints the seed, so you can rerun a failing
  order with `npx vitest run --sequence.seed=<seed>`.
- A test that expects a console warning spies on the console itself, for
  example `vi.spyOn(console, 'warn').mockImplementation(() => {})`.
- Browser tests live in `e2e/` and run against the production build served
  by `vite preview`. They fail if the page logs a console error or throws.
  Accessibility specs carry `@a11y` in their name and run with `npm run a11y`.
- **Flaky tests are never retried silently.** Label the issue `flaky`, and
  quarantine the test by adding `@flaky` to its name until it is fixed.

## Labels

Labels are defined in `.github/labels.yml` and synced by a workflow. Do not
create labels by hand.

| Group    | Labels                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type     | `type/feature`, `type/bug`, `type/perf`, `type/refactor`, `type/test`, `type/docs`, `type/ci`, `type/build`, `type/chore`, `type/security`       |
| Area     | `area/engine`, `area/levels`, `area/authoring`, `area/ui`, `area/share`, `area/analytics`, `area/deploy`, `area/ci`, `area/docs`, `area/release` |
| Size     | `size/S`, `size/M`, `size/L`, `size/XL`, `size/XXL`                                                                                              |
| Priority | `priority/P0` (drop everything), `priority/P1` (this milestone), `priority/P2` (nice to have)                                                    |
| Status   | `status/triage`, `status/blocked`, `status/needs-decision`                                                                                       |
| Other    | `breaking-change`, `good first issue`, `help wanted`, `dependencies`, `flaky`, `ci:full`, `emergency-bypass`                                     |

Title type to label: `feat` → `type/feature`, `fix` → `type/bug` (or
`type/security`), and the other types map by name. A `revert` takes the label
of what it reverts.

Every issue has one `type/*`, at least one `area/*`, a `size/*` estimate, a
`priority/*` label and a milestone. New issues start with `status/triage`
until the maintainer triages them. Issues estimated `size/XL` or larger are
split into sub-issues. Deferring an issue means moving it to a later milestone
with a comment saying why.

## Releases

- One milestone per release (`v0.1.0`, `v0.2.0`, ...). A release happens only
  when its milestone has no open issues.
- Versions follow semantic versioning. Before 1.0, `feat` and breaking changes
  bump the minor version, and `fix` and `perf` bump the patch version.
- [release-please](https://github.com/googleapis/release-please) keeps a
  release pull request up to date with the version bump and `CHANGELOG.md`.
  The changelog is generated; do not edit it by hand.
- When the maintainer merges the release pull request, the same workflow tags
  the release, runs the full test suite, and deploys the site to Cloudflare
  after the maintainer approves it.
- Every pull request from this repository gets a preview deployment. Pull
  requests from forks and from Dependabot do not, because they have no access
  to secrets.
- Deployments use two GitHub environments. `preview` has no protection.
  `production` needs the maintainer's approval and accepts deployments only
  from `main` and from `v*` tags.

## Code of Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
