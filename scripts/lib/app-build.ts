// The Android app's copy of the site: `vite build --mode app` (npm run
// build-app) writes it to dist-app/, and Capacitor packages that folder.
//
// Inside the app the pages are served from https://localhost, and every path
// without a file extension opens index.html. So the share card cannot use the
// page's own address, and links to the other pages need their .html names.
import { siteUrl } from './site-url.ts';

export const APP_MODE = 'app';
export const APP_OUT_DIR = 'dist-app';

/** The pages besides index.html, as the site links to them. */
export const PAGES = ['about', 'privacy'] as const;

const pageLink = new RegExp(`href="/(${PAGES.join('|')})"`, 'g');

/** `html` with each link to a page in PAGES pointing at its .html file. */
export const withAppLinks = (html: string): string => html.replace(pageLink, 'href="/$1.html"');

/**
 * The site's public address for the app's share card, from SITE_URL. The app
 * build refuses to run without it: a share link to the .invalid default would
 * go nowhere.
 */
export function appSiteUrl(value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error('The app build needs SITE_URL, the address the share card links to.');
  }
  return siteUrl(value);
}
