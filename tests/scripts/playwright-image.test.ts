// The e2e job runs in Playwright's container image, whose browsers are built
// for one Playwright version. When @playwright/test changes, the image tag and
// digest in ci.yml must change with it; this test fails until they do.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: { e2e: { container: { image: string } } };
};
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, { version: string }>;
};

describe('the e2e container image', () => {
  it('matches the locked @playwright/test version and is pinned by digest', () => {
    const version = String(lock.packages['node_modules/@playwright/test']?.version);
    const tag = `mcr.microsoft.com/playwright:v${version}-noble`;
    const [image, digest] = ci.jobs.e2e.container.image.split('@');
    expect(image).toBe(tag);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
