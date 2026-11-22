# Notes for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It has every rule CI enforces.

## Commands

```bash
npm ci              # install
npm run dev         # dev server
npm run check       # the local part of PR CI; run before every pull request
npm run check-all   # every job that can run locally
npm run lint        # ESLint (--max-warnings 0) and prettier --check
npm run hooks       # every pre-commit hook on every file (needs pre-commit)
npm run format      # prettier --write
npm run typecheck   # tsc for the app, and for src/engine without DOM types
npm run unit        # Vitest with coverage gates
npm run coverage    # diff-cover, 100% on changed lines (needs uv)
npm run docs        # markdownlint and a link check on changed Markdown
npm run links-all   # the link check on every Markdown file (nightly)
npm run mutation    # Stryker on src/engine, 90% killed or more (nightly)
npm run generate-data -- <spec> <dir> # a level spec as SQL for psql
npm run author-level # CI only: every level file, from PostgreSQL
npm run check-filters # every file matches a group in .github/filters.yml
npm run check-lockfile # every lockfile URL is on registry.npmjs.org
npm run pr-size     # CI only: size label for a pull request
npm run pr-hygiene  # CI only: pull request rules
npm run build       # production build into dist/; settings below
```

## Build settings

`vite build` reads these environment variables; the deploy sets them.

- `SITE_URL`: the public address, for link previews. Default
  `https://beat-the-optimizer.pages.dev`.
- `GOATCOUNTER_CODE`: the GoatCounter site code. Unset, nothing is counted.
- `CF_BEACON_TOKEN`: the Cloudflare Web Analytics token. Unset, there is no
  beacon.

The build writes `dist/_headers` with a Content-Security-Policy that allows
only the analytics hosts in use ([ADR 0004](docs/adr/0004-measure-return-with-goatcounter.md)).

## Layout

- `src/engine/`: the pure TypeScript engine and cost model. No DOM, no Node APIs
  and no runtime dependencies; 100% line and branch coverage.
- `src/`: the web app, in TypeScript with no framework: `src/ui/` builds the
  DOM with `el()` from `src/ui/dom.ts`, and `src/levels.ts` lists the levels in
  play order. It uses the engine only through `src/engine/index.ts` (ESLint
  enforces it). Today's puzzle comes from `src/daily.ts` (launch date and
  rotation); `?level=<id>` opens a level for practice. Progress is in
  localStorage through `src/progress.ts`, which works without storage.
  `src/analytics.ts` sends the anonymous visit and return counts, and
  `privacy.html` (`/privacy`) says what is stored and sent. `about.html`
  (`/about`) explains the scoring and its limits for players.
- `tests/`: test setup and cross-cutting tests.
- `e2e/`: Playwright browser and accessibility tests against `vite preview`.
- `authoring/`: the level authoring pipeline (MIT), run by Node: specs in
  `levels/specs/` (format in `docs/level-spec.md`) become level files; 100%
  line and branch coverage.
- `scripts/`: repository tooling in TypeScript, run directly by Node; logic in
  `scripts/lib/` is unit-tested and covered.
- `.github/filters.yml`: CI path filters. A new folder needs a filter group in
  the same pull request.
- `schema/`: the JSON Schemas of level files and level specs (MIT). The formats
  are in `docs/level-format.md` and `docs/level-spec.md`, and the cost model in
  `docs/cost-model.md`.
- `levels/`: level content, **all rights reserved**. Do not create or edit level
  content unless the maintainer asks.
- `docs/adr/`: architecture decision records.

## Rules

- Anything that needs PostgreSQL runs only in GitHub Actions. Do not start
  Docker or install a database locally.
- Tests fail on `console.warn` and `console.error`.
- Never lower a coverage threshold, skip a test or add a broad exclusion to make
  CI pass.
