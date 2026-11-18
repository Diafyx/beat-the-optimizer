// Checks the links in Markdown files changed since the merge base with
// BASE_REF (default origin/main), including uncommitted and untracked files.
// The nightly workflow checks every file.
import { execFileSync, spawnSync } from 'node:child_process';
import { markdownFiles } from './lib/markdown.ts';

const base = process.env['BASE_REF'] ?? 'origin/main';
const git = (...args: string[]): string[] =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n');

const changed = markdownFiles([
  ...git('diff', '--name-only', '--diff-filter=d', '--merge-base', base),
  ...git('ls-files', '--others', '--exclude-standard'),
]);

if (changed.length === 0) {
  console.log(`check-links: no Markdown files changed since ${base}.`);
} else {
  console.log(`check-links: checking ${changed.join(', ')}`);
  const result = spawnSync(
    'npx',
    ['linkinator', ...changed, '--markdown', '--retry', '--verbosity', 'error'],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
