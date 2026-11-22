import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enumeratePlans, planCost, type Level } from './engine/index.ts';
import { LEVEL_IDS } from './levels.ts';
import { shareText, square } from './share.ts';

const url = 'https://beat-the-optimizer.pages.dev/';

describe('square', () => {
  it('colours a run by how far it is from the best plan', () => {
    expect([1, 1.2, 1.5, 1.51, 3, 3.01, 40].map(square).join('')).toBe('🟩🟨🟨🟧🟧🟥🟥');
  });
});

describe('shareText', () => {
  // One snapshot per outcome. PostgreSQL's plan costs 241,332 here, and the best 100,000.
  const card = (costs: number[], optimizer = 241_332): string =>
    shareText({ puzzle: 10, costs, optimizer, best: 100_000, url });

  it('beating PostgreSQL with the best plan', () => {
    expect(card([241_332, 100_000])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟧🟩
      🏆 I beat PostgreSQL with the best plan
      Me: 1× best · PostgreSQL: 2.41× best
      https://beat-the-optimizer.pages.dev/"
    `);
  });

  it('beating PostgreSQL without the best plan', () => {
    expect(card([400_000, 120_000, 130_000])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟥🟨🟨
      🏆 I beat PostgreSQL
      Me: 1.2× best · PostgreSQL: 2.41× best
      https://beat-the-optimizer.pages.dev/"
    `);
  });

  it('tying with PostgreSQL', () => {
    expect(card([241_332])).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟧
      🤝 I tied with PostgreSQL
      Me: 2.41× best · PostgreSQL: 2.41× best
      https://beat-the-optimizer.pages.dev/"
    `);
  });

  it('tying with PostgreSQL when its plan is the best', () => {
    expect(card([100_000], 100_000)).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟩
      🤝 I tied with PostgreSQL with the best plan
      Me: 1× best · PostgreSQL: 1× best
      https://beat-the-optimizer.pages.dev/"
    `);
  });

  it('losing to PostgreSQL in four runs', () => {
    expect(card([520_000, 400_000, 300_000, 280_000], 260_000)).toMatchInlineSnapshot(`
      "Beat the Optimizer #10
      🟥🟥🟧🟧
      🐘 PostgreSQL won
      Me: 2.8× best · PostgreSQL: 2.6× best
      https://beat-the-optimizer.pages.dev/"
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
