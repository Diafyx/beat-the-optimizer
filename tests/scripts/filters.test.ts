import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFilters, unmatchedFiles } from '../../scripts/lib/filters.ts';

describe('parseFilters', () => {
  it('reads groups of string patterns and flattens nested lists', () => {
    const groups = parseFilters(
      ['shared: &shared', '  - package.json', 'app:', '  - src/**', '  - *shared'].join('\n'),
    );
    expect(groups).toEqual({ shared: ['package.json'], app: ['src/**', 'package.json'] });
  });

  it.each([
    ['a list', '- src/**'],
    ['a scalar', 'src/**'],
    ['an empty file', ''],
  ])('rejects %s at the top level', (_, text) => {
    expect(() => parseFilters(text)).toThrow(/must be a mapping/);
  });

  it('rejects a group that is not a list', () => {
    expect(() => parseFilters('app: src/**')).toThrow(/group "app" must be a list/);
  });

  it.each([
    ['an empty group', 'app: []'],
    ['a change-type rule', 'app:\n  - added: src/**'],
  ])('rejects %s', (_, text) => {
    expect(() => parseFilters(text)).toThrow(/group "app" must contain only string patterns/);
  });
});

describe('unmatchedFiles', () => {
  const groups = { app: ['src/**'], ci: ['.github/**'], docs: ['**/*.md'] };

  it('returns nothing when every file matches a group', () => {
    expect(
      unmatchedFiles(
        ['src/main.ts', '.github/workflows/ci.yml', 'docs/a/b.md', 'README.md'],
        groups,
      ),
    ).toEqual([]);
  });

  it('reports a file in a new top-level folder', () => {
    expect(unmatchedFiles(['src/main.ts', 'newdir/file.ts', 'Makefile'], groups)).toEqual([
      'newdir/file.ts',
      'Makefile',
    ]);
  });

  it('matches dotfiles inside globs, as paths-filter does', () => {
    expect(unmatchedFiles(['src/.hidden/x.ts', '.github/.keep'], groups)).toEqual([]);
  });
});

describe('.github/filters.yml', () => {
  it('parses', () => {
    const groups = parseFilters(readFileSync('.github/filters.yml', 'utf8'));
    expect(Object.keys(groups)).toContain('shared');
  });
});
