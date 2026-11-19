// Failure reports for the scheduled workflows (nightly.yml and canary.yml).
// Each workflow has at most one open tracking issue, found by a hidden marker
// in its body: the first failure opens it, and later failures comment on it.
// Closing the issue starts a new one on the next failure.
import type { GitHub, IssueSummary, NewIssue } from './github.ts';

/** The tracking issue's labels; the first one is also the search filter. */
export const TRACKING_LABELS = ['type/ci', 'area/ci', 'status/triage'] as const;

export interface FailedRun {
  /** The workflow name, such as "Nightly". */
  workflow: string;
  url: string;
  sha: string;
  event: string;
  failedJobs: readonly string[];
}

export const marker = (workflow: string): string => `<!-- tracking-issue: ${workflow} -->`;

/** The jobs in a `toJSON(needs)` value that failed or were cancelled, sorted. */
export function failedJobs(needsJson: string): string[] {
  const needs: unknown = JSON.parse(needsJson);
  if (needs === null || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('NEEDS is not a JSON object');
  }
  return Object.entries(needs as Record<string, { result?: unknown }>)
    .filter(([, job]) => job.result === 'failure' || job.result === 'cancelled')
    .map(([name]) => name)
    .sort();
}

const details = (run: FailedRun): string =>
  [
    `- Run: ${run.url}`,
    `- Event: \`${run.event}\``,
    `- Commit: ${run.sha}`,
    `- Failed jobs: ${run.failedJobs.length === 0 ? 'none reported' : run.failedJobs.map((job) => `\`${job}\``).join(', ')}`,
  ].join('\n');

export function newIssue(run: FailedRun): NewIssue {
  return {
    title: `${run.workflow} workflow failed`,
    body: [
      marker(run.workflow),
      '',
      `The **${run.workflow}** workflow failed. This issue tracks it: later failures add a comment here instead of opening another issue. Close it when the workflow passes again.`,
      '',
      details(run),
      '',
    ].join('\n'),
    labels: TRACKING_LABELS,
  };
}

export const failureComment = (run: FailedRun): string => `Failed again.\n\n${details(run)}\n`;

export async function reportFailure(
  client: Pick<GitHub, 'openIssues' | 'createIssue' | 'comment'>,
  run: FailedRun,
): Promise<{ action: 'opened' | 'commented'; issue: IssueSummary }> {
  const open = await client.openIssues(TRACKING_LABELS[0]);
  const existing = open.find((issue) => issue.body.includes(marker(run.workflow)));
  if (existing) {
    await client.comment(existing.number, failureComment(run));
    return { action: 'commented', issue: existing };
  }
  return { action: 'opened', issue: await client.createIssue(newIssue(run)) };
}
