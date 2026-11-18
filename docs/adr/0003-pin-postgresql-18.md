# 3. Pin PostgreSQL 18 as the reference optimizer

- Status: accepted
- Date: 2026-11-18

## Context

Each level stores the plan PostgreSQL chose for its query. The opponent has to
be the same for every player and stable over time. Optimizer behaviour changes
between major versions, and plans also depend on statistics sampling,
parallelism, JIT and configuration.

PostgreSQL 18 is the newest stable major version. PostgreSQL 19 is due on
19 November 2026.

## Decision

- Levels are authored against **PostgreSQL 18**, in GitHub Actions, with the
  container image pinned by digest.
- Each level file records the exact PostgreSQL version it was authored with.
- Authoring runs with settings that make plans reproducible:
  - autovacuum off, and an explicit `ANALYZE` with a statistics target that
    samples whole tables;
  - `max_parallel_workers_per_gather = 0` and `jit = off`;
  - default cost settings and a fixed insert order.
- A pull request touching `authoring/` or `levels/` regenerates the levels and
  fails on any difference from the committed files. The same check runs
  nightly.
- A non-blocking canary runs the authoring against the next major version and
  reports differences in one tracking issue.

## Consequences

- Every player faces the same opponent, and level files are reproducible.
- New PostgreSQL versions do not change existing levels by accident. Moving to
  a newer version is a deliberate change with its own ADR. It re-authors every
  level and may change their scores.
- Players who run the query on another PostgreSQL version may see a different
  plan. The about page says which version the game uses.
