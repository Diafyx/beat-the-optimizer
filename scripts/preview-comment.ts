// The preview-deploy job (ci.yml), after `wrangler versions upload`: comments
// the preview's address on the pull request and gives it to the job as the
// `url` output. CI only. Logic in scripts/lib/preview.ts.
import { appendFileSync, readFileSync } from 'node:fs';
import { env } from './lib/env.ts';
import { gitHub } from './lib/github.ts';
import { postPreview, previewComment, previewUrl } from './lib/preview.ts';

const url = previewUrl(readFileSync(env('WRANGLER_OUTPUT_FILE_PATH'), 'utf8'));
const client = gitHub(env('GITHUB_REPOSITORY'), env('GITHUB_TOKEN'));
await postPreview(client, Number(env('PR_NUMBER')), previewComment(url, env('HEAD_SHA')));
appendFileSync(env('GITHUB_OUTPUT'), `url=${url}\n`);
console.log(`preview-comment: ${url}`);
