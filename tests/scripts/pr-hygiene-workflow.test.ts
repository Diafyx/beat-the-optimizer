import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/pr-hygiene.yml', 'utf8')) as {
  concurrency: { group: string; 'cancel-in-progress': unknown };
};

describe('.github/workflows/pr-hygiene.yml', () => {
  it('runs one at a time per pull request and never cancels a run (#120)', () => {
    // Cancelling could cancel every run started by a burst of label and
    // milestone changes, and a cancelled check blocks the pull request.
    expect(workflow.concurrency).toEqual({
      group: 'pr-hygiene-${{ github.event.pull_request.number }}',
      'cancel-in-progress': false,
    });
  });
});
