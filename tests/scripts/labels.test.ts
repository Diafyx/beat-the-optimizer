import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// .github/labels.yml is read by EndBug/label-sync, which rejects a colour that
// YAML parses as a number (for example an unquoted 5319e7 is 5.319e10).
const labels: unknown = parse(readFileSync('.github/labels.yml', 'utf8'));

describe('.github/labels.yml', () => {
  it('is a list of labels with a name, a six-digit hex colour string and a description', () => {
    expect(Array.isArray(labels)).toBe(true);
    for (const label of labels as unknown[]) {
      expect(label).toEqual({
        name: expect.any(String) as unknown,
        color: expect.stringMatching(/^[0-9a-f]{6}$/) as unknown,
        description: expect.any(String) as unknown,
      });
    }
  });

  it('has unique names and keeps the release-please labels', () => {
    const names = (labels as { name: string }[]).map((label) => label.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('autorelease: pending');
    expect(names).toContain('autorelease: tagged');
  });
});
