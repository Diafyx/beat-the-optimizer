import { describe, expect, it } from 'vitest';
import type { IssueSummary, NewIssue } from '../../scripts/lib/github.ts';
import {
  type FailedRun,
  TRACKING_LABELS,
  failedJobs,
  failureComment,
  marker,
  newIssue,
  reportFailure,
} from '../../scripts/lib/tracking-issue.ts';

const run: FailedRun = {
  workflow: 'Nightly',
  url: 'https://github.com/o/r/actions/runs/1',
  sha: 'abc123',
  event: 'schedule',
  failedJobs: ['ci', 'mutation'],
};

describe('failedJobs', () => {
  it('lists the failed and cancelled jobs, sorted', () => {
    const needs = {
      mutation: { result: 'failure', outputs: {} },
      links: { result: 'success', outputs: {} },
      ci: { result: 'cancelled', outputs: {} },
      'forced-failure': { result: 'skipped', outputs: {} },
    };
    expect(failedJobs(JSON.stringify(needs))).toEqual(['ci', 'mutation']);
    expect(failedJobs('{}')).toEqual([]);
  });

  it('rejects a value that is not an object', () => {
    for (const value of ['null', '[]', '"x"']) {
      expect(() => failedJobs(value)).toThrow('NEEDS is not a JSON object');
    }
  });
});

describe('newIssue and failureComment', () => {
  it('opens an issue with the marker, the run and the failed jobs', () => {
    const issue = newIssue(run);
    expect(issue.title).toBe('Nightly workflow failed');
    expect(issue.labels).toEqual(['type/ci', 'area/ci', 'status/triage']);
    expect(issue.body.startsWith(`${marker('Nightly')}\n`)).toBe(true);
    expect(issue.body).toContain('- Run: https://github.com/o/r/actions/runs/1\n');
    expect(issue.body).toContain('- Failed jobs: `ci`, `mutation`\n');
  });

  it('comments with the same details, and says when no job is named', () => {
    expect(failureComment({ ...run, failedJobs: [] })).toBe(
      [
        'Failed again.',
        '',
        '- Run: https://github.com/o/r/actions/runs/1',
        '- Event: `schedule`',
        '- Commit: abc123',
        '- Failed jobs: none reported',
        '',
      ].join('\n'),
    );
  });
});

function fakeClient(open: IssueSummary[]) {
  const created: NewIssue[] = [];
  const comments: [number, string][] = [];
  const client = {
    openIssues: (label: string) => {
      expect(label).toBe(TRACKING_LABELS[0]);
      return Promise.resolve(open);
    },
    createIssue: (issue: NewIssue) => {
      created.push(issue);
      return Promise.resolve({ number: 50, body: issue.body, url: 'https://x/50' });
    },
    comment: (number: number, body: string) => {
      comments.push([number, body]);
      return Promise.resolve();
    },
  };
  return { client, created, comments };
}

describe('reportFailure', () => {
  it("opens an issue when the workflow has no open one, ignoring other workflows' issues", async () => {
    const { client, created, comments } = fakeClient([
      { number: 7, body: `${marker('Canary')}\nother`, url: 'https://x/7' },
      { number: 8, body: 'unrelated', url: 'https://x/8' },
    ]);
    const result = await reportFailure(client, run);
    expect(result).toEqual({
      action: 'opened',
      issue: { number: 50, body: newIssue(run).body, url: 'https://x/50' },
    });
    expect(created).toEqual([newIssue(run)]);
    expect(comments).toEqual([]);
  });

  it('comments on the open tracking issue instead of opening another', async () => {
    const tracking = { number: 9, body: `${marker('Nightly')}\nfirst`, url: 'https://x/9' };
    const { client, created, comments } = fakeClient([tracking]);
    expect(await reportFailure(client, run)).toEqual({ action: 'commented', issue: tracking });
    expect(created).toEqual([]);
    expect(comments).toEqual([[9, failureComment(run)]]);
  });
});
