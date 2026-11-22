// The preview-deploy job in ci.yml. `wrangler versions upload` uploads the
// pull request's build as a preview of the Worker and writes what it did to
// WRANGLER_OUTPUT_FILE_PATH, one JSON object per line. The job reads the
// preview's address there and keeps one comment on the pull request with it.
import type { GitHub } from './github.ts';

/** Starts the preview comment, so later runs edit it instead of adding one. */
export const PREVIEW_MARKER = '<!-- preview-deploy -->';

/** The preview's address in wrangler's output: the alias if it has one. */
export function previewUrl(output: string): string {
  for (const line of output.split('\n')) {
    if (line.trim() === '') continue;
    const entry: unknown = JSON.parse(line);
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    if (fields['type'] !== 'version-upload') continue;
    for (const url of [fields['preview_alias_url'], fields['preview_url']]) {
      if (typeof url === 'string' && url.startsWith('https://')) return url;
    }
    throw new Error('wrangler uploaded a version without a preview URL: are preview URLs on?');
  }
  throw new Error('wrangler output has no version upload');
}

/** The comment for the preview of commit `sha`. */
export const previewComment = (url: string, sha: string): string =>
  `${PREVIEW_MARKER}\n**Preview:** ${url}\n\nBuilt from ${sha}. Each push updates this comment.\n`;

/** Edits the earlier preview comment of the bot, or adds one. */
export async function postPreview(client: GitHub, number: number, body: string): Promise<void> {
  const earlier = (await client.comments(number)).find(
    (comment) => comment.isBot && comment.body.startsWith(PREVIEW_MARKER),
  );
  await (earlier === undefined
    ? client.comment(number, body)
    : client.editComment(earlier.id, body));
}
