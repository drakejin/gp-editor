// One Songsterr search: the URL (songsterr-urls.ts), one request through the platform's transport (native/songsterr.ts:
// fetch on the Mac, the Rust side on Windows), a timeout, and the answer read as untrusted (songsterr-answer.ts). It
// never retries: a failure is reported and the user searches again. Only the search is asked — never a tab's content.
import { t } from '../lib/i18n/i18n';
import { type SongsterrSong, parseSongsterrBody } from './songsterr-answer';
import { normalizeQuery, searchUrl } from './songsterr-urls';

/** A search that has not answered after this long is given up (and its request cancelled). */
export const SEARCH_TIMEOUT_MS = 15_000;
/** HTTP's "Too Many Requests". */
const TOO_MANY_REQUESTS = 429;

/** An HTTP answer as text. */
export interface SongsterrHttpAnswer {
  readonly status: number;
  readonly body: string;
}

/** Asks `url`; resolves with any HTTP status, rejects when no answer came (offline, cancelled …). */
export type SongsterrTransport = (url: string, signal: AbortSignal) => Promise<SongsterrHttpAnswer>;

/** Why a search found nothing to show. */
export type SearchFailure =
  | { readonly reason: 'offline' }
  | { readonly reason: 'timeout' }
  /** Songsterr asked to slow down (429). */
  | { readonly reason: 'busy' }
  | { readonly reason: 'http'; readonly status: number }
  /** An answer that is not the list of songs expected. */
  | { readonly reason: 'unexpected' }
  /** No way to ask here (the Windows page in a plain browser, without the app's Rust side). */
  | { readonly reason: 'unavailable' };

export type SearchOutcome =
  | { readonly kind: 'blank' }
  | {
      readonly kind: 'found';
      readonly query: string;
      readonly songs: readonly SongsterrSong[];
    }
  | { readonly kind: 'empty'; readonly query: string }
  | {
      readonly kind: 'failed';
      readonly query: string;
      readonly failure: SearchFailure;
    };

class SearchTimeout extends Error {}

/** A rejected request as a failure: the Rust side's codes, else a network failure (fetch rejects with a TypeError). */
function requestFailure(error: unknown): SearchFailure {
  if (error instanceof SearchTimeout) {
    return { reason: 'timeout' };
  }
  const code = typeof error === 'object' && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (code === 'timeout' || code === 'unavailable') {
    return { reason: code };
  }
  // The Rust side refused an answer too large to read, or an address that is not Songsterr's search.
  return code === 'too_large' || code === 'bad_url' ? { reason: 'unexpected' } : { reason: 'offline' };
}

/** The transport's answer, or a SearchTimeout after `timeoutMs` (the request is then cancelled). */
async function askWithTimeout(transport: SongsterrTransport, url: string, timeoutMs: number): Promise<SongsterrHttpAnswer> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SearchTimeout());
    }, timeoutMs);
  });
  try {
    return await Promise.race([transport(url, controller.signal), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function outcomeOf(query: string, answer: SongsterrHttpAnswer): SearchOutcome {
  if (answer.status === TOO_MANY_REQUESTS) {
    return { kind: 'failed', query, failure: { reason: 'busy' } };
  }
  if (answer.status < 200 || answer.status > 299) {
    return {
      kind: 'failed',
      query,
      failure: { reason: 'http', status: answer.status },
    };
  }
  const parsed = parseSongsterrBody(answer.body);
  if (parsed.kind === 'unexpected') {
    return { kind: 'failed', query, failure: { reason: 'unexpected' } };
  }
  return parsed.songs.length === 0 ? { kind: 'empty', query } : { kind: 'found', query, songs: parsed.songs };
}

/** Searches Songsterr for `text` once; a blank text asks nothing. */
export async function searchSongsterr(text: string, transport: SongsterrTransport, timeoutMs: number = SEARCH_TIMEOUT_MS): Promise<SearchOutcome> {
  const query = normalizeQuery(text);
  if (query === '') {
    return { kind: 'blank' };
  }
  try {
    return outcomeOf(query, await askWithTimeout(transport, searchUrl(query) ?? '', timeoutMs));
  } catch (error) {
    return { kind: 'failed', query, failure: requestFailure(error) };
  }
}

/** What the panel says for a failure, in the shown language. */
export function failureMessage(failure: SearchFailure): string {
  switch (failure.reason) {
    case 'offline':
      return t('tools.songsterr.offline');
    case 'timeout':
      return t('tools.songsterr.timeout');
    case 'busy':
      return t('tools.songsterr.busy');
    case 'http':
      return t('tools.songsterr.httpError', { status: failure.status });
    case 'unexpected':
      return t('tools.songsterr.unexpected');
    case 'unavailable':
      return t('window.windows.desktopOnly');
  }
}
