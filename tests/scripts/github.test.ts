import { describe, expect, it } from 'vitest';
import { env } from '../../scripts/lib/env.ts';
import {
  type FetchLike,
  annotation,
  gitHub,
  toIssue,
  toPullRequest,
} from '../../scripts/lib/github.ts';

const pullJson = {
  title: 'ci(ci): add pr-hygiene',
  body: 'Closes #5',
  head: { ref: 'ci/5-pr-hygiene', repo: { full_name: 'o/r' } },
  labels: [{ name: 'type/ci' }, { name: 'area/ci' }],
  milestone: { title: 'bootstrap' },
  user: { login: 'someone', type: 'User' },
};

describe('toPullRequest', () => {
  it('reads the fields the rules need', () => {
    expect(toPullRequest(pullJson)).toEqual({
      title: 'ci(ci): add pr-hygiene',
      body: 'Closes #5',
      branch: 'ci/5-pr-hygiene',
      labels: ['type/ci', 'area/ci'],
      milestone: 'bootstrap',
      isBot: false,
      headRepository: 'o/r',
    });
  });

  it('handles an empty body, no milestone, a bot author and a deleted fork', () => {
    expect(
      toPullRequest({
        ...pullJson,
        body: null,
        milestone: null,
        user: { login: 'dependabot[bot]', type: 'Bot' },
        head: { ref: 'x', repo: null },
      }),
    ).toMatchObject({ body: '', milestone: null, isBot: true, headRepository: null });
  });

  it('rejects responses of the wrong shape', () => {
    expect(() => toPullRequest(null)).toThrow('pull request is not an object');
    expect(() => toPullRequest([])).toThrow('pull request is not an object');
    expect(() => toPullRequest({ ...pullJson, labels: {} })).toThrow('labels is not a list');
    expect(() => toPullRequest({ ...pullJson, title: 1 })).toThrow('title is not a string');
  });
});

describe('toIssue', () => {
  it('reads state, milestone and whether it is a pull request', () => {
    expect(toIssue({ state: 'open', milestone: { title: 'v0.1.0' } })).toEqual({
      open: true,
      isPullRequest: false,
      milestone: 'v0.1.0',
    });
    expect(toIssue({ state: 'closed', milestone: null, pull_request: {} })).toEqual({
      open: false,
      isPullRequest: true,
      milestone: null,
    });
  });
});

interface Call {
  url: string;
  method: string | undefined;
  body: unknown;
  auth: string | null;
}

function fakeFetch(...responses: Response[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({
      url,
      method: init.method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init.headers).get('authorization'),
    });
    const response = responses.shift();
    if (!response) throw new Error('unexpected request');
    return Promise.resolve(response);
  };
  return { fetch, calls };
}

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status });

describe('gitHub', () => {
  it('reads a pull request with the token', async () => {
    const { fetch, calls } = fakeFetch(json(pullJson));
    const pr = await gitHub('o/r', 'tok', fetch).pull(7);
    expect(pr.branch).toBe('ci/5-pr-hygiene');
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/repos/o/r/pulls/7',
        method: 'GET',
        body: undefined,
        auth: 'Bearer tok',
      },
    ]);
  });

  it('reads an issue, and returns null for a missing or deleted one', async () => {
    const { fetch } = fakeFetch(
      json({ state: 'open', milestone: null }),
      json({}, 404),
      json({}, 410),
    );
    const client = gitHub('o/r', 'tok', fetch);
    expect(await client.issue(1)).toEqual({ open: true, isPullRequest: false, milestone: null });
    expect(await client.issue(2)).toBeNull();
    expect(await client.issue(3)).toBeNull();
  });

  it('adds labels and removes one, ignoring a label that is already gone', async () => {
    const { fetch, calls } = fakeFetch(
      json([]),
      new Response(null, { status: 204 }),
      json({}, 404),
    );
    const client = gitHub('o/r', 'tok', fetch);
    await client.addLabels(7, ['size/M']);
    await client.removeLabel(7, 'size/S');
    await client.removeLabel(7, 'size/L');
    expect(calls.map(({ url, method, body }) => [method, url, body])).toEqual([
      ['POST', 'https://api.github.com/repos/o/r/issues/7/labels', { labels: ['size/M'] }],
      ['DELETE', 'https://api.github.com/repos/o/r/issues/7/labels/size%2FS', undefined],
      ['DELETE', 'https://api.github.com/repos/o/r/issues/7/labels/size%2FL', undefined],
    ]);
  });

  it('fails with the status and message of an error response', async () => {
    const error = (): Response => new Response('Bad credentials', { status: 401 });
    const { fetch } = fakeFetch(error(), error(), error(), error());
    const client = gitHub('o/r', 'tok', fetch);
    await expect(client.pull(7)).rejects.toThrow(
      'reading pull request #7 failed: 401 Bad credentials',
    );
    await expect(client.issue(1)).rejects.toThrow('reading issue #1 failed: 401');
    await expect(client.addLabels(7, ['size/M'])).rejects.toThrow('adding labels to #7 failed');
    await expect(client.removeLabel(7, 'size/S')).rejects.toThrow('removing size/S from #7 failed');
  });
});

describe('env', () => {
  it('returns a set variable and rejects a missing or empty one', () => {
    expect(env('A', { A: 'x' })).toBe('x');
    expect(() => env('A', {})).toThrow('A is not set');
    expect(() => env('A', { A: '' })).toThrow('A is not set');
  });
});

describe('annotation', () => {
  it('escapes the title and the message for GitHub Actions', () => {
    expect(annotation('pr-hygiene: issue link', '100% done\r\nnext, then: more')).toBe(
      '::error title=pr-hygiene%3A issue link::100%25 done%0D%0Anext, then: more',
    );
  });
});
