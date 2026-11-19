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
npm run check-filters # every file matches a group in .github/filters.yml
npm run check-lockfile # every lockfile URL is on registry.npmjs.org
npm run pr-size     # CI only: size label for a pull request
npm run pr-hygiene  # CI only: pull request rules
npm run build       # production build into dist/
```

## Layout

- `src/engine/`: the pure TypeScript engine and cost model. No DOM, no Node APIs
  and no runtime dependencies; 100% line and branch coverage.
- `src/`: the web app.
- `tests/`: test setup and cross-cutting tests.
- `e2e/`: Playwright browser and accessibility tests against `vite preview`.
- `scripts/`: repository tooling in TypeScript, run directly by Node; logic in
  `scripts/lib/` is unit-tested and covered.
- `.github/filters.yml`: CI path filters. A new folder needs a filter group in
  the same pull request.
- `levels/`: level content, **all rights reserved**. Do not create or edit level
  content unless the maintainer asks.
- `docs/adr/`: architecture decision records.

## Rules

- Anything that needs PostgreSQL runs only in GitHub Actions. Do not start
  Docker or install a database locally.
- Tests fail on `console.warn` and `console.error`.
- Never lower a coverage threshold, skip a test or add a broad exclusion to make
  CI pass.
