/**
 * Sharing in the Android app, whose WebView has no `navigator.share`:
 * Capacitor's Share plugin opens Android's share sheet instead (#116).
 */
import type { ShareTarget } from './share.ts';

/** The plugin's `share`. */
type NativeShare = (options: { text: string }) => Promise<unknown>;

/** How the plugin rejects on Android when the player closes the share sheet. */
export const CANCELED = 'Share canceled';

/**
 * A share target that opens the share sheet through `share`, with `clipboard`
 * as the fallback. Closing the sheet becomes an `AbortError`, as with
 * `navigator.share`, so `renderShare` shows nothing.
 */
export function nativeShareTarget(
  share: NativeShare,
  clipboard: ShareTarget['clipboard'],
): ShareTarget {
  return {
    share: async ({ text = '' }) => {
      try {
        await share({ text });
      } catch (error) {
        if (error instanceof Error && error.message === CANCELED) {
          throw new DOMException(CANCELED, 'AbortError');
        }
        throw error;
      }
    },
    ...(clipboard === undefined ? {} : { clipboard }),
  };
}

/** The app's share target. `main.ts` calls it only in the app build, so the website never loads the plugin. */
export async function appShareTarget(
  load: () => Promise<{ Share: { share: NativeShare } }> = () => import('@capacitor/share'),
): Promise<ShareTarget> {
  const { Share } = await load();
  return nativeShareTarget((options) => Share.share(options), navigator.clipboard);
}
