// Validates level files against schema/level.schema.json and the rules in
// docs/level-format.md. With no arguments, checks every .json file directly in
// levels/; otherwise the files given.
import { readdirSync, readFileSync } from 'node:fs';
import { levelChecker } from './lib/levels.ts';

const check = levelChecker(readFileSync('schema/level.schema.json', 'utf8'));
const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : readdirSync('levels')
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => `levels/${name}`);

let invalid = 0;
for (const file of files) {
  const problems = check(readFileSync(file, 'utf8'));
  if (problems.length > 0) {
    invalid += 1;
    console.error(`${file}:`);
    for (const problem of problems) console.error(`  ${problem}`);
  }
}

if (invalid > 0) {
  console.error(`${String(invalid)} of ${String(files.length)} level files are invalid.`);
  process.exitCode = 1;
} else {
  console.log(`levels: ${String(files.length)} level files, all valid.`);
}
