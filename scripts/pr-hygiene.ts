// The pr-hygiene job: checks the pull request rules in CONTRIBUTING.md (title,
// branch, issue link, labels, milestone, template headings and the result of
// the pr-size job). CI only: it reads the pull request through the GitHub API.
import { appendFileSync, readFileSync } from 'node:fs';
import { env } from './lib/env.ts';
import { type Issue, annotation, gitHub } from './lib/github.ts';
import { evaluate, linkedIssues, summary } from './lib/pr-rules.ts';

const client = gitHub(env('GITHUB_REPOSITORY'), env('GITHUB_TOKEN'));
const pr = await client.pull(Number(env('PR_NUMBER')));

const issues = new Map<number, Issue | null>();
if (!pr.isBot) {
  for (const number of linkedIssues(pr.body)) issues.set(number, await client.issue(number));
}

const template = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
const checks = evaluate(pr, issues, template, env('PR_SIZE_RESULT'));

let failed = false;
for (const { rule, problems } of checks) {
  console.log(
    `${rule}: ${problems === null ? 'skipped (bot)' : problems.length === 0 ? 'pass' : 'fail'}`,
  );
  for (const problem of problems ?? []) {
    console.log(annotation(`pr-hygiene: ${rule}`, problem));
    failed = true;
  }
}
const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
if (summaryFile) appendFileSync(summaryFile, summary(checks));
if (failed) process.exitCode = 1;
