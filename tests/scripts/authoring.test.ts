import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { EXAMPLE, authoringTargets, retry } from '../../scripts/lib/authoring.ts';

describe('authoringTargets', () => {
  it('writes the example, then one level file per spec, in name order', () => {
    expect(
      authoringTargets(
        [],
        ['levels/specs/two.yaml', 'levels/specs/one.yaml'],
        ['levels/one.json', 'levels/two.json'],
      ),
    ).toEqual([
      EXAMPLE,
      { spec: 'levels/specs/one.yaml', level: 'levels/one.json' },
      { spec: 'levels/specs/two.yaml', level: 'levels/two.json' },
    ]);
  });

  it('writes only the example when there are no specs', () => {
    expect(authoringTargets([], [], [])).toEqual([EXAMPLE]);
  });

  it('fails on a level file with no spec', () => {
    expect(() =>
      authoringTargets(
        [],
        ['levels/specs/one.yaml'],
        ['levels/one.json', 'levels/old.json', 'levels/gone.json'],
      ),
    ).toThrow('These level files have no spec in levels/specs/: levels/old.json, levels/gone.json');
  });

  it('takes no arguments', () => {
    expect(() => authoringTargets(['spec.yaml'], [], [])).toThrow(
      'Usage: npm run author-level (it takes no arguments)',
    );
  });
});

describe('retry', () => {
  const failing = (failures: number) => {
    let calls = 0;
    return () => {
      calls += 1;
      if (calls <= failures) throw new Error(`failure ${String(calls)}`);
      return calls;
    };
  };

  it('returns the first result that does not throw, waiting between tries', () => {
    let waits = 0;
    expect(retry(failing(2), () => (waits += 1), 3)).toBe(3);
    expect(waits).toBe(2);
  });

  it('rethrows the last error once it has tried `times` times', () => {
    let waits = 0;
    expect(() => retry(failing(3), () => (waits += 1), 3)).toThrow('failure 3');
    expect(waits).toBe(2);
  });
});

// PostgreSQL's version is in every level file, so it changes only on purpose:
// a new digest regenerates every level.
describe('the authoring PostgreSQL image', () => {
  it('is PostgreSQL 18, pinned by digest', () => {
    const workflow = parse(readFileSync('.github/workflows/authoring.yml', 'utf8')) as {
      jobs: { author: { services: { postgres: { image: string } } } };
    };
    expect(workflow.jobs.author.services.postgres.image).toMatch(
      /^postgres:18\.[0-9]+-trixie@sha256:[0-9a-f]{64}$/,
    );
  });
});
