// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics, globalPrivacyControl, returnEvent } from './analytics.ts';

describe('returnEvent', () => {
  it('is return_d1 the next day and return_d2_7 later in the first week', () => {
    const days = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-08', '2026-12-09'];
    expect(days.map((today) => returnEvent('2026-12-01', [], today))).toEqual([
      null,
      'return_d1',
      'return_d2_7',
      'return_d2_7',
      null,
    ]);
  });

  it('is each event once, and nothing before a first finish', () => {
    expect(returnEvent('2026-12-01', ['return_d1'], '2026-12-02')).toBeNull();
    expect(returnEvent('2026-12-01', ['return_d2_7'], '2026-12-05')).toBeNull();
    expect(returnEvent(null, [], '2026-12-02')).toBeNull();
  });

  it('counts calendar days across a month and a year', () => {
    expect(returnEvent('2026-12-31', [], '2027-01-01')).toBe('return_d1');
  });
});

describe('globalPrivacyControl', () => {
  it('is on only when the browser says so', () => {
    expect(globalPrivacyControl({ globalPrivacyControl: true })).toBe(true);
    expect(globalPrivacyControl({ globalPrivacyControl: false })).toBe(false);
    expect(globalPrivacyControl({})).toBe(false);
  });
});

describe('createAnalytics', () => {
  const config = { goatcounter: 'demo', cloudflare: '0123456789abcdef0123456789abcdef' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A page at `href`, opened from `referrer`. Its head is not in a document, so scripts do not load. */
  const page = (href = 'https://game.example/', referrer = ''): Document =>
    ({
      location: new URL(href),
      referrer,
      createElement: (tag: string) => document.createElement(tag),
      head: document.createElement('head'),
    }) as unknown as Document;

  it('counts a visit by its path and the site that linked to it', () => {
    const send = vi.fn<(url: string) => void>();
    const analytics = createAnalytics({
      config,
      navigator: {},
      document: page('https://game.example/?level=needle', 'https://news.example/item?id=1'),
      send,
    });
    expect(analytics.enabled).toBe(true);
    analytics.visit();
    expect(send.mock.calls).toEqual([
      ['https://demo.goatcounter.com/count?p=%2F&r=https%3A%2F%2Fnews.example'],
    ]);
  });

  it('leaves out an empty referrer or the site itself', () => {
    const send = vi.fn<(url: string) => void>();
    for (const referrer of ['', 'https://game.example/privacy']) {
      createAnalytics({
        config,
        navigator: {},
        document: page('https://game.example/', referrer),
        send,
      }).visit();
    }
    expect(send.mock.calls).toEqual([
      ['https://demo.goatcounter.com/count?p=%2F'],
      ['https://demo.goatcounter.com/count?p=%2F'],
    ]);
  });

  it('sends an event as its name alone', () => {
    const send = vi.fn<(url: string) => void>();
    createAnalytics({ config, navigator: {}, send }).event('return_d1');
    expect(send).toHaveBeenCalledWith('https://demo.goatcounter.com/count?p=return_d1&e=true');
  });

  it('loads the Cloudflare Web Analytics beacon with its token', () => {
    const doc = page();
    createAnalytics({ config, navigator: {}, document: doc, send: vi.fn() }).visit();
    const script = doc.head.querySelector('script');
    expect(script?.src).toBe('https://static.cloudflareinsights.com/beacon.min.js');
    expect(script?.defer).toBe(true);
    expect(script?.dataset['cfBeacon']).toBe(JSON.stringify({ token: config.cloudflare }));
  });

  it('sends nothing with Global Privacy Control on', () => {
    const send = vi.fn<(url: string) => void>();
    const doc = page();
    const analytics = createAnalytics({
      config,
      navigator: { globalPrivacyControl: true },
      document: doc,
      send,
    });
    analytics.visit();
    analytics.event('first_finish');
    expect(analytics.enabled).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(doc.head.querySelector('script')).toBeNull();
  });

  it('sends nothing to a service the build leaves out', () => {
    const send = vi.fn<(url: string) => void>();
    const doc = page();
    const none = createAnalytics({
      config: { goatcounter: '', cloudflare: '' },
      document: doc,
      send,
    });
    none.visit();
    none.event('first_finish');
    expect(none.enabled).toBe(false);
    expect(send).not.toHaveBeenCalled();
    createAnalytics({
      config: { ...config, cloudflare: '' },
      navigator: {},
      document: doc,
      send,
    }).visit();
    expect(send).toHaveBeenCalledOnce();
    expect(doc.head.querySelector('script')).toBeNull();
  });

  it('sends with a fetch that has no credentials, and ignores failures', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('blocked')));
    vi.stubGlobal('fetch', fetch);
    createAnalytics({ config, navigator: {} }).event('first_finish');
    expect(fetch).toHaveBeenCalledWith('https://demo.goatcounter.com/count?p=first_finish&e=true', {
      mode: 'no-cors',
      credentials: 'omit',
      keepalive: true,
    });
    await Promise.resolve();
  });
});
