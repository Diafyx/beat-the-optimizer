import { describe, expect, it } from 'vitest';
import { headings, markdownFiles, section, stripComments } from '../../scripts/lib/markdown.ts';

describe('markdownFiles', () => {
  it('keeps Markdown files only, trimmed, deduplicated and sorted', () => {
    expect(
      markdownFiles([
        'README.md',
        '',
        'src/main.ts',
        ' docs/adr/0001.md ',
        'NOTES.MD',
        'README.md',
      ]),
    ).toEqual(['NOTES.MD', 'README.md', 'docs/adr/0001.md']);
  });

  it('returns an empty list when nothing is Markdown', () => {
    expect(markdownFiles(['package.json'])).toEqual([]);
  });
});

describe('stripComments', () => {
  it('removes closed comments and an unclosed one to the end', () => {
    expect(stripComments('a<!-- x -->b<!--\ny\n-->c')).toBe('abc');
    expect(stripComments('a <!-- open')).toBe('a ');
  });
});

describe('headings', () => {
  it('lists ATX headings, trimmed, skipping those inside comments', () => {
    expect(headings('# A\ntext\n  ### B  \n<!--\n## C\n-->\n#D\n####### E')).toEqual([
      '# A',
      '### B',
    ]);
  });
});

describe('section', () => {
  const body = '### A\n\nfirst <!-- hint -->\n\n### B\nlast';

  it('returns the text up to the next heading, or to the end', () => {
    expect(section(body, '### A')).toBe('first');
    expect(section(body, '### B')).toBe('last');
  });

  it('returns null for a missing heading', () => {
    expect(section(body, '### C')).toBeNull();
  });
});
