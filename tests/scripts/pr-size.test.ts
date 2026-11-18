import { describe, expect, it } from 'vitest';
import {
  LARGE_HEADING,
  checkSize,
  countLines,
  explainsLargeSize,
  generatedPaths,
  parseNumstat,
  sizeLabel,
  sizeLabelChanges,
} from '../../scripts/lib/pr-size.ts';

describe('parseNumstat', () => {
  it('reads plain, renamed, binary and odd file names from `git diff --numstat -z`', () => {
    const output = [
      '10\t2\tsrc/a.ts',
      '3\t3\t',
      'old/name.ts',
      'new/name.ts',
      '-\t-\tpublic/logo.png',
      '1\t0\tdir/with\ttab and\nnewline.md',
      '',
    ].join('\0');
    expect(parseNumstat(output)).toEqual([
      { path: 'src/a.ts', lines: 12 },
      { path: 'new/name.ts', lines: 6 },
      { path: 'public/logo.png', lines: 0 },
      { path: 'dir/with\ttab and\nnewline.md', lines: 1 },
    ]);
  });

  it('returns nothing for an empty diff, and stops at a truncated rename', () => {
    expect(parseNumstat('')).toEqual([]);
    expect(parseNumstat(['1\t1\ta.ts', '3\t3\t', 'old.ts'].join('\0'))).toEqual([
      { path: 'a.ts', lines: 2 },
    ]);
  });
});

describe('generatedPaths', () => {
  it('keeps paths whose linguist-generated attribute is true or set', () => {
    const output = [
      'package-lock.json',
      'linguist-generated',
      'true',
      'levels/a.json',
      'linguist-generated',
      'set',
      'src/a.ts',
      'linguist-generated',
      'unspecified',
      'b.json',
      'linguist-generated',
      'unset',
      '',
    ].join('\0');
    expect([...generatedPaths(output)]).toEqual(['package-lock.json', 'levels/a.json']);
  });
});

describe('countLines', () => {
  it('sums changed lines without generated files', () => {
    const changes = [
      { path: 'package-lock.json', lines: 900 },
      { path: 'src/a.ts', lines: 40 },
      { path: 'README.md', lines: 2 },
    ];
    expect(countLines(changes, new Set(['package-lock.json']))).toBe(42);
    expect(countLines([], new Set())).toBe(0);
  });
});

describe('sizeLabel', () => {
  it.each([
    [0, 'size/S'],
    [100, 'size/S'],
    [101, 'size/M'],
    [300, 'size/M'],
    [301, 'size/L'],
    [700, 'size/L'],
    [701, 'size/XL'],
    [1500, 'size/XL'],
    [1501, 'size/XXL'],
  ])('labels %i lines %s', (lines, label) => {
    expect(sizeLabel(lines)).toBe(label);
  });
});

describe('sizeLabelChanges', () => {
  it('adds the target and removes every other size label', () => {
    expect(sizeLabelChanges(['type/ci', 'size/S', 'size/XL'], 'size/M')).toEqual({
      add: ['size/M'],
      remove: ['size/S', 'size/XL'],
    });
  });

  it('changes nothing when the label is already right', () => {
    expect(sizeLabelChanges(['size/M', 'area/ci'], 'size/M')).toEqual({ add: [], remove: [] });
  });
});

describe('explainsLargeSize and checkSize', () => {
  const withAnswer = (answer: string): string =>
    `${LARGE_HEADING}\n\n${answer}\n\n### Checklist\n\n- [ ] x`;

  it('accepts a real answer', () => {
    expect(explainsLargeSize(withAnswer('The generated schema cannot be split.'))).toBe(true);
    expect(explainsLargeSize(`${LARGE_HEADING}\nIt is the last section.`)).toBe(true);
  });

  it('rejects N/A, No, an empty section, a comment only and a missing section', () => {
    for (const answer of ['N/A', 'n/a.', 'NA', 'No', 'none', '', '<!-- why? -->']) {
      expect(explainsLargeSize(withAnswer(answer))).toBe(false);
    }
    expect(explainsLargeSize('### Checklist')).toBe(false);
  });

  it('fails only an unexplained size/XXL', () => {
    expect(checkSize('size/XL', '')).toEqual([]);
    expect(checkSize('size/XXL', withAnswer('One generated file.'))).toEqual([]);
    expect(checkSize('size/XXL', withAnswer('N/A'))).toEqual([
      'This pull request is size/XXL (more than 1500 changed lines). Split it, or explain under "### Why is this PR large?" why it cannot be split.',
    ]);
  });
});
