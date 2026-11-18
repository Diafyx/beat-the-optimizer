// Fails if package-lock.json downloads any package from somewhere other than
// the public npm registry, for example a mirror set in a user-level .npmrc.
import { readFileSync } from 'node:fs';
import { REGISTRY, foreignResolved } from './lib/lockfile.ts';

const foreign = foreignResolved(readFileSync('package-lock.json', 'utf8'));

if (foreign.length > 0) {
  console.error(`These package-lock.json entries are not resolved from ${REGISTRY}:`);
  for (const entry of foreign) console.error(`  ${entry}`);
  console.error(
    'Reinstall with the project .npmrc in effect (npm install from the repository root).',
  );
  process.exitCode = 1;
} else {
  console.log(`check-lockfile: every package resolves from ${REGISTRY}`);
}
