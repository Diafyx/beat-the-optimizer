# Notes for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It has every rule CI enforces.

## Commands

```bash
npm ci              # install
npm run dev         # dev server
npm run check       # the local part of PR CI; run before every pull request
npm run check-all   # every job that can run locally
npm run lint        # ESLint (--max-warnings 0) and prettier --check
npm run format      # prettier --write
npm run typecheck   # tsc for the app, and for src/engine without DOM types
npm run unit        # Vitest with coverage gates
npm run docs        # markdownlint
npm run build       # production build into dist/
```

## Layout

- `src/engine/`: the pure TypeScript engine and cost model. No DOM, no Node APIs
  and no runtime dependencies; 100% line and branch coverage.
- `src/`: the web app.
- `tests/`: test setup and cross-cutting tests.
- `levels/`: level content, **all rights reserved**. Do not create or edit level
  content unless the maintainer asks.
- `docs/adr/`: architecture decision records.

## Rules

- Anything that needs PostgreSQL runs only in GitHub Actions. Do not start
  Docker or install a database locally.
- Tests fail on `console.warn` and `console.error`.
- Never lower a coverage threshold, skip a test or add a broad exclusion to make
  CI pass.
