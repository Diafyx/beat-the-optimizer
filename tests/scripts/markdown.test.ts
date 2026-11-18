import { describe, expect, it } from 'vitest';
import { markdownFiles } from '../../scripts/lib/markdown.ts';

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
