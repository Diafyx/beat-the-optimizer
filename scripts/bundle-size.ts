// Fails if the production build's JavaScript, gzipped, is over budget.
// Run after `vite build` (`npm run bundle-size` builds first).
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { bundleReport } from './lib/bundle-size.ts';

const files = readdirSync('dist', { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('.js'),
);
const assets = files.map((file) => ({
  file,
  gzipBytes: gzipSync(readFileSync(join('dist', file)), { level: 9 }).length,
}));
const report = bundleReport(assets);

console.log(report.markdown);
for (const problem of report.problems) console.log(`::error title=bundle-size::${problem}`);
const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
if (summaryFile) appendFileSync(summaryFile, report.markdown);
if (report.problems.length > 0) process.exitCode = 1;
