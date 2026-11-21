# Beat the Optimizer

[![CI](https://github.com/Diafyx/beat-the-optimizer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Diafyx/beat-the-optimizer/actions/workflows/ci.yml?query=branch%3Amain)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Diafyx/beat-the-optimizer/badge)](https://scorecard.dev/viewer/?uri=github.com/Diafyx/beat-the-optimizer)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

A daily puzzle for people who write SQL. Each level gives you a query and a few
tables. You choose the join order, how each table is read and how each join is
done. Then your plan runs against the plan PostgreSQL chose for the same query.

> **Status:** early development. The first public version is `v0.1.0`, with 10
> levels, a daily rotation and a share card.

## How it works

- **Your plan**: pick the join order, an access path for each table (sequential
  scan or an index) and a join method for each join (hash, nested loop, index
  nested loop or merge).
- **The score**: every operator costs the rows it touches, plus the rows each
  join produces. The cost model is small enough to explain on one page:
  [docs/cost-model.md](docs/cost-model.md), with the reasons in
  [ADR 0002](docs/adr/0002-cost-model-rows-touched.md).
- **The opponent**: every level stores the plan PostgreSQL 18 actually chose,
  recorded against synthetic data. Your plan and Postgres's are scored with the
  same model.
- **Each day** one level is the daily puzzle. You can share your result without
  spoiling the answer.

## Run it locally

You need Node.js 22.18 or later, 24 or 26 (see `.nvmrc`). No database is needed.

```bash
npm ci
npm run dev     # start the dev server; ?level=<id> opens a level for practice
npm run check   # run the same checks as CI
```

The level authoring step runs PostgreSQL, so it runs only in GitHub Actions.
[CONTRIBUTING.md](CONTRIBUTING.md) explains every script and rule.

## Supported versions

| Component  | Supported                                                           |
| ---------- | ------------------------------------------------------------------- |
| Node.js    | 22 (22.18 or later), 24 and 26, for development; the site is static |
| Browsers   | Latest Chromium, Firefox and WebKit (Safari), desktop and mobile    |
| PostgreSQL | 18, as the reference optimizer for level authoring                  |

## Licence

This repository has two licences:

- **Code** (everything outside `levels/`) is under the [MIT licence](LICENSE).
- **Level content** in `levels/` (level files, level specs, stories
  and explanations) is **all rights reserved**. See
  [`levels/LICENSE`](levels/LICENSE).

## Contributing

Bug reports and ideas are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first. Outside contributions to `levels/` are not accepted, because that
content is all rights reserved.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). To
report a security problem, see [SECURITY.md](SECURITY.md).
