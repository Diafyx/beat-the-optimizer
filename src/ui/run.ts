/**
 * Running a plan: the cost builds up operator by operator, then the result
 * compares it with PostgreSQL's plan and the best plan, and shows the
 * level's explanation. Nothing hidden before the run (docs/level-format.md)
 * is read until the player runs a plan.
 */
import { planCost, type Level, type Operator, type Plan } from '../engine/index.ts';
import { el, type Child } from './dom.ts';
import { formatCount } from './format.ts';

/** Runs per puzzle. */
export const MAX_RUNS = 4;

/** The whole animation takes at most this long, however many operators there are. */
const ANIMATION_MS = 2400;
const STEP_MS = 400;

const code = (text: string): HTMLElement => el('code', {}, text);

const METHODS = {
  hash: 'Hash join',
  nestedLoop: 'Nested loop',
  merge: 'Merge join',
  indexNestedLoop: 'Index nested loop',
} as const;

const ratios = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** `cost` as a multiple of the best cost, such as `2.41× best`. */
export const timesBest = (cost: number, best: number): string =>
  `${ratios.format(cost / Math.max(best, 1))}× best`;

function operatorLabel(operator: Operator): Child[] {
  switch (operator.kind) {
    case 'seqScan':
      return ['Seq scan of ', code(operator.table)];
    case 'indexScan':
      return [
        'Index scan of ',
        code(operator.table),
        ' through ',
        code(operator.index),
        ...(operator.inOrder ? [', in stored order'] : []),
      ];
    case 'join':
      return [`${METHODS[operator.method]} with `, code(String(operator.tables.at(-1)))];
    case 'joinOutput':
      return [`Join output, ${formatCount(operator.rows)} rows`];
    case 'sort':
      return [
        operator.reason === 'orderBy' ? 'Sort for the ORDER BY on ' : 'Sort for the merge join on ',
        code(`${operator.column.table}.${operator.column.column}`),
      ];
  }
}

function verdict(yours: number, postgres: number, best: number): string {
  const against =
    yours < postgres
      ? 'You beat PostgreSQL!'
      : yours === postgres
        ? 'You tied with PostgreSQL.'
        : "PostgreSQL's plan is cheaper.";
  return yours === best ? `${against} Yours is the best possible plan.` : against;
}

function result(level: Level, yours: number): HTMLElement {
  const { best, optimizer } = level.costs;
  const row = (name: string, cost: number): HTMLElement =>
    el(
      'tr',
      {},
      el('th', { scope: 'row' }, name),
      el('td', {}, formatCount(cost)),
      el('td', {}, timesBest(cost, best)),
    );
  return el(
    'div',
    {},
    el('h4', {}, 'Result'),
    el('p', { class: 'verdict' }, verdict(yours, optimizer, best)),
    el(
      'table',
      { class: 'costs' },
      el('caption', {}, 'Rows touched'),
      el(
        'tbody',
        {},
        row('Your plan', yours),
        row("PostgreSQL's plan", optimizer),
        row('Best possible', best),
      ),
    ),
    el('h4', {}, 'What PostgreSQL did'),
    el(
      'div',
      { class: 'explanation' },
      ...level.explanation.map((paragraph) => el('p', {}, paragraph)),
    ),
  );
}

export interface RunOptions {
  /** Whether to skip the animation; by default, the `prefers-reduced-motion` setting. */
  readonly reducedMotion?: () => boolean;
  readonly wait?: (ms: number) => Promise<void>;
  /** Runs already used on this puzzle. */
  readonly used?: number;
  /** Called with the plan's cost when a run starts. */
  readonly onRun?: (cost: number) => void;
  /** Called with the plan's cost once its result is shown. */
  readonly onResult?: (cost: number) => void;
}

export interface RunView {
  readonly element: HTMLElement;
  /** The plan the Run button runs, or null while it is unfinished. */
  setPlan(plan: Plan | null): void;
}

/** The Run button, the cost meter and the result for `level`. */
export function renderRun(
  level: Level,
  {
    reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    used = 0,
    onRun = () => undefined,
    onResult = () => undefined,
  }: RunOptions = {},
): RunView {
  let plan: Plan | null = null;
  let left = Math.max(MAX_RUNS - used, 0);
  let running = false;
  const button = el('button', { type: 'button', class: 'run-button' }, 'Run your plan');
  const status = el('p', { class: 'label' });
  const operators = el('ol', { class: 'operators' });
  const total = el('p', { class: 'total' });
  const fill = el('div');
  const bar = el('div', { class: 'bar', 'aria-hidden': 'true' }, fill);
  const meter = el('div', { class: 'meter', hidden: '' }, operators, bar, total);
  const outcome = el('div', { class: 'result', 'aria-live': 'polite' });

  const update = (): void => {
    button.disabled = plan === null || left === 0 || running;
    status.textContent =
      left === 0
        ? 'No runs left for this puzzle.'
        : `${String(left)} of ${String(MAX_RUNS)} runs left.${plan === null ? ' Finish your plan to run it.' : ''}`;
  };

  button.addEventListener('click', () => {
    if (plan === null) return;
    void run(plan);
  });

  async function run(chosen: Plan): Promise<void> {
    running = true;
    left -= 1;
    update();
    const cost = planCost(level, chosen);
    onRun(cost.total);
    // The bar fills relative to the larger of the two plans' costs.
    const scale = Math.max(cost.total, level.costs.optimizer, 1);
    const still = reducedMotion();
    const step = Math.min(STEP_MS, ANIMATION_MS / Math.max(cost.operators.length, 1));
    let sum = 0;
    operators.replaceChildren();
    outcome.replaceChildren();
    meter.hidden = false;
    for (const operator of cost.operators) {
      sum += operator.cost;
      operators.append(
        el(
          'li',
          {},
          el('span', {}, ...operatorLabel(operator)),
          el('span', {}, formatCount(operator.cost)),
        ),
      );
      total.textContent = `Cost so far: ${formatCount(sum)}`;
      fill.style.width = `${String((100 * sum) / scale)}%`;
      if (!still) await wait(step);
    }
    total.textContent = `Your cost: ${formatCount(cost.total)}`;
    outcome.replaceChildren(result(level, cost.total));
    running = false;
    update();
    onResult(cost.total);
  }

  update();
  return {
    element: el(
      'section',
      { class: 'part run', 'aria-labelledby': 'run-title' },
      el('h3', { id: 'run-title' }, 'Run it'),
      el('div', { class: 'run-controls' }, button, status),
      meter,
      outcome,
    ),
    setPlan(next) {
      plan = next;
      update();
    },
  };
}
