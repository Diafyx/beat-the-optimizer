// The site's public address, for the absolute URLs that link previews need
// (Open Graph and Twitter tags in index.html). The build reads SITE_URL; the
// deploy sets it to the real address.
//
// The default is under .invalid, a top-level domain that never resolves, so a
// build without SITE_URL never points link previews or the canonical URL at a
// site someone else could own.
export const DEFAULT_SITE_URL = 'https://beat-the-optimizer.invalid';

/** `value` (SITE_URL) as an https URL without a trailing slash, or the default. */
export function siteUrl(value: string | undefined): string {
  const url = new URL(value === undefined || value === '' ? DEFAULT_SITE_URL : value);
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
    throw new Error(
      `SITE_URL must be an https address without a query or fragment: ${String(value)}`,
    );
  }
  return url.href.replace(/\/+$/, '');
}

/** `html` with every `%SITE_URL%` replaced by `url`. */
export const withSiteUrl = (html: string, url: string): string =>
  html.replaceAll('%SITE_URL%', url);
