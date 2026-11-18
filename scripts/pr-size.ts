// The pr-size job: counts the lines this pull request changes (without
// linguist-generated files), sets the matching size/* label and fails a
// size/XXL pull request that does not say why it is large. CI only: it reads
// the pull request through the GitHub API.
//
// It diffs the merge commit that actions/checkout creates against its first
// parent (the base branch), so it needs a checkout with fetch-depth: 2.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { annotation, gitHub } from './lib/github.ts';
import {
  checkSize,
  countLines,
  generatedPaths,
  parseNumstat,
  sizeLabel,
  sizeLabelChanges,
} from './lib/pr-size.ts';
import { env } from './lib/env.ts';

const repository = env('GITHUB_REPOSITORY');
const number = Number(env('PR_NUMBER'));
const client = gitHub(repository, env('GITHUB_TOKEN'));

const git = (args: string[], input?: string): string =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, input });

const changes = parseNumstat(git(['diff', '--numstat', '-z', '-M', 'HEAD^1', 'HEAD']));
const generated =
  changes.length === 0
    ? new Set<string>()
    : generatedPaths(
        git(
          ['check-attr', '-z', '--stdin', 'linguist-generated'],
          changes.map((change) => `${change.path}\0`).join(''),
        ),
      );
const lines = countLines(changes, generated);
const label = sizeLabel(lines);
console.log(
  `pr-size: ${String(lines)} changed lines (${String(generated.size)} generated files not counted): ${label}`,
);

const pr = await client.pull(number);

// A fork's token is read-only, so its size is checked but not labelled.
if (pr.headRepository === repository) {
  const { add, remove } = sizeLabelChanges(pr.labels, label);
  for (const old of remove) await client.removeLabel(number, old);
  if (add.length > 0) await client.addLabels(number, add);
} else {
  console.log('pr-size: pull request from a fork, so the label is not set.');
}

const problems = checkSize(label, pr.body);
for (const problem of problems) console.log(annotation('pr-size', problem));
const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
if (summaryFile) {
  appendFileSync(
    summaryFile,
    `### PR size\n\n${String(lines)} changed lines, not counting ${String(generated.size)} generated files: **${label}**\n\n${problems.join('\n\n')}\n`,
  );
}
if (problems.length > 0) process.exitCode = 1;
