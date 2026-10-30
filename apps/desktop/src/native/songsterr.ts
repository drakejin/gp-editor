// The Songsterr panel's way to the network on the Mac (src/songsterr/): React Native's fetch — the App Sandbox has
// com.apple.security.network.client, and a native request needs no CORS headers, which Songsterr does not send — and
// Linking, which opens a page in the default browser (NSWorkspace). Windows twin: songsterr.web.ts (the Rust side).
// Only Songsterr's search is asked and its pages opened, never a tab's content (songsterr-urls.ts says why).
import { Linking } from 'react-native';
import type { SongsterrHttpAnswer } from '../songsterr/songsterr-search';
import { SONGSTERR_ORIGIN } from '../songsterr/songsterr-urls';

/** True for a page of Songsterr's site, the only one these functions reach. */
function isSongsterrUrl(url: string): boolean {
  return url.startsWith(`${SONGSTERR_ORIGIN}/`);
}

/** GETs a Songsterr search URL without cookies; resolves with any HTTP status, rejects when no answer came. */
export async function fetchSongsterr(url: string, signal: AbortSignal): Promise<SongsterrHttpAnswer> {
  if (!isSongsterrUrl(url)) {
    // i18n-exempt: a programming error (the URLs come from songsterr-urls.ts)
    throw new Error('Not a Songsterr address');
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal,
  });
  return { status: response.status, body: await response.text() };
}

/** Opens one of Songsterr's pages in the default browser. */
export async function openSongsterrPage(url: string): Promise<void> {
  if (!isSongsterrUrl(url)) {
    // i18n-exempt: a programming error (the URLs come from songsterr-urls.ts)
    throw new Error('Not a Songsterr address');
  }
  await Linking.openURL(url);
}
