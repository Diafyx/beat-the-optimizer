# Cost model

Every plan is scored by the rows it touches: each operator costs a number of
rows, and a plan costs the sum over its operators. The numbers come from the
level's true cardinalities ([level-format.md](level-format.md)), never from
estimates, so the result is exact and the same on every machine.
[ADR 0002](adr/0002-cost-model-rows-touched.md) records why. Changing a
constant changes the scores of existing levels and needs a new ADR.

## Notation

- `rows(T)`: the rows in table `T` (`tables[].rows`).
- `out(T)`: the rows a scan of `T` returns after its filter
  (`cardinalities.scans[].filtered`).
- `matched(I)`: the rows index `I` matches (`cardinalities.scans[].indexes[]`).
- `L`: the rows of the result so far, the left input of a join. After the
  first scan, `L = out(first)`; after a join, `L` is that join's output.
- `R`: `out(T)` for the table a step joins.
- `out(join)`: the rows of the join of all tables so far
  (`cardinalities.joins[].rows`).
- `fetched`: the rows an index nested loop looks up
  (`cardinalities.lookups[].fetched`).
- `⌈log2 n⌉`: the smallest `k` with `2^k ≥ n`, and 0 for `n ≤ 1`.

## Operators

| Operator                                | Cost                | Why                                                                                                    |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| Seq scan                                | `rows(T)`           | It reads every row once, in storage order.                                                             |
| Index scan                              | `4 × matched(I)`    | Each match is a jump to a random place in the table; 4 is PostgreSQL's default `random_page_cost`.     |
| Index scan, table stored in index order | `1 × matched(I)`    | The matches sit next to each other, so the jumps become an in-order read.                              |
| Hash join                               | `L + R`             | It builds a hash table from one input and probes it with the other, touching each row once.            |
| Nested loop                             | `L × R`             | It compares every row of one input with every row of the other.                                        |
| Index nested loop                       | `4 × (L + fetched)` | Each outer row is one index lookup, and each fetched row is a jump into the table, like an index scan. |
| Merge join                              | `L + R`             | It walks two sorted inputs side by side, touching each row once.                                       |
| Sort of `n` rows                        | `n × ⌈log2 n⌉`      | A comparison sort touches each row about `log2 n` times.                                               |
| Every join                              | `+ out(join)`       | The intermediate result has to be produced, whatever the method.                                       |

The inputs of a join are costed by their own operators: a hash join of two
seq scans costs both scans plus `L + R` plus its output. The inner side of an
index nested loop is the exception: it has no scan, because its rows are
fetched through the index, and `fetched` already counts them. Its filter is
applied to the fetched rows at no cost.

A plan's cost is the sum of:

1. the first scan;
2. for each step, its scan (unless it is an index nested loop), its join cost
   and `out(join)`;
3. a sort before each merge join input that is not in order on the join
   column;
4. a sort of the final result when the query has an `ORDER BY` and the result
   is not in that order.

## Order

Sorts depend on which order rows arrive in. All orders are ascending.

| Operator                       | Output order                              |
| ------------------------------ | ----------------------------------------- |
| Seq scan                       | The table's `storedOrder` column, or none |
| Index scan                     | The index's column                        |
| Nested loop, index nested loop | The left input's order                    |
| Merge join                     | The join column                           |
| Hash join                      | None                                      |
| Sort                           | The sort column                           |

The two columns of a join predicate are equal in every row of its output, so
order on one counts as order on the other from that join on. These rules match
what PostgreSQL's planner assumes: it never relies on a hash join's output
order.

## Plan space

- **Join orders**: every order of the tables in which each new table is joined
  by a predicate to a table before it. Plans are left-deep, with no cross
  products.
- **Access paths**: for each scanned table, a seq scan or an index scan on any
  of its indexes. An index whose column has no predicate matches every row,
  which can still pay off for its order.
- **Join methods**: hash join, nested loop and merge join always; index nested
  loop when the new table has an index on its column of the joining predicate.

A level has at most three tables, so the engine enumerates every plan and the
best cost is exact. It is computed over the whole plan space, ignoring the
level's locks.

## Worked example

[`tests/fixtures/example-level.json`](../tests/fixtures/example-level.json):

```sql
SELECT a.name, b.title
FROM authors a JOIN books b ON b.author_id = a.author_id
WHERE a.country = 'NZ'
ORDER BY a.author_id
```

- `authors`: 1,000 rows stored in `author_id` order, 20 from New Zealand,
  index `authors_pkey` on `author_id`.
- `books`: 20,000 rows stored in `book_id` order, no filter, indexes
  `books_pkey` on `book_id` and `books_author_id_idx` on `author_id`.
- The join returns 400 rows. Looking up the 20 authors' books through
  `books_author_id_idx` fetches 400 rows; looking up every book's author
  through `authors_pkey` fetches 20,000.

**Seq scan of `authors`, index nested loop into `books`:**

| Operator                                                                      |                   Cost |
| ----------------------------------------------------------------------------- | ---------------------: |
| Seq scan `authors`                                                            |                  1,000 |
| Index nested loop through `books_author_id_idx`                               | 4 × (20 + 400) = 1,680 |
| Join output                                                                   |                    400 |
| Sort: none, the seq scan is in `author_id` order and the nested loop keeps it |                      0 |
| **Total**                                                                     |              **3,080** |

**Seq scans of both, hash join:**

| Operator                                         |                 Cost |
| ------------------------------------------------ | -------------------: |
| Seq scan `authors`                               |                1,000 |
| Seq scan `books`                                 |               20,000 |
| Hash join                                        | 20 + 20,000 = 20,020 |
| Join output                                      |                  400 |
| Sort for `ORDER BY` (no order after a hash join) |      400 × 9 = 3,600 |
| **Total**                                        |           **45,020** |

**Seq scan of `authors`, merge join with an index scan of `books` on
`books_author_id_idx`:**

| Operator                                                                      |                 Cost |
| ----------------------------------------------------------------------------- | -------------------: |
| Seq scan `authors` (already in `author_id` order)                             |                1,000 |
| Index scan `books_author_id_idx` (all 20,000 rows, stored in `book_id` order) |  4 × 20,000 = 80,000 |
| Merge join                                                                    | 20 + 20,000 = 20,020 |
| Join output                                                                   |                  400 |
| Sort: none, the merge join returns `author_id` order                          |                    0 |
| **Total**                                                                     |          **101,420** |

**Seq scan of `books`, index nested loop into `authors`:**

| Operator                                 |                            Cost |
| ---------------------------------------- | ------------------------------: |
| Seq scan `books`                         |                          20,000 |
| Index nested loop through `authors_pkey` | 4 × (20,000 + 20,000) = 160,000 |
| Join output                              |                             400 |
| Sort for `ORDER BY` (in `book_id` order) |                 400 × 9 = 3,600 |
| **Total**                                |                     **184,000** |

The first plan is the best, at 3,080. An index scan of `authors_pkey` instead
of the seq scan also costs 1,000 (`authors` is stored in index order), so that
plan ties with it.
