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
npm run build-app   # the Android app's copy of the site into dist-app/; needs SITE_URL
npm run smoke       # CI only: the smoke test against the live site at SMOKE_URL
npm run screenshots # the README screenshots and the link preview (e2e/*.shots.ts)
```

## Build settings

`vite build` reads these environment variables. The deploys set them from
the variables of the GitHub environment (CONTRIBUTING.md, "Releases").

- `SITE_URL`: the public address, for link previews and canonical URLs.
  Default `https://beat-the-optimizer.invalid`, which never resolves, so
  production must set it. The app build (`--mode app`) has no default: its
  pages are served from `https://localhost`, so its share card links here,
  and its links to the other pages end in `.html`
  (`scripts/lib/app-build.ts`).
- `GOATCOUNTER_CODE`: the GoatCounter site code. Unset, nothing is counted.
- `CF_BEACON_TOKEN`: the Cloudflare Web Analytics token. Unset, there is no
  beacon.

The build writes `dist/_headers` with a Content-Security-Policy that allows
only the analytics hosts in use ([ADR 0004](docs/adr/0004-measure-return-with-goatcounter.md)),
and the other security headers. `wrangler.jsonc` serves `dist/` as the static
assets of a Cloudflare Worker; `npx wrangler dev` serves it locally with those
headers.

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
- `public/`: files served as they are, including the fonts in
  `public/fonts/` (SIL Open Font License, `public/fonts/OFL.txt`), the web app
  manifest (`manifest.webmanifest`) and the app icons in `public/icons/`, each
  PNG rendered from `icon.svg` or `maskable.svg` at each size N with
  `npx playwright screenshot --viewport-size=N,N file://$PWD/public/icons/<svg> public/icons/<png>`.
  The design of the game screen is in
  [ADR 0005](docs/adr/0005-guided-game-screen.md).
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
- `docs/android-app.md`: building the Google Play app from the site, and
  keeping its signing key out of this repository.

## Rules

- Anything that needs PostgreSQL runs only in GitHub Actions. Do not start
  Docker or install a database locally.
- Tests fail on `console.warn` and `console.error`.
- Never lower a coverage threshold, skip a test or add a broad exclusion to make
  CI pass.
