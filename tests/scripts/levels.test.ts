import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelChecker } from '../../scripts/lib/levels.ts';

const check = levelChecker(readFileSync('schema/level.schema.json', 'utf8'));
const exampleText = readFileSync('tests/fixtures/example-level.json', 'utf8');
const example = JSON.parse(exampleText) as { costs: { best: number }; tables: { rows: number }[] };

describe('levelChecker', () => {
  it('accepts the example level', () => {
    expect(check(exampleText)).toEqual([]);
  });

  it('reports text that is not JSON', () => {
    expect(check('{')).toEqual([expect.stringMatching(/^not valid JSON: /)]);
  });

  it('reports every schema error, and skips the rules', () => {
    const level = structuredClone(example);
    level.costs.best = -1;
    Object.assign(level, { difficulty: 'hard' });
    level.tables.push(...structuredClone(level.tables), ...structuredClone(level.tables));
    expect(check(JSON.stringify(level))).toEqual([
      'schema: level must NOT have additional properties: difficulty',
      'schema: level/tables must NOT have more than 3 items',
      'schema: level/costs/best must be >= 0',
    ]);
  });

  it('reports the rules a schema-valid level breaks', () => {
    const level = structuredClone(example);
    level.costs.best = 3000;
    expect(check(JSON.stringify(level))).toEqual([
      'rule 6: costs.best is 3000, but the best plan costs 3080',
      'rule 6: costs.bestPlan costs 3080, not costs.best',
    ]);
  });
});
