# 2. Score plans by rows touched

- Status: accepted
- Date: 2026-11-18

## Context

The game compares the player's plan with the plan PostgreSQL chose. Both need
a cost under one model, and the model has to be:

- simple enough for a player to predict while choosing a plan;
- close enough to how databases behave that a database expert finds the
  results fair;
- deterministic, with no dependence on hardware or timing.

PostgreSQL's own cost model has many constants (page costs, CPU costs per
tuple and per operator, cache assumptions). Players cannot predict it, and
reproducing it exactly would tie the game to one PostgreSQL version. Measured
run time is noisy and depends on the machine.

## Decision

Every operator costs the rows it touches. A plan's cost is the sum over its
operators.

| Operator          | Cost                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| Sequential scan   | `rows(T)`                                                                       |
| Index scan        | `4 × matched rows`, or `1 × matched rows` if the table is stored in index order |
| Hash join         | `left + right`                                                                  |
| Nested loop       | `left × right`                                                                  |
| Index nested loop | `4 × (left + inner rows fetched)`                                               |
| Merge join        | `left + right`, plus a sort for each input that is not already sorted           |
| Sort              | `n × ⌈log2 n⌉`, or 0 if the input is already in order                           |
| Every join        | plus its output rows (the intermediate result)                                  |

The factor 4 is PostgreSQL's default `random_page_cost`: an index lookup jumps
to a random place, while a scan reads in order.

- Row counts are the **true** row counts from the synthetic data, not
  estimates. The optimizer is misled by its estimates; the score is not.
- The plan space is left-deep join trees without cross products, with at most
  three tables per level. The engine enumerates every plan, so the best plan is
  exact.
- The best possible cost is computed over the **whole** plan space, even when a
  level locks some choices for the player. Validation rejects a level whose
  locks would hide PostgreSQL's plan from the player.
- PostgreSQL's plan is mapped into the same plan space and scored with this
  model. Nodes that do not map cleanly fail authoring instead of being guessed.

The full rules and constants will be published in `docs/cost-model.md`.

## Consequences

- With hash joins only, the cost is scans plus join inputs plus intermediate
  results, so the join-order levels reward small intermediate results, which
  is the lesson.
- Players can work out costs by hand. The game can show each operator's cost.
- Experts may object where the two models differ. Levels are designed so that
  PostgreSQL's model and this one agree, except where PostgreSQL is misled by
  its statistics. Each level's explanation says what PostgreSQL estimated and
  why.
- The engine invariant `best ≤ optimizer` holds by construction and is
  property-tested.
- Changing a constant changes the scores of existing levels. That is a
  breaking change to the scoring and needs a new ADR.
