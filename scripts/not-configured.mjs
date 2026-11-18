// Stand-in for an npm script whose CI job arrives in a later issue.
// Usage: node scripts/not-configured.mjs <script> <issue-number>
// Exits 0 so that `npm run check` stays usable until the real script lands.
const [script = 'this script', issue] = process.argv.slice(2);
const where = issue ? ` It arrives with issue #${issue}.` : '';
console.log(`npm run ${script}: not configured yet.${where}`);
