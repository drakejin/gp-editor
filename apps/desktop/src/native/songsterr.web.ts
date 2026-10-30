// Windows twin of songsterr.ts. WebView2's fetch cannot read Songsterr's answer — Songsterr sends no
// Access-Control-Allow-Origin — so the Rust side asks (src-tauri/src/commands/songsterr.rs: Songsterr's search URL and
// nothing else, its own 15 s timeout) and opens Songsterr's pages in the default browser. The search's signal stays
// here: the panel stops waiting at its own timeout. Only the search is asked, never a tab's content.
import type { SongsterrHttpAnswer } from '../songsterr/songsterr-search';
import { call } from './web/tauri';

/** Asks a Songsterr search URL through the Rust side; resolves with any HTTP status, rejects when no answer came. */
export function fetchSongsterr(url: string): Promise<SongsterrHttpAnswer> {
  return call<SongsterrHttpAnswer>('songsterr_search', { url });
}

/** Opens one of Songsterr's pages in the default browser (the Rust side checks it is one). */
export function openSongsterrPage(url: string): Promise<void> {
  return call('songsterr_open', { url });
}
