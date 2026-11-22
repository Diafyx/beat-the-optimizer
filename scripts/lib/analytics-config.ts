// Analytics settings for the build (docs/adr/0004-measure-return-with-goatcounter.md).
// GOATCOUNTER_CODE is the GoatCounter site code, so events go to
// https://<code>.goatcounter.com; CF_BEACON_TOKEN is the Cloudflare Web
// Analytics token. Either can be left out, which turns that service off. The
// same settings decide the Content-Security-Policy in the generated _headers
// file, so the page can reach only the services it uses.

import type { AnalyticsConfig } from '../../src/analytics.ts';

/** The settings in `env`, checked. */
export function analyticsConfig(
  env: Readonly<Record<string, string | undefined>>,
): AnalyticsConfig {
  const goatcounter = env['GOATCOUNTER_CODE'] ?? '';
  const cloudflare = env['CF_BEACON_TOKEN'] ?? '';
  if (!/^([a-z0-9][a-z0-9-]{0,62})?$/.test(goatcounter)) {
    throw new Error(`GOATCOUNTER_CODE must be a GoatCounter site code: ${goatcounter}`);
  }
  if (!/^([0-9a-f]{32})?$/.test(cloudflare)) {
    throw new Error('CF_BEACON_TOKEN must be 32 hexadecimal characters');
  }
  return { goatcounter, cloudflare };
}

export const goatCounterOrigin = (code: string): string => `https://${code}.goatcounter.com`;

/** The Cloudflare Web Analytics beacon script, and where it reports to. */
export const CLOUDFLARE_BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
const CLOUDFLARE_REPORTS = 'https://cloudflareinsights.com';

/** The Content-Security-Policy: the site itself, and only the analytics hosts in use. */
export function contentSecurityPolicy({ goatcounter, cloudflare }: AnalyticsConfig): string {
  const scripts = ["'self'", ...(cloudflare === '' ? [] : [new URL(CLOUDFLARE_BEACON).origin])];
  const connect = [
    "'self'",
    ...(goatcounter === '' ? [] : [goatCounterOrigin(goatcounter)]),
    ...(cloudflare === '' ? [] : [CLOUDFLARE_REPORTS]),
  ];
  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self'",
    "img-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** The _headers file for Cloudflare's static assets. */
export const headersFile = (config: AnalyticsConfig): string =>
  `/*\n  Content-Security-Policy: ${contentSecurityPolicy(config)}\n`;
