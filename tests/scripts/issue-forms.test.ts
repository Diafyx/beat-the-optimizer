import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Field {
  id?: string;
  attributes: { label?: string };
}

const task = parse(readFileSync('.github/ISSUE_TEMPLATE/task.yml', 'utf8')) as { body: Field[] };

describe('.github/ISSUE_TEMPLATE/task.yml', () => {
  it('asks for a summary, scope, acceptance criteria and notes', () => {
    expect(task.body.map((field) => field.id).filter(Boolean)).toEqual([
      'summary',
      'scope',
      'acceptance',
      'notes',
    ]);
  });

  it('has no size estimate: only pull requests are sized, by CI (#117)', () => {
    for (const field of task.body) {
      expect(field.id).not.toBe('size');
      expect(field.attributes.label ?? '').not.toMatch(/size/i);
    }
  });
});
