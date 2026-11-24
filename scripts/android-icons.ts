// Renders the Android app's launcher icons from public/icons/ into
// android/app/src/main/res/mipmap-*/, at each screen density:
//
// - ic_launcher.png: icon.svg, the square icon for Android 7 (API 24, 25).
// - ic_launcher_round.png: maskable.svg in a circle, for their round icons.
// - ic_launcher_foreground.png: maskable.svg in the middle 72 of 108 dp, the
//   part an adaptive icon always shows (Android 8 and later). The rest is the
//   icon's background colour, in res/values/ic_launcher_background.xml.
//
// Usage: node scripts/android-icons.ts. Run it again when an SVG changes.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

const svg = (name: string): string =>
  `data:image/svg+xml;base64,${readFileSync(`public/icons/${name}`).toString('base64')}`;

/** A page of `size` CSS pixels, with `img` styled by `style` on a transparent background. */
const page = (size: number, image: string, style: string): string =>
  `<html><body style="margin:0;width:${String(size)}px;height:${String(size)}px">` +
  `<img src="${image}" style="display:block;${style}"></body></html>`;

const icons = [
  { file: 'ic_launcher.png', dp: 48, html: page(48, svg('icon.svg'), 'width:48px;height:48px') },
  {
    file: 'ic_launcher_round.png',
    dp: 48,
    html: page(48, svg('maskable.svg'), 'width:48px;height:48px;border-radius:50%'),
  },
  {
    file: 'ic_launcher_foreground.png',
    dp: 108,
    html: page(108, svg('maskable.svg'), 'width:72px;height:72px;margin:18px'),
  },
];

const browser = await chromium.launch();
for (const [density, scale] of Object.entries(DENSITIES)) {
  for (const { file, dp, html } of icons) {
    const tab = await browser.newPage({
      viewport: { width: dp, height: dp },
      deviceScaleFactor: scale,
    });
    await tab.setContent(html);
    await tab.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await tab.screenshot({ path: `${RES}/mipmap-${density}/${file}`, omitBackground: true });
    await tab.close();
  }
}
await browser.close();
