# Level spec format

A level spec describes a level's dataset: its tables, how each column's values
are generated, the order rows are inserted in, the indexes, and the changes
made after `ANALYZE`. The authoring pipeline generates the data from the spec,
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

### Tables

| Field     | Type             | Meaning                                                                                     |
| --------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `name`    | name             | Table name                                                                                  |
| `rows`    | integer          | Number of rows, 1 to 10,000,000                                                             |
| `order`   | name             | `shuffled`, or a column: rows are inserted in ascending order of it (ties keep their order) |
| `columns` | array of columns | Each with `name`, `type` (`integer`, `bigint`, `text` or `date`) and `values`               |
| `indexes` | array of indexes | Each with `name`, `column` and, for a unique index, `unique: true`                          |

Text columns used as `order` sort by character code, as in the `C` collation.

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

## Checks

Loading a spec checks the schema, then:

- table and index names are unique, and column names are unique in their table;
- `order` and every index name a column of the table;
- `uniform` has `min ≤ max`, and `dateRange` has two real dates in order;
- a `reference` names a column of an earlier table, and `derived` an earlier
  column of the same table.

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
