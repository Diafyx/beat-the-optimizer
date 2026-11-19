/**
 * The plan space from docs/cost-model.md: every left-deep join order without
 * cross products, every access path and every join method. A level has at
 * most three tables, so enumerating it is cheap and the best plan is exact.
 */
import { joinPredicate, planCost, type PlanCost } from './cost.ts';
import type { Level, Lock, Plan, Scan, Step, Table } from './level.ts';

/** The table each part of a plan reads, in join order. */
export function joinOrder(plan: Plan): string[] {
  return [
    plan.first.table,
    ...plan.steps.map((step) => (step.join === 'indexNestedLoop' ? step.table : step.scan.table)),
  ];
}

/** A seq scan, then an index scan on each index. */
function scans(table: Table): Scan[] {
  return [
    { table: table.name, access: 'seq' },
    ...table.indexes.map((index): Scan => ({
      table: table.name,
      access: 'index',
      index: index.name,
    })),
  ];
}

/**
 * Every way to join `table` to `joined`: hash, nested loop and merge join
 * with each scan of it, then an index nested loop through each index on its
 * join column. None if no predicate joins it to `joined`.
 */
function steps(level: Level, joined: readonly string[], table: Table): Step[] {
  const predicate = joinPredicate(level, joined, table.name);
  if (predicate === undefined) {
    return [];
  }
  const column = predicate[1].column;
  return [
    ...(['hash', 'nestedLoop', 'merge'] as const).flatMap((join) =>
      scans(table).map((scan): Step => ({ join, scan })),
    ),
    ...table.indexes
      .filter((index) => index.column === column)
      .map((index): Step => ({ join: 'indexNestedLoop', table: table.name, index: index.name })),
  ];
}

/** Every plan that starts with `plan` and joins the rest of `remaining`. */
function extend(level: Level, plan: Plan, remaining: readonly Table[]): Plan[] {
  if (remaining.length === 0) {
    return [plan];
  }
  const joined = joinOrder(plan);
  return remaining.flatMap((table) =>
    steps(level, joined, table).flatMap((step) =>
      extend(
        level,
        { first: plan.first, steps: [...plan.steps, step] },
        remaining.filter((other) => other !== table),
      ),
    ),
  );
}

/**
 * Every plan in the level's plan space, ignoring its locks, in a fixed order:
 * by first table, then access path, then each step in the order above.
 */
export function enumeratePlans(level: Level): Plan[] {
  return level.tables.flatMap((first) =>
    scans(first).flatMap((scan) =>
      extend(
        level,
        { first: scan, steps: [] },
        level.tables.filter((table) => table !== first),
      ),
    ),
  );
}

const sameScan = (a: Scan, b: Scan): boolean =>
  a.access === b.access && (a.access === 'seq' || (b.access === 'index' && a.index === b.index));

function allowedBy(plan: Plan, lock: Lock): boolean {
  switch (lock.kind) {
    case 'joinOrder': {
      // The locked tables appear in the plan in the lock's order. A missing
      // table has position -1, which is never above the one before it.
      const order = joinOrder(plan);
      const positions = lock.tables.map((table) => order.indexOf(table));
      return positions.every((position, i) => position > (positions[i - 1] ?? -1));
    }
    case 'joinMethod':
      return plan.steps.every((step) => step.join === lock.method);
    case 'access': {
      // The inner table of an index nested loop has no scan to lock.
      const scanned = [
        plan.first,
        ...plan.steps.flatMap((step) => ('scan' in step ? [step.scan] : [])),
      ];
      const scan = scanned.find(({ table }) => table === lock.scan.table);
      return scan === undefined || sameScan(scan, lock.scan);
    }
  }
}

/** Whether the player may build `plan` under the level's locks. */
export function allowedByLocks(level: Level, plan: Plan): boolean {
  return level.locks.every((lock) => allowedBy(plan, lock));
}

export interface BestPlan {
  readonly plan: Plan;
  readonly cost: PlanCost;
}

/**
 * The cheapest plan over the whole plan space, ignoring locks. On a tie, the
 * first in enumeration order.
 */
export function bestPlan(level: Level): BestPlan {
  let best: BestPlan | undefined;
  for (const plan of enumeratePlans(level)) {
    const cost = planCost(level, plan);
    if (best === undefined || cost.total < best.cost.total) {
      best = { plan, cost };
    }
  }
  if (best === undefined) {
    throw new Error('The level has no plan: its join predicates do not connect its tables');
  }
  return best;
}
