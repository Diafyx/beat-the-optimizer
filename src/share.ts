/**
 * The share card: a spoiler-free result as text. It has the puzzle number,
 * one square per run and how the player's best run and the Optimizer's plan
 * (PostgreSQL's) compare with the perfect plan. It never names a table, index
 * or join method.
 */

/** A run's square, by its cost as a multiple of the best cost. */
export function square(ratio: number): string {
  if (ratio <= 1) return '🟩';
  if (ratio <= 1.5) return '🟨';
  if (ratio <= 3) return '🟧';
  return '🟥';
}

const ratios = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export interface ShareInput {
  readonly puzzle: number;
  /** The cost of each run, in order; at least one. */
  readonly costs: readonly number[];
  /** The Optimizer's cost and the best cost (`costs.optimizer` and `costs.best`). */
  readonly optimizer: number;
  readonly best: number;
  /** The link to the game. */
  readonly url: string;
}

/** The text to share. */
export function shareText({ puzzle, costs, optimizer, best, url }: ShareInput): string {
  const times = (cost: number): string => `${ratios.format(cost / Math.max(best, 1))}×`;
  const mine = Math.min(...costs);
  const outcome =
    mine < optimizer
      ? '🏆 I beat the Optimizer'
      : mine === optimizer
        ? '🤝 I tied with the Optimizer'
        : '🏁 The Optimizer won';
  return [
    `Beat the Optimizer #${String(puzzle)}`,
    costs.map((cost) => square(cost / Math.max(best, 1))).join(''),
    `${outcome}${mine === best ? ' with the perfect plan' : ''}`,
    `Me: ${times(mine)} best · Optimizer: ${times(optimizer)} best`,
    url,
  ].join('\n');
}
