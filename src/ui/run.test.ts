// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planCost, type Level, type Plan } from '../engine/index.ts';
import { LEVEL_IDS } from '../levels.ts';
import { formatRatio } from './format.ts';
import { describeMiss, worstMiss } from './reveal.ts';
import { MAX_RUNS, renderRun, timesBest } from './run.ts';

const read = (id: string): Level => JSON.parse(readFileSync(`levels/${id}.json`, 'utf8')) as Level;
const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const instant = { reducedMotion: () => true };

/** The result table as [plan, cost, times best] rows. */
const costs = (element: HTMLElement): string[][] =>
  [...element.querySelectorAll('.costs tr')].map((row) => [...row.children].map(text));

function runPlan(level: Level, plan: Plan, options = instant): HTMLElement {
  const run = renderRun(level, options);
  run.setPlan(plan);
  run.element.querySelector('button')?.click();
  return run.element;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('timesBest', () => {
  it('writes a cost as a multiple of the best', () => {
    expect(timesBest(241_332, 100_000)).toBe('2.41× best');
    expect(timesBest(6600, 6600)).toBe('1× best');
    expect(timesBest(0, 0)).toBe('0× best');
  });
});

describe('renderRun', () => {
  it('is hidden and cannot run until the plan is finished', () => {
    const run = renderRun(read('needle'), instant);
    const button = run.element.querySelector('button');
    const controls = run.element.querySelector<HTMLElement>('.run-controls');
    expect(button?.disabled).toBe(true);
    expect(run.element.hidden).toBe(true);
    expect(controls?.hidden).toBe(true);
    run.setPlan(read('needle').costs.bestPlan);
    expect(button?.disabled).toBe(false);
    expect(run.element.hidden).toBe(false);
    expect(controls?.hidden).toBe(false);
    expect(text(run.element.querySelector('.run-controls p'))).toBe('4 of 4 runs left.');
    run.setPlan(null);
    expect(button?.disabled).toBe(true);
    expect(run.element.hidden).toBe(true);
  });

  it('keeps the last result on show while the plan changes', () => {
    const level = read('needle');
    const run = renderRun(level, instant);
    run.setPlan(level.costs.bestPlan);
    run.element.querySelector('button')?.click();
    run.setPlan(null);
    expect(run.element.hidden).toBe(false);
    expect(run.element.querySelector<HTMLElement>('.run-controls')?.hidden).toBe(true);
    expect(run.element.querySelector('.verdict')).not.toBeNull();
  });

  // The acceptance test of #23: the result is the engine's, for every level.
  it.each(LEVEL_IDS)(
    'in %s shows the engine’s costs for PostgreSQL’s plan and the best plan',
    (id) => {
      const level = read(id);
      const { best, optimizer, bestPlan } = level.costs;
      expect(planCost(level, level.optimizer.plan).total).toBe(optimizer);
      expect(planCost(level, bestPlan).total).toBe(best);
      const rows = (yours: number): string[][] => [
        ['You', yours.toLocaleString('en-US'), timesBest(yours, best)],
        ['The Optimizer', optimizer.toLocaleString('en-US'), timesBest(optimizer, best)],
        ['Perfect plan', best.toLocaleString('en-US'), '1× best'],
      ];
      const miss = worstMiss(level);

      const asOptimizer = runPlan(level, level.optimizer.plan);
      expect(costs(asOptimizer)).toEqual(rows(optimizer));
      expect(text(asOptimizer.querySelector('.verdict'))).toBe(
        optimizer === best ? 'A tie. Yours is the perfect plan.' : 'A tie.',
      );
      // The yellow flag, only where the Optimizer's estimate was off by 3× or more.
      expect(text(asOptimizer.querySelector('.flag'))).toBe(
        miss === null ? '' : `Yellow flag. ${describeMiss(miss)}`,
      );

      const asBest = runPlan(level, bestPlan);
      expect(costs(asBest)).toEqual(rows(best));
      expect(text(asBest.querySelector('.verdict'))).toBe(
        best < optimizer
          ? `You beat the Optimizer by ${formatRatio(optimizer / best)}! Yours is the perfect plan.`
          : 'A tie. Yours is the perfect plan.',
      );
      expect([...asBest.querySelectorAll('.explanation p')].map(text)).toEqual(level.explanation);
    },
  );

  it('says by how much a win beat the Optimizer, and nothing more for a tie or a loss (#134)', () => {
    const needle = read('needle');
    // Reading every order costs 100,000; the Optimizer's cost changes the verdict.
    const seq: Plan = { first: { table: 'orders', access: 'seq' }, steps: [] };
    const against = (optimizer: number): string =>
      text(
        runPlan({ ...needle, costs: { ...needle.costs, optimizer } }, seq).querySelector(
          '.verdict',
        ),
      );
    // 1,000 against 37,000, and against 1,200, a hundred times over.
    expect(against(3_700_000)).toBe('You beat the Optimizer by 37×!');
    expect(against(120_000)).toBe('You beat the Optimizer by 1.2×!');
    expect(against(13_411_000)).toBe('You beat the Optimizer by 134.11×!');
    // A win too narrow to show in two decimals.
    expect(against(100_001)).toBe('You beat the Optimizer by a hair!');
    expect(against(100_000)).toBe('A tie.');
    expect(against(50_000)).toBe('The Optimizer wins.');
  });

  it('lists every operator with its cost, adding up to the total', () => {
    const level = read('in-order');
    const plan: Plan = {
      first: { table: 'parcels', access: 'index', index: 'parcels_pkey' },
      steps: [{ join: 'merge', scan: { table: 'orders', access: 'index', index: 'orders_pkey' } }],
    };
    const element = runPlan(level, plan);
    const { operators, total } = planCost(level, plan);
    const cell = (n: number): string[] =>
      [...element.querySelectorAll(`.operators li span:nth-child(${String(n)})`)].map(text);
    expect(cell(1)).toEqual([
      'Index scan of parcels through parcels_pkey',
      'Index scan of orders through orders_pkey, in stored order',
      'Sort for the merge join on parcels.order_id',
      'Merge join with orders',
      'Join output, 150,000 rows',
    ]);
    expect(cell(2)).toEqual(operators.map(({ cost }) => cost.toLocaleString('en-US')));
    expect(text(element.querySelector('.lane.you .count'))).toBe(total.toLocaleString('en-US'));
    expect(text(element.querySelector('.verdict'))).toBe('The Optimizer wins.');
    expect(element.querySelector('.verdict')?.classList.contains('lose')).toBe(true);
    expect(text(element.querySelector('.why summary'))).toBe('Why?');
  });

  it('names seq scans, hash joins, nested loops and sorts for the ORDER BY', () => {
    const level = read('in-order');
    const items = (plan: Plan): string[] =>
      [...runPlan(level, plan).querySelectorAll('.operators li span:first-child')].map(text);
    const seq = { table: 'orders', access: 'seq' } as const;
    const parcels = { table: 'parcels', access: 'seq' } as const;
    expect(items({ first: seq, steps: [{ join: 'hash', scan: parcels }] })).toEqual([
      'Seq scan of orders',
      'Seq scan of parcels',
      'Hash join with parcels',
      'Join output, 150,000 rows',
      'Sort for the ORDER BY on orders.order_id',
    ]);
    expect(items({ first: seq, steps: [{ join: 'nestedLoop', scan: parcels }] })[2]).toBe(
      'Nested loop with parcels',
    );
    expect(
      items({
        first: seq,
        steps: [{ join: 'indexNestedLoop', table: 'parcels', index: 'parcels_order_id_idx' }],
      })[1],
    ).toBe('Index nested loop with parcels');
  });

  it(`allows ${String(MAX_RUNS)} runs`, () => {
    const level = read('needle');
    const run = renderRun(level, instant);
    run.setPlan(level.costs.bestPlan);
    const button = run.element.querySelector('button');
    expect(text(button)).toBe('Race the Optimizer');
    for (let i = 0; i < MAX_RUNS; i += 1) button?.click();
    expect(text(button)).toBe('Race again');
    expect(button?.disabled).toBe(true);
    expect(text(run.element.querySelector('.run-controls p'))).toBe(
      'No runs left for this puzzle.',
    );
    run.setPlan(level.optimizer.plan);
    expect(button?.disabled).toBe(true);
  });

  it('races: the start lights, then both lanes fill, the cheaper first', async () => {
    const level = read('last-nights-migration');
    const waits: number[] = [];
    let resume = (): void => undefined;
    const wait = (ms: number): Promise<void> => {
      waits.push(ms);
      return new Promise((resolve) => {
        resume = resolve;
      });
    };
    const step = async (): Promise<void> => {
      resume();
      await Promise.resolve();
      await Promise.resolve();
    };
    const run = renderRun(level, { reducedMotion: () => false, wait });
    run.setPlan(level.costs.bestPlan);
    const button = run.element.querySelector('button');
    button?.click();
    const race = run.element.querySelector<HTMLElement>('.race');
    const lane = (kind: string, part: string): string =>
      text(run.element.querySelector(`.lane.${kind} ${part}`));
    expect(button?.disabled).toBe(true);
    expect(race?.hidden).toBe(false);
    expect(race?.getAttribute('aria-hidden')).toBe('true');
    expect(run.element.querySelectorAll('.lights .on')).toHaveLength(1);
    for (let i = 0; i < 5; i += 1) await step();
    expect(run.element.querySelectorAll('.lights .on')).toHaveLength(0);
    // Frame 10 of 24: the best plan (100,000) has finished, the Optimizer's (241,332) has not.
    for (let i = 0; i < 9; i += 1) await step();
    expect([lane('you', '.count'), lane('you', '.place')]).toEqual(['100,000', 'P1']);
    expect([lane('optimizer', '.count'), lane('optimizer', '.place')]).toEqual(['100,555', '']);
    expect(run.element.querySelector<HTMLElement>('.lane.optimizer .strip span')?.style.width).toBe(
      `${String((100 * (241_332 * 10)) / 24 / 241_332)}%`,
    );
    expect(run.element.querySelector('.result')?.children).toHaveLength(0);
    for (let i = 0; i < 15; i += 1) await step();
    expect(waits).toEqual([...Array<number>(5).fill(300), ...Array<number>(24).fill(100)]);
    expect([lane('optimizer', '.count'), lane('optimizer', '.place')]).toEqual(['241,332', 'P2']);
    expect(text(run.element.querySelector('.verdict'))).toBe(
      'You beat the Optimizer by 2.41×! Yours is the perfect plan.',
    );
    expect(button?.disabled).toBe(false);
    // A win waves the chequered flag once.
    const sweep = run.element.querySelector('.sweep');
    expect(sweep?.classList.contains('go')).toBe(true);
    sweep?.dispatchEvent(new Event('animationend'));
    expect(sweep?.classList.contains('go')).toBe(false);
  });

  it('skips the lights and the race with reduced motion, and only waves the flag for a win', async () => {
    const level = read('last-nights-migration');
    const element = runPlan(level, level.costs.bestPlan);
    expect(text(element.querySelector('.lane.you .place'))).toBe('P1');
    expect(element.querySelector('.sweep')?.classList.contains('go')).toBe(false);

    const tie = renderRun(level, { reducedMotion: () => false, wait: () => Promise.resolve() });
    tie.setPlan(level.optimizer.plan);
    tie.element.querySelector('button')?.click();
    await vi.waitFor(() => {
      expect(text(tie.element.querySelector('.verdict'))).toBe('A tie.');
    });
    expect(tie.element.querySelector('.sweep')?.classList.contains('go')).toBe(false);
  });

  it('animates with timers unless the player prefers reduced motion', async () => {
    vi.useFakeTimers();
    const level = read('needle');
    const run = renderRun(level);
    run.setPlan(level.costs.bestPlan);
    run.element.querySelector('button')?.click();
    expect(run.element.querySelector('.result')?.children).toHaveLength(0);
    await vi.runAllTimersAsync();
    expect(run.element.querySelector('.result .verdict')).not.toBeNull();
  });
});
