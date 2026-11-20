# Level format

A level is one JSON file. It is the contract between the authoring pipeline,
which writes it, the engine, which scores plans with it, and the app, which
shows it. This page describes format 1. The JSON Schema is
[`schema/level.schema.json`](../schema/level.schema.json) (draft 2020-12), and
[`tests/fixtures/example-level.json`](../tests/fixtures/example-level.json) is
a hand-written example. The cost model that uses these numbers is in
[cost-model.md](cost-model.md).

## Portability

The format uses only plain JSON, so any language can read it without a custom
decoder:

- strings, numbers, booleans, arrays, objects and `null`, nothing encoded
  inside strings;
- every row count and cost is an integer from 0 to 2^53 − 1, which every JSON
  parser reads exactly;
- ordered data is an array, never an object whose key order matters;
- names of tables, columns and indexes are lower-case SQL identifiers
  (`^[a-z_][a-z0-9_]*$`).

Every object rejects unknown fields. A change that old readers cannot ignore
raises `format`.

## What the player sees and what stays hidden

The app shows the story, the SQL, the tables (row counts, columns, statistics,
indexes and physical order), the join predicates, the `ORDER BY` and the
locks. It must not show `cardinalities`, `optimizer`, `costs` or
`explanation` until the player has run a plan: they give away the answer.

## Fields

| Field           | Type                       | Meaning                                                            |
| --------------- | -------------------------- | ------------------------------------------------------------------ |
| `format`        | `1`                        | Format version                                                     |
| `id`            | string                     | Stable slug, such as `one-customer`; never changes after release   |
| `title`         | string                     | Shown as the level's name                                          |
| `story`         | array of strings           | Paragraphs of plain text shown before the puzzle                   |
| `sql`           | string                     | The query, as shown to the player                                  |
| `tables`        | array of 1 to 3 tables     | The tables the query reads, in the order the app lists them        |
| `joins`         | array of join predicates   | Equality predicates between tables; empty for one table            |
| `orderBy`       | column reference or `null` | The query's `ORDER BY` column, ascending                           |
| `locks`         | array of locks             | Choices the level makes for the player                             |
| `cardinalities` | object                     | True row counts the cost model needs (hidden)                      |
| `optimizer`     | object                     | PostgreSQL's plan, version and settings (hidden)                   |
| `costs`         | object                     | The best cost, PostgreSQL's cost and one best plan (hidden)        |
| `explanation`   | array of strings           | Paragraphs shown after the run: what PostgreSQL estimated, and why |

A **column reference** is `{ "table": "orders", "column": "customer_id" }`.

### Tables

| Field         | Type                  | Meaning                                                                     |
| ------------- | --------------------- | --------------------------------------------------------------------------- |
| `name`        | name                  | Table name, unique in the level                                             |
| `rows`        | integer               | True number of rows                                                         |
| `filter`      | string or `null`      | The query's predicates on this table, as SQL, for display                   |
| `storedOrder` | column name or `null` | The column the rows are physically stored in ascending order of             |
| `columns`     | array of columns      | Each with `name`, `type` (the PostgreSQL type name) and `stats`             |
| `indexes`     | array of indexes      | Each with a unique `name` and the one `column` it is on (B-tree, ascending) |

`stats` is `null` when the player is not shown statistics for the column, or
holds what PostgreSQL's `pg_stats` says after `ANALYZE`:

| Field          | Type                          | From `pg_stats`                                      |
| -------------- | ----------------------------- | ---------------------------------------------------- |
| `nullFraction` | number, 0 to 1                | `null_frac`                                          |
| `distinct`     | number                        | `n_distinct`, as an estimated count (never negative) |
| `mostCommon`   | array of `{value, frequency}` | `most_common_vals` with `most_common_freqs`          |
| `histogram`    | array of values               | `histogram_bounds`                                   |
| `correlation`  | number, −1 to 1, or `null`    | `correlation`                                        |

Values are strings, numbers or booleans. Dates and times are ISO 8601 strings.

### Plans

A plan is left-deep: scan a first table, then join one more table per step.

```json
{
  "first": { "table": "authors", "access": "seq" },
  "steps": [{ "join": "indexNestedLoop", "table": "books", "index": "books_author_id_idx" }]
}
```

- A **scan** is `{ "table", "access": "seq" }` or
  `{ "table", "access": "index", "index" }`.
- A **step** is `{ "join": "hash" | "nestedLoop" | "merge", "scan" }`, which
  scans the next table and joins it to the result so far, or
  `{ "join": "indexNestedLoop", "table", "index" }`, which looks up the next
  table's rows through `index`, once per row of the result so far.
- Sorts are not part of a plan: the cost model adds them where a merge join or
  the `ORDER BY` needs them.

### Locks

| Lock                                         | Effect                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `{ "kind": "joinOrder", "tables": [...] }`   | The listed tables are joined in this order; other tables may come before, between or after them |
| `{ "kind": "joinMethod", "method": "hash" }` | Every join uses this method                                                                     |
| `{ "kind": "access", "scan": { ... } }`      | This table is read with this scan (unless it is the inner side of an index nested loop)         |

The app shows locked choices greyed out. Locks restrict the player, never the
best plan: `costs.best` is computed over the whole plan space.

### Cardinalities

True row counts, measured on the generated data. The engine never estimates.

| Field     | Entry                          | Meaning                                                                                                                                              |
| --------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scans`   | `{ table, filtered, indexes }` | Rows left after the table's filter; for each index, `matched` is the rows the index condition matches, or all rows if no predicate is on that column |
| `joins`   | `{ tables, rows }`             | Rows in the join of these tables with all their predicates, whatever the plan                                                                        |
| `lookups` | `{ outer, index, fetched }`    | Rows an index nested loop fetches through `index` for the rows of the `outer` tables, before the inner table's filter                                |

Sets of tables are listed in any order and mean the same set.

### Optimizer

| Field      | Type         | Meaning                                                                                                                               |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | string       | PostgreSQL version, `major.minor`, such as `18.1`                                                                                     |
| `settings` | object       | The settings the level was authored with, as `SHOW` prints them                                                                       |
| `plan`     | plan         | PostgreSQL's plan, mapped into the plan space                                                                                         |
| `explain`  | EXPLAIN node | A summary of PostgreSQL's plan: `nodeType`, `relation`, `index`, `estimatedRows`, `estimatedCost` and `children`, for the explanation |

`estimatedRows` and `estimatedCost` are PostgreSQL's estimates and its own cost
units, kept so the explanation can show what PostgreSQL believed. Scores never
use them. The example file's `optimizer` section is hand-written; in real
levels the authoring pipeline writes it.

### Costs

`best` and `optimizer` are integer costs under the cost model. `bestPlan` is
one plan with cost `best`; when several plans tie, any of them may be stored.

## Rules the schema cannot express

Level validation checks these. `npm run levels` runs it on every `.json` file
in `levels/` (or on the files given, as in
`npm run levels -- path/to/level.json`), after the schema; the rules are in
[`src/engine/validate.ts`](../src/engine/validate.ts).

1. Table names are unique, column names are unique in their table, and index
   names are unique across the level.
2. Every table, column and index reference resolves, and every index's column
   exists.
3. The join predicates form a tree that connects every table: one table needs
   none, two need one, three need two. So each step joins exactly one
   predicate, and there are no cross products.
4. `cardinalities` is complete: a `scans` entry for every table, with every
   index; a `joins` entry for every connected set of two or more tables; a
   `lookups` entry for every connected set of tables and every index on the
   joining column of a table that the set can be joined to.
5. Every plan in the file is valid: each table once, each step joined by a
   predicate to an earlier table, and an index nested loop's index on that
   predicate's column of the new table.
6. `costs.best` and `costs.optimizer` equal the engine's recomputation, and
   `bestPlan` costs `best`.
7. `best ≤ optimizer`, and PostgreSQL's plan is allowed by the locks, so the
   player can always match it.
8. `optimizer.explain` names the same tables (`relation`) and indexes as
   `optimizer.plan`.

Rule 6 needs rules 1 to 5, so validation recomputes the costs only when they
pass.
