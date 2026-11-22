// The web app manifest (public/manifest.webmanifest) and its icons: what
// Chrome needs to offer to install the site, and what a Trusted Web Activity
// is built from (#96).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
};

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(path: string): string {
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  return `${String(png.readUInt32BE(16))}x${String(png.readUInt32BE(20))}`;
}

const asphalt = /--asphalt: (#[0-9a-f]{6});/.exec(readFileSync('src/style.css', 'utf8'))?.[1];

describe('the web app manifest', () => {
  it('opens the game full screen from its start page', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Beat the Optimizer',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    // Android shows at most 12 characters under the icon.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('uses the Race Night background for the splash screen and the status bar', () => {
    expect(asphalt).toBe('#0e1012');
    expect(manifest.background_color).toBe(asphalt);
    expect(manifest.theme_color).toBe(asphalt);
  });

  it('has 192 and 512 px icons for any use and as maskable icons, at their sizes', () => {
    expect(manifest.icons.map(({ sizes, purpose }) => `${purpose} ${sizes}`).sort()).toEqual([
      'any 192x192',
      'any 512x512',
      'maskable 192x192',
      'maskable 512x512',
    ]);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(pngSize(`public${icon.src}`)).toBe(icon.sizes);
    }
  });

  it('is linked from every page, with the icons and the theme colour', () => {
    expect(pngSize('public/icons/apple-touch-icon.png')).toBe('180x180');
    for (const page of ['index.html', 'about.html', 'privacy.html']) {
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
      expect(html).toContain('<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />');
      expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
      expect(html).toContain(`<meta name="theme-color" content="${String(asphalt)}" />`);
    }
  });
});
