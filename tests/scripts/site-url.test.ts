import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, siteUrl, withSiteUrl } from '../../scripts/lib/site-url.ts';

describe('siteUrl', () => {
  it('defaults to an address that can never resolve', () => {
    expect(siteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(siteUrl('')).toBe(DEFAULT_SITE_URL);
  });

  it('takes an https address, without the trailing slash', () => {
    expect(siteUrl('https://example.org/')).toBe('https://example.org');
    expect(siteUrl('https://example.org/game/')).toBe('https://example.org/game');
  });

  it('refuses anything else', () => {
    for (const value of ['http://example.org', 'https://example.org/?a=1', 'https://x.org/#top']) {
      expect(() => siteUrl(value)).toThrow('SITE_URL must be an https address');
    }
    expect(() => siteUrl('example.org')).toThrow();
  });
});

describe('index.html', () => {
  const html = readFileSync('index.html', 'utf8');

  it('has absolute link preview tags once the site URL is in', () => {
    const built = withSiteUrl(html, 'https://example.org');
    expect(built).not.toContain('%SITE_URL%');
    for (const tag of [
      '<link rel="canonical" href="https://example.org/" />',
      '<meta property="og:url" content="https://example.org/" />',
      '<meta property="og:image" content="https://example.org/og-image.png" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    ]) {
      expect(built).toContain(tag);
    }
  });

  it('points at a 1200 × 630 PNG preview image', () => {
    const png = readFileSync('public/og-image.png');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
  });
});
