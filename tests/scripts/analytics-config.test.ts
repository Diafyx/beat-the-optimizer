import { describe, expect, it } from 'vitest';
import {
  analyticsConfig,
  contentSecurityPolicy,
  headersFile,
} from '../../scripts/lib/analytics-config.ts';

const token = '0123456789abcdef0123456789abcdef';

describe('analyticsConfig', () => {
  it('is off unless set', () => {
    expect(analyticsConfig({})).toEqual({ goatcounter: '', cloudflare: '' });
  });

  it('takes a GoatCounter code and a Cloudflare token', () => {
    expect(
      analyticsConfig({ GOATCOUNTER_CODE: 'beat-the-optimizer', CF_BEACON_TOKEN: token }),
    ).toEqual({
      goatcounter: 'beat-the-optimizer',
      cloudflare: token,
    });
  });

  it('refuses anything else', () => {
    for (const code of ['Demo', 'demo.example', '-demo', 'a/b']) {
      expect(() => analyticsConfig({ GOATCOUNTER_CODE: code })).toThrow('GOATCOUNTER_CODE');
    }
    expect(() => analyticsConfig({ CF_BEACON_TOKEN: 'secret' })).toThrow('CF_BEACON_TOKEN');
  });
});

describe('contentSecurityPolicy', () => {
  it('allows only the site itself without analytics', () => {
    expect(contentSecurityPolicy({ goatcounter: '', cloudflare: '' })).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('adds exactly the analytics hosts in use', () => {
    const policy = contentSecurityPolicy({ goatcounter: 'demo', cloudflare: token });
    expect(policy).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    expect(policy).toContain(
      "connect-src 'self' https://demo.goatcounter.com https://cloudflareinsights.com;",
    );
  });

  it('goes in a _headers file for every path, with the other security headers', () => {
    expect(headersFile({ goatcounter: '', cloudflare: '' }).split('\n')).toEqual([
      '/*',
      expect.stringMatching(/^ {2}Content-Security-Policy: default-src 'none'; .+$/),
      '  Strict-Transport-Security: max-age=31536000',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Cross-Origin-Opener-Policy: same-origin',
      '  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      '',
    ]);
  });
});
