/**
 * The "rows touched" cost model from docs/cost-model.md and ADR 0002.
 *
 * planCost scores one plan from the level's true cardinalities and returns the
 * cost of every operator, so the game can show the breakdown. It checks only
 * what it needs to compute the cost; full plan validation is separate.
 */
import type { ColumnRef, Index, JoinMethod, Level, Plan, Scan, Table } from './level.ts';
import { ceilLog2 } from './math.ts';

/** An index lookup jumps to a random place: PostgreSQL's random_page_cost. */
export const RANDOM_ACCESS = 4;

export type SortReason = 'mergeLeft' | 'mergeRight' | 'orderBy';

/** One operator of a costed plan. `rows` is what the operator outputs. */
export type Operator =
  | {
      readonly kind: 'seqScan';
      readonly table: string;
      readonly rows: number;
      readonly cost: number;
    }
  | {
      readonly kind: 'indexScan';
      readonly table: string;
      readonly index: string;
      /** The table is stored in the index's order, so the lookups read in order. */
      readonly inOrder: boolean;
      readonly rows: number;
      readonly cost: number;
    }
  | {
      readonly kind: 'join';
      readonly method: JoinMethod;
      /** The tables joined so far, including this step's table. */
      readonly tables: readonly string[];
      readonly rows: number;
      readonly cost: number;
    }
  | {
      readonly kind: 'joinOutput';
      readonly tables: readonly string[];
      readonly rows: number;
      readonly cost: number;
    }
  | {
      readonly kind: 'sort';
      readonly reason: SortReason;
      readonly column: ColumnRef;
      readonly rows: number;
      readonly cost: number;
    };

export interface PlanCost {
  readonly operators: readonly Operator[];
  readonly total: number;
}

const key = (ref: ColumnRef): string => `${ref.table}.${ref.column}`;

function find<T>(items: readonly T[], match: (item: T) => boolean, what: string): T {
  const found = items.find(match);
  if (found === undefined) {
    throw new Error(`The level has no ${what}`);
  }
  return found;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name) => b.includes(name));

/**
 * Columns known to be equal in every row so far, from the join predicates
 * applied. Order on one column of a class is order on all of them.
 */
class EqualColumns {
  private readonly classes = new Map<string, ReadonlySet<string>>();

  of(column: string): ReadonlySet<string> {
    return this.classes.get(column) ?? new Set([column]);
  }

  merge(a: string, b: string): void {
    const merged = new Set([...this.of(a), ...this.of(b)]);
    for (const column of merged) {
      this.classes.set(column, merged);
    }
  }
}

/**
 * The first join predicate between `tables` and the table `next`, as
 * [column of `tables`, column of `next`], or undefined if there is none.
 */
export function joinPredicate(
  level: Level,
  tables: readonly string[],
  next: string,
): readonly [ColumnRef, ColumnRef] | undefined {
  const predicate = level.joins.find(
    ({ left, right }) =>
      (tables.includes(left.table) && right.table === next) ||
      (tables.includes(right.table) && left.table === next),
  );
  if (predicate === undefined) {
    return undefined;
  }
  return predicate.right.table === next
    ? [predicate.left, predicate.right]
    : [predicate.right, predicate.left];
}

interface ScanResult {
  readonly operator: Operator;
  readonly rows: number;
  /** The column the output is in order of, or null. */
  readonly order: string | null;
}

class PlanCoster {
  private readonly operators: Operator[] = [];
  private readonly equal = new EqualColumns();
  private total = 0;
  private readonly level: Level;

  constructor(level: Level) {
    this.level = level;
  }

  cost(plan: Plan): PlanCost {
    const first = this.scan(plan.first);
    this.push(first.operator);
    const tables = [plan.first.table];
    let rows = first.rows;
    let order = first.order;

    for (const step of plan.steps) {
      const table = step.join === 'indexNestedLoop' ? step.table : step.scan.table;
      if (tables.includes(table)) {
        throw new Error(`The plan joins ${table} twice`);
      }
      const [left, right] = this.predicate(tables, table);
      const outer = [...tables];
      tables.push(table);
      const joined = [...tables];
      const output = this.joinRows(joined);
      let joinCost: number;

      switch (step.join) {
        case 'hash': {
          const scanned = this.scan(step.scan);
          this.push(scanned.operator);
          joinCost = rows + scanned.rows;
          order = null;
          break;
        }
        case 'nestedLoop': {
          const scanned = this.scan(step.scan);
          this.push(scanned.operator);
          joinCost = rows * scanned.rows;
          break;
        }
        case 'merge': {
          const scanned = this.scan(step.scan);
          this.push(scanned.operator);
          if (!this.inOrder(order, left)) {
            this.sort('mergeLeft', left, rows);
          }
          if (!this.inOrder(scanned.order, right)) {
            this.sort('mergeRight', right, scanned.rows);
          }
          joinCost = rows + scanned.rows;
          order = key(left);
          break;
        }
        case 'indexNestedLoop': {
          const index = this.index(this.table(table), step.index);
          if (index.column !== right.column) {
            throw new Error(
              `The index ${index.name} is on ${table}.${index.column}, not on the join column ${key(right)}`,
            );
          }
          const lookup = find(
            this.level.cardinalities.lookups,
            (entry) => entry.index === index.name && sameSet(entry.outer, outer),
            `lookup cardinality for ${index.name}`,
          );
          joinCost = RANDOM_ACCESS * (rows + lookup.fetched);
          break;
        }
      }

      this.equal.merge(key(left), key(right));
      this.push({ kind: 'join', method: step.join, tables: joined, rows: output, cost: joinCost });
      this.push({ kind: 'joinOutput', tables: joined, rows: output, cost: output });
      rows = output;
    }

    const orderBy = this.level.orderBy;
    if (orderBy !== null && !this.inOrder(order, orderBy)) {
      this.sort('orderBy', orderBy, rows);
    }
    return { operators: this.operators, total: this.total };
  }

  /** Adds an operator, refusing a total that JSON cannot hold exactly. */
  private push(operator: Operator): void {
    const total = this.total + operator.cost;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(`The plan costs more than 2^53 - 1`);
    }
    this.operators.push(operator);
    this.total = total;
  }

  private sort(reason: SortReason, column: ColumnRef, rows: number): void {
    this.push({ kind: 'sort', reason, column, rows, cost: rows * ceilLog2(rows) });
  }

  private inOrder(order: string | null, column: ColumnRef): boolean {
    return order !== null && this.equal.of(order).has(key(column));
  }

  private table(name: string): Table {
    return find(this.level.tables, (table) => table.name === name, `table ${name}`);
  }

  private index(table: Table, name: string): Index {
    return find(table.indexes, (index) => index.name === name, `index ${name} on ${table.name}`);
  }

  private predicate(tables: readonly string[], next: string): readonly [ColumnRef, ColumnRef] {
    const predicate = joinPredicate(this.level, tables, next);
    if (predicate === undefined) {
      throw new Error(`The level has no join predicate between ${tables.join(', ')} and ${next}`);
    }
    return predicate;
  }

  private joinRows(tables: readonly string[]): number {
    return find(
      this.level.cardinalities.joins,
      (entry) => sameSet(entry.tables, tables),
      `join cardinality for ${tables.join(', ')}`,
    ).rows;
  }

  private scan(scan: Scan): ScanResult {
    const table = this.table(scan.table);
    const cardinality = find(
      this.level.cardinalities.scans,
      (entry) => entry.table === table.name,
      `scan cardinality for ${table.name}`,
    );
    const rows = cardinality.filtered;

    if (scan.access === 'seq') {
      return {
        operator: { kind: 'seqScan', table: table.name, rows, cost: table.rows },
        rows,
        order: table.storedOrder === null ? null : `${table.name}.${table.storedOrder}`,
      };
    }

    const index = this.index(table, scan.index);
    const matched = find(
      cardinality.indexes,
      (entry) => entry.index === index.name,
      `index cardinality for ${index.name}`,
    ).matched;
    const inOrder = table.storedOrder === index.column;
    return {
      operator: {
        kind: 'indexScan',
        table: table.name,
        index: index.name,
        inOrder,
        rows,
        cost: (inOrder ? 1 : RANDOM_ACCESS) * matched,
      },
      rows,
      order: `${table.name}.${index.column}`,
    };
  }
}

/** The cost of a plan for a level, per operator and in total. */
export function planCost(level: Level, plan: Plan): PlanCost {
  return new PlanCoster(level).cost(plan);
}
