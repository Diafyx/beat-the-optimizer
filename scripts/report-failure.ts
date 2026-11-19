// The report job of nightly.yml and canary.yml: opens the workflow's tracking
// issue, or comments on the open one. CI only. NEEDS is `toJSON(needs)`.
import { appendFileSync } from 'node:fs';
import { env } from './lib/env.ts';
import { gitHub } from './lib/github.ts';
import { failedJobs, reportFailure } from './lib/tracking-issue.ts';

const repository = env('GITHUB_REPOSITORY');
const run = {
  workflow: env('GITHUB_WORKFLOW'),
  url: `${env('GITHUB_SERVER_URL')}/${repository}/actions/runs/${env('GITHUB_RUN_ID')}`,
  sha: env('GITHUB_SHA'),
  event: env('GITHUB_EVENT_NAME'),
  failedJobs: failedJobs(env('NEEDS')),
};

const { action, issue } = await reportFailure(gitHub(repository, env('GITHUB_TOKEN')), run);
const message = `${action === 'opened' ? 'Opened' : 'Commented on'} tracking issue #${String(issue.number)}: ${issue.url}`;
console.log(message);
const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
if (summaryFile) appendFileSync(summaryFile, `### Failure report\n\n${message}\n`);
