import { describe, expect, it, vi } from 'vitest';
import type { Comment, GitHub } from '../../scripts/lib/github.ts';
import {
  PREVIEW_MARKER,
  postPreview,
  previewComment,
  previewUrl,
} from '../../scripts/lib/preview.ts';

const upload = (fields: Record<string, unknown>): string =>
  JSON.stringify({ type: 'version-upload', version: 1, ...fields });

describe('previewUrl', () => {
  const alias = 'https://pr-7-beat-the-optimizer.demo.workers.dev';
  const version = 'https://0123abcd-beat-the-optimizer.demo.workers.dev';

  it('is the alias of the uploaded version, or its own address', () => {
    const start = JSON.stringify({ type: 'wrangler-session', version: 1 });
    expect(
      previewUrl(`${start}\n${upload({ preview_alias_url: alias, preview_url: version })}\n`),
    ).toBe(alias);
    expect(previewUrl(`null\n1\n\n${upload({ preview_url: version })}`)).toBe(version);
  });

  it('fails without a preview address or an upload', () => {
    expect(() => previewUrl(upload({ preview_url: 'http://plain.example' }))).toThrow(
      'without a preview URL',
    );
    expect(() => previewUrl(JSON.stringify({ type: 'deploy' }))).toThrow('no version upload');
    expect(() => previewUrl('')).toThrow('no version upload');
  });
});

describe('postPreview', () => {
  const client = (comments: Comment[]) => {
    const fake = {
      comments: vi.fn(() => Promise.resolve(comments)),
      comment: vi.fn(() => Promise.resolve()),
      editComment: vi.fn(() => Promise.resolve()),
    };
    return { fake, github: fake as unknown as GitHub };
  };
  const body = previewComment('https://pr-7.example', 'abc123');

  it('starts the comment with the marker and the address', () => {
    expect(body.split('\n').slice(0, 2)).toEqual([
      PREVIEW_MARKER,
      '**Preview:** https://pr-7.example',
    ]);
    expect(body).toContain('abc123');
  });

  it('edits the earlier preview comment of the bot', async () => {
    const { fake, github } = client([
      { id: 1, body: `${PREVIEW_MARKER} copied by a person`, isBot: false },
      { id: 2, body: 'another bot comment', isBot: true },
      { id: 3, body: previewComment('https://old.example', 'old'), isBot: true },
    ]);
    await postPreview(github, 7, body);
    expect(fake.comments).toHaveBeenCalledWith(7);
    expect(fake.editComment).toHaveBeenCalledWith(3, body);
    expect(fake.comment).not.toHaveBeenCalled();
  });

  it('adds a comment the first time', async () => {
    const { fake, github } = client([]);
    await postPreview(github, 7, body);
    expect(fake.comment).toHaveBeenCalledWith(7, body);
    expect(fake.editComment).not.toHaveBeenCalled();
  });
});
