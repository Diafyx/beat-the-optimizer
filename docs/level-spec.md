# Level spec format

A level spec describes a level's dataset: its tables, how each column's values
are generated, the order rows are inserted in, the indexes, and the changes
made after `ANALYZE`. Its `level` section describes the puzzle around the
dataset: the text the player reads and the parts of the query. The authoring
pipeline generates the data from the spec,
loads it into PostgreSQL and writes the [level file](level-format.md).

Specs are YAML files in `levels/specs/` (all rights reserved, like the rest of
`levels/`). The JSON Schema is
[`schema/level-spec.schema.json`](../schema/level-spec.schema.json), and
[`authoring/fixtures/example-spec.yaml`](../authoring/fixtures/example-spec.yaml)
uses every kind of values. A first line of
`# yaml-language-server: $schema=../../schema/level-spec.schema.json` lets
editors check a spec as you type.

## Determinism

All data is synthetic and generated from `seed`. The same spec always produces
byte-identical data. Each column, and each table's insert order, draws from its
own random stream named after it (`orders.status`, `orders#order`), so editing
one column does not change the values of the others.

The generator in `authoring/random.ts` is sfc32, seeded through splitmix32 with
`seed` XOR the FNV-1a hash of the stream name. It uses only 32-bit integer
arithmetic, so every Node version gives the same numbers. Changing it changes
every level's data.

## Fields

| Field          | Type                   | Meaning                                                     |
| -------------- | ---------------------- | ----------------------------------------------------------- |
| `seed`         | integer, 0 to 2^32 − 1 | Seeds every random stream                                   |
| `tables`       | 1 to 3 tables          | Generated in this order                                     |
| `afterAnalyze` | array of SQL strings   | Statements run after `ANALYZE`, such as a stale-stats batch |
| `level`        | object                 | The puzzle: see [Level](#level)                             |

### Tables

| Field     | Type             | Meaning                                                                                     |
| --------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `name`    | name             | Table name                                                                                  |
| `rows`    | integer          | Number of rows, 1 to 3,000,000                                                              |
| `order`   | name             | `shuffled`, or a column: rows are inserted in ascending order of it (ties keep their order) |
| `columns` | array of columns | Each with `name`, `type` (`integer`, `bigint`, `text` or `date`) and `values`               |
| `indexes` | array of indexes | Each with `name`, `column` and, for a unique index, `unique: true`                          |

Text columns used as `order` sort by character code, as in the `C` collation.
At the authoring statistics target, `ANALYZE` reads up to 3,000,000 rows, so
the row limit keeps every table's statistics exact.

### Values

Every column's `values` has a `kind`:

| Kind        | Fields                          | Values                                                                                                            |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sequence`  | `start` (default 1)             | `start`, `start + 1`, … in generation order                                                                       |
| `uniform`   | `min`, `max`                    | A uniformly random integer from `min` to `max`, both included                                                     |
| `weighted`  | `weights`: `{ value, weight }`  | Exactly each value's share of the rows (largest remainder, the earlier value on a tie), in random order           |
| `dateRange` | `from`, `to` (`YYYY-MM-DD`)     | A uniformly random date from `from` to `to`, both included                                                        |
| `reference` | `table`, `column`               | A uniformly random value of that column of an earlier table, as a foreign key                                     |
| `derived`   | `column`, `map`: `{ from, to }` | The value an earlier column of the same row maps to, so the two are fully correlated; every value needs a mapping |
| `label`     | `prefix`                        | `prefix` followed by the row's number in generation order, such as `customer 7`                                   |

Weights need not add up to 100. A `weighted` column of 1,000 rows with weights
70, 29.9 and 0.1 has exactly 700, 299 and 1 rows of each value.

### Level

| Field         | Type                     | Meaning                                                                                |
| ------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `id`          | string                   | The level's stable slug, such as `one-customer`                                        |
| `title`       | string                   | Shown as the level's name                                                              |
| `story`       | array of strings         | Paragraphs shown before the puzzle                                                     |
| `select`      | array of column refs     | The columns the query returns                                                          |
| `filters`     | array of filters         | Predicates on one column each; a row must pass all of them                             |
| `joins`       | array of join predicates | Equality predicates `{ left, right }` between tables, as in level files                |
| `orderBy`     | column ref or `null`     | The query's `ORDER BY` column, ascending                                               |
| `locks`       | array of locks           | As in [level files](level-format.md#locks)                                             |
| `stats`       | array of column refs     | The columns whose statistics the player is shown; the others have `stats: null`        |
| `explanation` | array of strings         | Paragraphs shown after the run, written once PostgreSQL's plan and estimates are known |

A column ref is `{ table, column }`. A filter is
`{ table, column, op, value }` with `op` one of `=`, `<`, `<=`, `>` and `>=`,
or `{ table, column, op: in, values }`. Values are numbers for `integer` and
`bigint` columns, and strings for `text` and `date` columns.

The level's SQL is built from these parts in
[`authoring/query.ts`](../authoring/query.ts), so the query PostgreSQL plans is
the query the level shows:

```sql
SELECT customers.name, orders.amount
FROM customers
JOIN orders ON orders.customer_id = customers.customer_id
WHERE customers.city = 'reykjavik'
  AND orders.created_at >= '2024-07-01'
ORDER BY orders.created_at
```

`FROM` names the first table, and each `JOIN` adds a table that a join
predicate links to the ones before it. Names are not quoted, so they read as
written: a name that is a reserved word in SQL, such as `order`, fails when
PostgreSQL plans the query.

## Checks

Loading a spec checks the schema, then:

- table and index names are unique, and column names are unique in their table;
- `order` and every index name a column of the table;
- `uniform` has `min ≤ max`, and `dateRange` has two real dates in order;
- a `reference` names a column of an earlier table, and `derived` an earlier
  column of the same table;
- every column ref in `level` names a column, every lock names a table and,
  for an index scan, an index on it, and each filter value suits its column's
  type (a date is a real date);
- `level.joins` connect every table as a tree, so 1 table has none, 2 have 1
  and 3 have 2.

## Output

`npm run generate-data -- <spec.yaml> <out-dir>` generates the data and writes
two files for `psql`:

- `load.sql` creates each table, with every column `NOT NULL`, copies its rows
  in insert order with `COPY … FROM stdin`, then builds its indexes. Only the
  indexes in the spec are created: a `reference` is not declared as a foreign
  key, so PostgreSQL does not use it in join estimates.
- `after-analyze.sql` holds the `afterAnalyze` statements, each ending in a
  semicolon.

The authoring pipeline runs `load.sql`, then `ANALYZE`, then
`after-analyze.sql`. A unique index on a column with repeated values fails
before anything is written.

## Authoring

`npm run author-level -- <spec.yaml> <level.json>` writes the level file. It
needs PostgreSQL, so it runs only in CI, through `psql` with the `PG*`
environment variables of a superuser. It:

1. applies the [authoring settings](level-format.md#optimizer) with
   `ALTER SYSTEM`, and waits until new connections have them;
2. drops and recreates the schema `authoring`, and loads `load.sql` there;
3. runs `ANALYZE` on the tables, then `after-analyze.sql`;
4. reads the PostgreSQL version, the settings, the statistics of the
   `level.stats` columns, the true counts, and `EXPLAIN (FORMAT JSON)` of the
   level's query;
5. builds the level in [`authoring/level.ts`](../authoring/level.ts), with
   costs from the engine, fails if it breaks any rule of the
   [level format](level-format.md), and writes it formatted by Prettier.

A table inserted in order of a column is stored in that order, its
`storedOrder`. An `afterAnalyze` statement that updates rows moves them, so a
level should not rely on both.
