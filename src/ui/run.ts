/**
 * Running a plan, as a race against the Optimizer: the start lights, then two
 * lanes fill with the points (rows touched) of each plan, and the cheaper
 * plan finishes first. Then the result: a yellow flag when the Optimizer's
 * estimate was off by 3 times or more, the verdict, the timing tower and,
 * folded away, why. Nothing hidden before the run (docs/level-format.md) is
 * read until the player races.
 */
import { planCost, type Level, type Operator, type Plan } from '../engine/index.ts';
import { el, type Child } from './dom.ts';
import { formatCount } from './format.ts';
import { describeMiss, worstMiss } from './reveal.ts';

/** Runs per puzzle. */
export const MAX_RUNS = 4;

/** Five start lights come on one at a time, then go out. */
const LIGHTS = 5;
const LIGHT_MS = 300;
/** The slower plan takes RACE_MS to finish, in FRAMES steps. */
const RACE_MS = 2400;
const FRAMES = 24;

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

function verdict(yours: number, optimizer: number, best: number): string {
  const against =
    yours < optimizer
      ? 'You beat the Optimizer!'
      : yours === optimizer
        ? 'A tie.'
        : 'The Optimizer wins.';
  return yours === best ? `${against} Yours is the perfect plan.` : against;
}

function result(level: Level, yours: number, operators: readonly Operator[]): HTMLElement[] {
  const { best, optimizer } = level.costs;
  const miss = worstMiss(level);
  const row = (name: string, cost: number): HTMLElement =>
    el(
      'tr',
      {},
      el('th', { scope: 'row' }, name),
      el('td', {}, formatCount(cost)),
      el('td', {}, timesBest(cost, best)),
    );
  return [
    ...(miss === null
      ? []
      : [el('p', { class: 'flag' }, el('b', {}, 'Yellow flag. '), describeMiss(miss))]),
    el(
      'p',
      { class: yours > optimizer ? 'verdict lose' : 'verdict' },
      verdict(yours, optimizer, best),
    ),
    el(
      'table',
      { class: 'costs' },
      el('caption', {}, 'Points: the rows each plan touches'),
      el(
        'tbody',
        {},
        row('You', yours),
        row('The Optimizer', optimizer),
        row('Perfect plan', best),
      ),
    ),
    el(
      'details',
      { class: 'why' },
      el('summary', {}, 'Why?'),
      el('h4', {}, 'What the Optimizer did'),
      el(
        'div',
        { class: 'explanation' },
        ...level.explanation.map((paragraph) => el('p', {}, paragraph)),
      ),
      el('h4', {}, 'Your plan, step by step'),
      el(
        'ol',
        { class: 'operators' },
        ...operators.map((operator) =>
          el(
            'li',
            {},
            el('span', {}, ...operatorLabel(operator)),
            el('span', {}, formatCount(operator.cost)),
          ),
        ),
      ),
    ),
  ];
}

/** A lane of the race: who, the points so far, a strip that fills, and the place. */
function lane(name: string, kind: string) {
  const count = el('span', { class: 'count' });
  const place = el('span', { class: 'place' });
  const fill = el('span');
  const element = el(
    'div',
    { class: `lane ${kind}` },
    el('span', { class: 'who' }, name),
    count,
    place,
    el('div', { class: 'strip' }, fill),
  );
  return {
    element,
    show(points: number, scale: number, finished: string): void {
      count.textContent = formatCount(points);
      fill.style.width = `${String((100 * points) / scale)}%`;
      place.textContent = finished;
      element.classList.toggle('done', finished !== '');
    },
  };
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
  const button = el('button', { type: 'button', class: 'run-button' }, 'Race the Optimizer');
  const status = el('p', { class: 'label' });
  const lights = el(
    'div',
    { class: 'lights' },
    ...Array.from({ length: LIGHTS }, () => el('span')),
  );
  const you = lane('You', 'you');
  const optimizer = lane('The Optimizer', 'optimizer');
  // The lanes only show the race; the result below says who won.
  const race = el(
    'div',
    { class: 'race', 'aria-hidden': 'true', hidden: '' },
    lights,
    you.element,
    optimizer.element,
  );
  const sweep = el('div', { class: 'sweep', 'aria-hidden': 'true' });
  sweep.addEventListener('animationend', () => {
    sweep.classList.remove('go');
  });
  const outcome = el('div', { class: 'result', 'aria-live': 'polite' });
  const controls = el('div', { class: 'run-controls' }, button, status);
  const section = el(
    'section',
    { class: 'part run', 'aria-labelledby': 'run-title' },
    el('h3', { id: 'run-title' }, 'The race'),
    controls,
    race,
    outcome,
    sweep,
  );

  const update = (): void => {
    // Until the plan is ready, the bar is hidden; so is the section, before a race.
    controls.hidden = plan === null;
    section.hidden = plan === null && race.hidden;
    button.disabled = plan === null || left === 0 || running;
    status.textContent =
      left === 0
        ? 'No runs left for this puzzle.'
        : `${String(left)} of ${String(MAX_RUNS)} runs left.`;
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
    const theirs = level.costs.optimizer;
    onRun(cost.total);
    const still = reducedMotion();
    // Both lanes on the same scale: the slower plan fills its lane.
    const scale = Math.max(cost.total, theirs, 1);
    const lanes = [
      [you, cost.total, cost.total <= theirs ? 'P1' : 'P2'],
      [optimizer, theirs, theirs <= cost.total ? 'P1' : 'P2'],
    ] as const;
    outcome.replaceChildren();
    race.hidden = false;
    for (const [view] of lanes) view.show(0, scale, '');
    if (!still) {
      for (const light of lights.children) {
        light.classList.add('on');
        await wait(LIGHT_MS);
      }
      for (const light of lights.children) light.classList.remove('on');
    }
    for (let frame = still ? FRAMES : 1; frame <= FRAMES; frame += 1) {
      const at = (scale * frame) / FRAMES;
      for (const [view, points, place] of lanes) {
        view.show(Math.min(points, at), scale, points <= at ? place : '');
      }
      if (!still) await wait(RACE_MS / FRAMES);
    }
    if (cost.total < theirs && !still) sweep.classList.add('go');
    outcome.replaceChildren(...result(level, cost.total, cost.operators));
    running = false;
    button.textContent = 'Race again';
    update();
    onResult(cost.total);
  }

  update();
  return {
    element: section,
    setPlan(next) {
      plan = next;
      update();
    },
  };
}
