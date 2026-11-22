// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planCost, type Level, type Plan } from '../engine/index.ts';
import { LEVEL_IDS } from '../levels.ts';
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
        ['Your plan', yours.toLocaleString('en-US'), timesBest(yours, best)],
        ["PostgreSQL's plan", optimizer.toLocaleString('en-US'), timesBest(optimizer, best)],
        ['Best possible', best.toLocaleString('en-US'), '1× best'],
      ];

      const asPostgres = runPlan(level, level.optimizer.plan);
      expect(costs(asPostgres)).toEqual(rows(optimizer));
      expect(text(asPostgres.querySelector('.verdict'))).toBe(
        optimizer === best
          ? 'You tied with PostgreSQL. Yours is the best possible plan.'
          : 'You tied with PostgreSQL.',
      );

      const asBest = runPlan(level, bestPlan);
      expect(costs(asBest)).toEqual(rows(best));
      expect(text(asBest.querySelector('.verdict'))).toBe(
        best < optimizer
          ? 'You beat PostgreSQL! Yours is the best possible plan.'
          : 'You tied with PostgreSQL. Yours is the best possible plan.',
      );
      expect([...asBest.querySelectorAll('.explanation p')].map(text)).toEqual(level.explanation);
    },
  );

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
    expect(text(element.querySelector('.total'))).toBe(
      `Your cost: ${total.toLocaleString('en-US')}`,
    );
    expect(text(element.querySelector('.verdict'))).toBe("PostgreSQL's plan is cheaper.");
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
    for (let i = 0; i < MAX_RUNS; i += 1) button?.click();
    expect(button?.disabled).toBe(true);
    expect(text(run.element.querySelector('.run-controls p'))).toBe(
      'No runs left for this puzzle.',
    );
    run.setPlan(level.optimizer.plan);
    expect(button?.disabled).toBe(true);
  });

  it('builds the cost up one operator at a time, then shows the result', async () => {
    const level = read('every-shipped-order');
    const waits: number[] = [];
    let resume = (): void => undefined;
    const wait = (ms: number): Promise<void> => {
      waits.push(ms);
      return new Promise((resolve) => {
        resume = resolve;
      });
    };
    const run = renderRun(level, { reducedMotion: () => false, wait });
    run.setPlan(level.optimizer.plan);
    const button = run.element.querySelector('button');
    button?.click();
    expect(button?.disabled).toBe(true);
    expect(run.element.querySelectorAll('.operators li')).toHaveLength(1);
    expect(text(run.element.querySelector('.total'))).toBe('Cost so far: 100,000');
    expect(run.element.querySelector<HTMLElement>('.bar div')?.style.width).toBe(
      `${String(100_000 / 2600)}%`,
    );
    expect(run.element.querySelector('.result')?.children).toHaveLength(0);
    for (let i = 0; i < 4; i += 1) {
      resume();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(waits).toEqual([400, 400, 400, 400]);
    expect(text(run.element.querySelector('.total'))).toBe('Your cost: 260,000');
    expect(run.element.querySelector('.result h4')?.textContent).toBe('Result');
    expect(button?.disabled).toBe(false);
  });

  it('animates with timers unless the player prefers reduced motion', async () => {
    vi.useFakeTimers();
    const level = read('needle');
    const run = renderRun(level);
    run.setPlan(level.costs.bestPlan);
    run.element.querySelector('button')?.click();
    expect(run.element.querySelector('.result')?.children).toHaveLength(0);
    await vi.runAllTimersAsync();
    expect(run.element.querySelector('.result h4')?.textContent).toBe('Result');
  });
});
