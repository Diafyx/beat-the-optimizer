/**
 * The reveal after a run: the Optimizer's worst row estimate, when it was
 * off by 3 times or more. It compares each scan and join in PostgreSQL's
 * EXPLAIN with the true counts, so it reads `optimizer` and `cardinalities`,
 * and is only called once the player has run a plan (docs/level-format.md).
 */
import type { ExplainNode, Level } from '../engine/index.ts';
import { formatCount } from './format.ts';

/** How far off an estimate must be to be shown. */
export const WRONG_BY = 3;

export interface Miss {
  /** A table, or the tables of a join, such as `orders` or `orders and customers`. */
  readonly what: string;
  readonly expected: number;
  readonly actual: number;
}

const relations = (node: ExplainNode): string[] =>
  node.relation === null ? node.children.flatMap(relations) : [node.relation];

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name) => b.includes(name));

/** How many times one count is the other, either way; a count of 0 counts as 1. */
const factor = ({ expected, actual }: Miss): number =>
  Math.max(expected, actual) / Math.max(Math.min(expected, actual), 1);

/**
 * The scan or join whose estimate was furthest off, if it was off by
 * {@link WRONG_BY} or more; on a tie, the deeper one. Scans and joins on the
 * inner side of a nested loop are left out: their estimates are per loop.
 */
export function worstMiss(level: Level): Miss | null {
  const { scans, joins } = level.cardinalities;
  const misses: Miss[] = [];
  const walk = (node: ExplainNode, inner: boolean): void => {
    if (inner) return;
    const scan = scans.find(({ table }) => table === node.relation);
    if (scan !== undefined && node.nodeType.endsWith('Scan')) {
      misses.push({ what: scan.table, expected: node.estimatedRows, actual: scan.filtered });
    }
    const tables = [...new Set(relations(node))];
    const join = joins.find((j) => sameSet(j.tables, tables));
    if (join !== undefined && /Join|Nested Loop/.test(node.nodeType)) {
      misses.push({ what: tables.join(' and '), expected: node.estimatedRows, actual: join.rows });
    }
    node.children.forEach((child, i) => {
      walk(child, node.nodeType === 'Nested Loop' && i === 1);
    });
  };
  walk(level.optimizer.explain, false);
  const worst = misses.reduce<Miss | null>(
    (found, miss) => (found === null || factor(miss) >= factor(found) ? miss : found),
    null,
  );
  return worst !== null && factor(worst) >= WRONG_BY ? worst : null;
}

const rows = (n: number): string => `${formatCount(n)} ${n === 1 ? 'row' : 'rows'}`;

/** The reveal as a sentence, such as "The Optimizer expected 10 rows from orders. It got 10,000: 1,000× more." */
export function describeMiss(miss: Miss): string {
  const way = miss.actual > miss.expected ? 'more' : 'fewer';
  return `The Optimizer expected ${rows(miss.expected)} from ${miss.what}. It got ${formatCount(miss.actual)}: ${formatCount(Math.round(factor(miss)))}× ${way}.`;
}
