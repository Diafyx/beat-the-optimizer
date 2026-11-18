# 1. Record architecture decisions

- Status: accepted
- Date: 2026-11-18

## Context

Decisions about the cost model, the reference database and the tooling shape
every later change. Without a record, contributors cannot tell whether a choice
was deliberate or accidental, and the same questions come up again.

## Decision

Significant decisions are recorded as short architecture decision records
(ADRs) in `docs/adr/`, in the format described by Michael Nygard in
[Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

- Files are named `NNNN-short-title.md`, numbered in order.
- Each record has a status, a date, and the sections Context, Decision and
  Consequences.
- An accepted record is not rewritten. A later decision that changes it is a
  new record that marks the old one as "superseded by NNNN".
- A pull request that makes a significant decision adds its ADR in the same
  pull request and links it from the description.

## Consequences

- The reasons behind the design stay next to the code and are reviewed like
  code.
- Writing a record takes a few minutes per decision. Small, easily reversed
  choices do not need one.
