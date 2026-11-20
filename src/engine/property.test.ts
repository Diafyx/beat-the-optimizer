import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planCost } from './cost.ts';
import type { ColumnRef, JoinPredicate, Level, Plan, Scan, Step, Table } from './level.ts';
import { allowedByLocks, bestPlan, enumeratePlans } from './plans.ts';

/** Row counts small enough that no plan's cost passes 2^53 - 1. */
const count = fc.nat({ max: 1_000_000 });

const COLUMNS = ['id', 'ref'] as const;

/** Every subset of `names` with at least `min` members. */
function subsets(names: readonly string[], min: number): string[][] {
  const all: string[][] = [[]];
  for (const name of names) {
    for (const subset of [...all]) {
      all.push([...subset, name]);
    }
  }
  return all.filter((subset) => subset.length >= min);
}

/**
 * A level with 1 to 3 tables joined in a tree, random statistics and
 * cardinalities for every set of tables, every index and every lookup.
 */
const levelArbitrary: fc.Arbitrary<Level> = fc
  .integer({ min: 1, max: 3 })
  .chain((size) => {
    const names = ['t0', 't1', 't2'].slice(0, size);
    const table = (name: string) =>
      fc
        .record({
          rows: count,
          storedOrder: fc.constantFrom(null, ...COLUMNS),
          indexed: fc.subarray([...COLUMNS]),
          filtered: count,
          matched: fc.tuple(count, count),
        })
        .map((t): { table: Table; filtered: number; matched: readonly [number, number] } => ({
          table: {
            name,
            rows: t.rows,
            filter: null,
            storedOrder: t.storedOrder,
            columns: COLUMNS.map((column) => ({ name: column, type: 'integer', stats: null })),
            indexes: t.indexed.map((column) => ({ name: `${name}_${column}_idx`, column })),
          },
          filtered: t.filtered,
          matched: t.matched,
        }));
    // Table i joins one earlier table, so the predicates form a tree.
    const join = (i: number) =>
      fc
        .record({
          to: fc.nat({ max: i - 1 }),
          left: fc.constantFrom(...COLUMNS),
          right: fc.constantFrom(...COLUMNS),
        })
        .map(({ to, left, right }): JoinPredicate => ({
          left: { table: `t${String(to)}`, column: left },
          right: { table: `t${String(i)}`, column: right },
        }));
    return fc.record({
      tables: fc.tuple(...names.map(table)),
      joins: fc.tuple(...names.slice(1).map((_, i) => join(i + 1))),
      orderBy: fc.option(
        fc.record({ table: fc.constantFrom(...names), column: fc.constantFrom(...COLUMNS) }),
      ),
      joinRows: fc.array(count, { minLength: 4, maxLength: 4 }),
      fetched: fc.array(count, { minLength: 24, maxLength: 24 }),
    });
  })
  .map(({ tables, joins, orderBy, joinRows, fetched }) => {
    const names = tables.map(({ table }) => table.name);
    const indexes = tables.flatMap(({ table }) => table.indexes);
    const plan: Plan = { first: { table: 't0', access: 'seq' }, steps: [] };
    return {
      format: 1,
      id: 'generated',
      title: 'Generated',
      story: ['Generated.'],
      sql: 'SELECT 1',
      tables: tables.map(({ table }) => table),
      joins,
      orderBy,
      locks: [],
      cardinalities: {
        scans: tables.map(({ table, filtered, matched }) => ({
          table: table.name,
          filtered,
          indexes: table.indexes.map(({ name }, i) => ({ index: name, matched: matched[i] ?? 0 })),
        })),
        joins: subsets(names, 2).map((set, i) => ({ tables: set, rows: joinRows[i] ?? 0 })),
        lookups: subsets(names, 1).flatMap((outer, i) =>
          indexes.map((index, j) => ({
            outer,
            index: index.name,
            fetched: fetched[i * indexes.length + j] ?? 0,
          })),
        ),
      },
      optimizer: {
        postgres: '18.1',
        settings: {},
        plan,
        explain: {
          nodeType: 'Result',
          relation: null,
          index: null,
          estimatedRows: 1,
          estimatedCost: 0,
          children: [],
        },
      },
      costs: { best: 0, optimizer: 0, bestPlan: plan },
      explanation: ['Generated.'],
    } satisfies Level;
  });

/** A valid plan for `level`, built from `choices`, one choice per decision. */
function planFrom(level: Level, choices: readonly number[]): Plan {
  let next = 0;
  const pick = <T>(options: readonly T[]): T => {
    const choice = choices[next % choices.length] ?? 0;
    next += 1;
    const option = options[choice % options.length];
    if (option === undefined) {
      throw new Error('Nothing to pick from');
    }
    return option;
  };
  const scan = (table: Table): Scan =>
    pick<Scan>([
      { table: table.name, access: 'seq' },
      ...table.indexes.map((index): Scan => ({
        table: table.name,
        access: 'index',
        index: index.name,
      })),
    ]);
  const byName = (name: string): Table => {
    const table = level.tables.find((candidate) => candidate.name === name);
    if (table === undefined) {
      throw new Error(`No table ${name}`);
    }
    return table;
  };

  const first = pick(level.tables);
  const joined = [first.name];
  const steps: Step[] = [];
  while (joined.length < level.tables.length) {
    const candidates = level.joins.flatMap(({ left, right }): [ColumnRef][] => {
      if (joined.includes(left.table) && !joined.includes(right.table)) return [[right]];
      if (joined.includes(right.table) && !joined.includes(left.table)) return [[left]];
      return [];
    });
    const [column] = pick(candidates);
    const table = byName(column.table);
    const lookups = table.indexes.filter((index) => index.column === column.column);
    const step = pick<Step>([
      { join: 'hash', scan: scan(table) },
      { join: 'nestedLoop', scan: scan(table) },
      { join: 'merge', scan: scan(table) },
      ...lookups.map((index): Step => ({
        join: 'indexNestedLoop',
        table: table.name,
        index: index.name,
      })),
    ]);
    steps.push(step);
    joined.push(table.name);
  }
  return { first: scan(first), steps };
}

const choices = fc.array(fc.nat(), { minLength: 1, maxLength: 16 });

describe('planCost properties', () => {
  it('scores every valid plan with non-negative integer costs that sum to the total', () => {
    fc.assert(
      fc.property(levelArbitrary, choices, (level, picks) => {
        const { operators, total } = planCost(level, planFrom(level, picks));
        for (const { cost, rows } of operators) {
          expect(Number.isSafeInteger(cost) && cost >= 0).toBe(true);
          expect(Number.isSafeInteger(rows) && rows >= 0).toBe(true);
        }
        expect(total).toBe(operators.reduce((sum, { cost }) => sum + cost, 0));
      }),
    );
  });

  it('never lowers the total when a join is added', () => {
    // Only without ORDER BY: one more join can put the result in order and save
    // a final sort larger than the join costs.
    fc.assert(
      fc.property(levelArbitrary, choices, (generated, picks) => {
        const level = { ...generated, orderBy: null };
        const plan = planFrom(level, picks);
        let previous = 0;
        for (let length = 0; length <= plan.steps.length; length += 1) {
          const prefix = { first: plan.first, steps: plan.steps.slice(0, length) };
          const { total } = planCost(level, prefix);
          expect(total).toBeGreaterThanOrEqual(previous);
          previous = total;
        }
      }),
    );
  });

  it('gives the same result for the same plan', () => {
    fc.assert(
      fc.property(levelArbitrary, choices, (level, picks) => {
        const plan = planFrom(level, picks);
        expect(planCost(level, plan)).toEqual(planCost(level, structuredClone(plan)));
      }),
    );
  });
});

describe('enumeratePlans and bestPlan properties', () => {
  it('enumerates every valid plan, each once', () => {
    fc.assert(
      fc.property(levelArbitrary, choices, (level, picks) => {
        const plans = enumeratePlans(level).map((plan) => JSON.stringify(plan));
        expect(new Set(plans).size).toBe(plans.length);
        expect(plans).toContain(JSON.stringify(planFrom(level, picks)));
      }),
    );
  });

  it("finds a best plan at most the optimizer's cost and any enumerated plan's cost", () => {
    fc.assert(
      fc.property(levelArbitrary, choices, (generated, picks) => {
        // A random valid plan stands in for PostgreSQL's.
        const level = {
          ...generated,
          optimizer: { ...generated.optimizer, plan: planFrom(generated, picks) },
        };
        const best = bestPlan(level);
        expect(best.cost).toEqual(planCost(level, best.plan));
        expect(best.cost.total).toBeLessThanOrEqual(planCost(level, level.optimizer.plan).total);
        for (const plan of enumeratePlans(level)) {
          expect(best.cost.total).toBeLessThanOrEqual(planCost(level, plan).total);
        }
      }),
    );
  });

  it("allows a plan under locks built from that plan's own choices", () => {
    fc.assert(
      fc.property(levelArbitrary, choices, (generated, picks) => {
        const plan = planFrom(generated, picks);
        const order = [
          plan.first.table,
          ...plan.steps.map((step) => ('scan' in step ? step.scan.table : step.table)),
        ];
        const methods = new Set(plan.steps.map((step) => step.join));
        const level: Level = {
          ...generated,
          locks: [
            { kind: 'joinOrder', tables: order },
            { kind: 'access', scan: plan.first },
            // A join method lock applies to every join, so only when they all match.
            ...(methods.size === 1
              ? [...methods].map((method) => ({ kind: 'joinMethod', method }) as const)
              : []),
          ],
        };
        const allowed = enumeratePlans(level).filter((candidate) =>
          allowedByLocks(level, candidate),
        );
        expect(allowed.map((candidate) => JSON.stringify(candidate))).toContain(
          JSON.stringify(plan),
        );
      }),
    );
  });
});
