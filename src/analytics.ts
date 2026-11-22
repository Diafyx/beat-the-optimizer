/**
 * Anonymous measurement of whether players come back the next day
 * (docs/adr/0004-measure-return-with-goatcounter.md). There are no cookies and
 * no identifiers: the game works out from its own progress that a visit is a
 * return, and sends one event that carries only its name. With Global Privacy
 * Control on, or no analytics in the build, nothing is sent.
 */
import { daysBetween } from './daily.ts';

/** The services in this build, from GOATCOUNTER_CODE and CF_BEACON_TOKEN (vite.config.ts). */
declare const __ANALYTICS__: AnalyticsConfig;

export interface AnalyticsConfig {
  /** The GoatCounter site code, or '' for none. */
  readonly goatcounter: string;
  /** The Cloudflare Web Analytics token, or '' for none. */
  readonly cloudflare: string;
}

export const EVENTS = ['first_finish', 'return_d1', 'return_d2_7'] as const;
export type MeasureEvent = (typeof EVENTS)[number];

/**
 * The event to send on opening the site on `today`, if any: `return_d1` the
 * day after the first finished puzzle, `return_d2_7` on a later day of that
 * week, each once. Dates are local, YYYY-MM-DD.
 */
export function returnEvent(
  firstFinish: string | null,
  sent: readonly string[],
  today: string,
): MeasureEvent | null {
  if (firstFinish === null) return null;
  const days = daysBetween(firstFinish, today);
  const event = days === 1 ? 'return_d1' : days >= 2 && days <= 7 ? 'return_d2_7' : null;
  return event !== null && !sent.includes(event) ? event : null;
}

export interface Analytics {
  /** False when nothing is sent: then the game stores nothing for measurement either. */
  readonly enabled: boolean;
  /** Counts a visit, with the page's path and the site that linked to it. */
  visit(): void;
  event(name: MeasureEvent): void;
}

export interface AnalyticsOptions {
  readonly config?: AnalyticsConfig;
  readonly navigator?: object;
  readonly document?: Document;
  /** Sends a request to `url`; by default a fetch without credentials. */
  readonly send?: (url: string) => void;
}

const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';

function fetchUrl(url: string): void {
  // A failed count is not the player's problem.
  fetch(url, { mode: 'no-cors', credentials: 'omit', keepalive: true }).catch(() => undefined);
}

/** The origin of `url`, or null if it is not a URL (such as an empty referrer). */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Whether the browser asks sites not to share or sell the player's data. */
export const globalPrivacyControl = (nav: object): boolean =>
  'globalPrivacyControl' in nav && nav.globalPrivacyControl === true;

export function createAnalytics({
  config = __ANALYTICS__,
  navigator: nav = navigator,
  document: doc = document,
  send = fetchUrl,
}: AnalyticsOptions = {}): Analytics {
  const allowed = !globalPrivacyControl(nav);
  const { goatcounter, cloudflare } = config;
  const enabled = allowed && goatcounter !== '';
  const count = (params: Record<string, string>): void => {
    if (enabled)
      send(`https://${goatcounter}.goatcounter.com/count?${new URLSearchParams(params)}`);
  };
  return {
    enabled,
    visit() {
      const { origin, pathname } = doc.location;
      const from = originOf(doc.referrer);
      count({ p: pathname, ...(from === null || from === origin ? {} : { r: from }) });
      if (allowed && cloudflare !== '') {
        const script = doc.createElement('script');
        script.defer = true;
        script.src = BEACON;
        script.dataset['cfBeacon'] = JSON.stringify({ token: cloudflare });
        doc.head.append(script);
      }
    },
    event(name) {
      count({ p: name, e: 'true' });
    },
  };
}
