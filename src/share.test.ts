import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enumeratePlans, planCost, type Level } from './engine/index.ts';
import { LEVEL_IDS } from './levels.ts';
import { shareText, square } from './share.ts';

const url = 'https://beat-the-optimizer.invalid/';

describe('square', () => {
  it('colours a run by how far it is from the best plan', () => {
    expect([1, 1.2, 1.5, 1.51, 3, 3.01, 40].map(square).join('')).toBe('🟩🟨🟨🟧🟧🟥🟥');
  });
});

describe('shareText', () => {
  // One snapshot per outcome. The Optimizer's plan costs 241,332 here, and the best 100,000.
  const card = (costs: number[], optimizer = 241_332): string =>
    shareText({ puzzle: 10, costs, optimizer, best: 100_000, url });

  it('beating the Optimizer with the perfect plan', () => {
    expect(card([241_332, 100_000])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟧🟩
      🏆 I beat the Optimizer with the perfect plan
      Me: 1× best · Optimizer: 2.41× best
      https://beat-the-optimizer.invalid/"
    `);
  });

  it('beating the Optimizer without the perfect plan', () => {
    expect(card([400_000, 120_000, 130_000])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟥🟨🟨
      🏆 I beat the Optimizer
      Me: 1.2× best · Optimizer: 2.41× best
      https://beat-the-optimizer.invalid/"
    `);
  });

  it('tying with the Optimizer', () => {
    expect(card([241_332])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟧
      🤝 I tied with the Optimizer
      Me: 2.41× best · Optimizer: 2.41× best
      https://beat-the-optimizer.invalid/"
    `);
  });

  it('tying with the Optimizer when its plan is the perfect one', () => {
    expect(card([100_000], 100_000)).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟩
      🤝 I tied with the Optimizer with the perfect plan
      Me: 1× best · Optimizer: 1× best
      https://beat-the-optimizer.invalid/"
    `);
  });

  it('losing to the Optimizer in four runs', () => {
    expect(card([520_000, 400_000, 300_000, 280_000], 260_000)).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟥🟥🟧🟧
      🏁 The Optimizer won
      Me: 2.8× best · Optimizer: 2.6× best
      https://beat-the-optimizer.invalid/"
    `);
  });

  // The card must not give the plan away.
  it('names no table, column, index or join method in any level', () => {
    const words = ['hash', 'nested', 'loop', 'merge', 'join', 'scan', 'index', 'seq', 'sort'];
    for (const id of LEVEL_IDS) {
      const level = JSON.parse(readFileSync(`levels/${id}.json`, 'utf8')) as Level;
      const names = level.tables.flatMap((table) => [
        table.name,
        ...table.columns.map(({ name }) => name),
        ...table.indexes.map(({ name }) => name),
      ]);
      const costs = enumeratePlans(level)
        .slice(0, 4)
        .map((plan) => planCost(level, plan).total);
      const { optimizer, best } = level.costs;
      const text = shareText({ puzzle: 1, costs, optimizer, best, url }).toLowerCase();
      for (const word of [...words, ...names]) expect(text).not.toContain(word.toLowerCase());
    }
  });
});
