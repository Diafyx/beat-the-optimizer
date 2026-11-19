// Checks the links in Markdown files changed since the merge base with
// BASE_REF (default origin/main), including uncommitted and untracked files.
// With --all (the nightly workflow) it checks every tracked Markdown file.
import { execFileSync, spawnSync } from 'node:child_process';
import { markdownFiles } from './lib/markdown.ts';

const all = process.argv.includes('--all');
const base = process.env['BASE_REF'] ?? 'origin/main';
const git = (...args: string[]): string[] =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n');

const files = markdownFiles(
  all
    ? git('ls-files')
    : [
        ...git('diff', '--name-only', '--diff-filter=d', '--merge-base', base),
        ...git('ls-files', '--others', '--exclude-standard'),
      ],
);

if (files.length === 0) {
  console.log(`check-links: no Markdown files${all ? '' : ` changed since ${base}`}.`);
} else {
  console.log(`check-links: checking ${files.join(', ')}`);
  const result = spawnSync(
    'npx',
    ['linkinator', ...files, '--markdown', '--retry', '--verbosity', 'error'],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
