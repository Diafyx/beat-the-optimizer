/**
 * The Optimizer's guesses: for each table with a filter, how many rows
 * PostgreSQL estimated would match it. This is the one part of `optimizer`
 * the player sees before a run (docs/level-format.md): it shows what the
 * Optimizer believes, not the true counts or the plan it chose.
 */
import type { ExplainNode, Level } from '../engine/index.ts';

/**
 * The guesses by table name. A scan on the inner side of a nested loop is
 * left out: its estimate is per loop, not for the whole filter.
 */
export function optimizerGuesses(level: Level): ReadonlyMap<string, number> {
  const guesses = new Map<string, number>();
  const filtered = new Set(
    level.tables.filter(({ filter }) => filter !== null).map(({ name }) => name),
  );
  const walk = (node: ExplainNode, inner: boolean): void => {
    const { relation } = node;
    if (relation !== null && !inner && filtered.has(relation) && !guesses.has(relation)) {
      guesses.set(relation, node.estimatedRows);
    }
    node.children.forEach((child, i) => {
      walk(child, inner || (node.nodeType === 'Nested Loop' && i === 1));
    });
  };
  walk(level.optimizer.explain, false);
  return guesses;
}
