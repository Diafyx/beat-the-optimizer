// Fails if any file in the repository matches no group in .github/filters.yml,
// so a new folder cannot slip past CI's path filters.
// Checks tracked files plus untracked files that are not ignored.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseFilters, unmatchedFiles } from './lib/filters.ts';

const output = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
);
const files = [...new Set(output.split('\0').filter(Boolean))];
const groups = parseFilters(readFileSync('.github/filters.yml', 'utf8'));
const missing = unmatchedFiles(files, groups);

if (missing.length > 0) {
  console.error('These files match no group in .github/filters.yml:');
  for (const file of missing) console.error(`  ${file}`);
  console.error('Add them to a filter group so CI knows which jobs they affect.');
  process.exitCode = 1;
} else {
  console.log(`check-filters: all ${String(files.length)} files match a filter group.`);
}
