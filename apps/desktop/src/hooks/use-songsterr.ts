import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { fetchSongsterr, openSongsterrPage } from '../native/songsterr';
import { type SearchOutcome, type SongsterrTransport, searchSongsterr } from '../songsterr/songsterr-search';
import { SONGSTERR_TERMS_URL, normalizeQuery, songPageUrl, songQueryOf } from '../songsterr/songsterr-urls';

/** Typing searches once it pauses this long. */
export const SEARCH_DEBOUNCE_MS = 500;
/** Searches whose songs are kept, so asking again does not ask Songsterr again. */
const MAX_REMEMBERED_SEARCHES = 20;

/** What the panel shows under its field: nothing asked, a search out, or how the last one went. */
export type SongsterrStatus = { readonly kind: 'idle' } | { readonly kind: 'searching'; readonly query: string } | Exclude<SearchOutcome, { readonly kind: 'blank' }>;

export interface SongsterrSearchOptions {
  /** The shown song: the field starts with its title and artist. */
  readonly song?: Song;
  /** The panel closed: the keyboard goes back to the score. */
  readonly onClosed: () => void;
  /** How a search reaches Songsterr (the platform's own, native/songsterr.ts). */
  readonly transport?: SongsterrTransport;
  /** Opens a page in the default browser (native/songsterr.ts). */
  readonly openPage?: (url: string) => Promise<void>;
}

/** Tools ▸ Online ▸ Songsterr Search… and the palette's Songsterr: the search panel's state. */
export interface SongsterrSearch {
  readonly isOpen: boolean;
  /** The field's text. */
  readonly query: string;
  readonly status: SongsterrStatus;
  /** A page could not be opened in the browser. */
  readonly notice?: string;
  readonly open: () => void;
  readonly close: () => void;
  /** Typing: a search follows once it pauses. */
  readonly changeQuery: (text: string) => void;
  /** ↩ or the Search button: the field's text, now. */
  readonly searchNow: () => void;
  /** Open on Songsterr: the song's page in the default browser. */
  readonly openSong: (songId: number) => void;
  readonly openTerms: () => void;
}

interface SearchQueue {
  /** Searches `text`; `isFresh` asks Songsterr even for a remembered search (Search, ↩). */
  readonly run: (text: string, isFresh?: boolean) => void;
  /** Forgets what is out and waiting (the panel closed): an answer that comes later is not shown. */
  readonly drop: () => void;
}

/** Search keys ignore case: Songsterr's search does. */
const searchKey = (query: string) => query.toLowerCase();

function remember(searches: ReadonlyMap<string, SongsterrStatus>, query: string, status: SongsterrStatus): ReadonlyMap<string, SongsterrStatus> {
  return new Map([...searches, [searchKey(query), status] as const].slice(-MAX_REMEMBERED_SEARCHES));
}

/**
 * Searches one at a time — Songsterr is asked again only once its last answer is in: a search asked meanwhile waits
 * (only the latest). An answer is shown only while its query is the one wanted (not after the field changed, a
 * remembered search was shown or the panel closed). Found songs are remembered for typing; a failure is not retried.
 */
function useSearchQueue(transport: () => SongsterrTransport, show: (status: SongsterrStatus) => void): SearchQueue {
  const queue = useRef<{ isAsking: boolean; waiting?: string; wanted?: string; remembered: ReadonlyMap<string, SongsterrStatus> }>({ isAsking: false, remembered: new Map() });
  const run = useCallback(
    (text: string, isFresh = false): void => {
      const query = normalizeQuery(text);
      const state = queue.current;
      const remembered = isFresh ? undefined : state.remembered.get(searchKey(query));
      state.wanted = searchKey(query);
      if (query === '' || remembered !== undefined) {
        state.waiting = undefined;
        show(remembered ?? { kind: 'idle' });
        return;
      }
      show({ kind: 'searching', query });
      if (state.isAsking) {
        state.waiting = query;
        return;
      }
      state.isAsking = true;
      const answered = (outcome: SearchOutcome) => {
        const after = queue.current;
        const { waiting } = after;
        after.isAsking = false;
        after.waiting = undefined;
        if (outcome.kind === 'found' || outcome.kind === 'empty') {
          after.remembered = remember(after.remembered, query, outcome);
        }
        if (waiting !== undefined && waiting !== query) {
          run(waiting, true);
        } else if (outcome.kind !== 'blank' && after.wanted === searchKey(query)) {
          show(outcome);
        }
      };
      searchSongsterr(query, transport()).then(answered, () => answered({ kind: 'failed', query, failure: { reason: 'unexpected' } }));
    },
    [transport, show],
  );
  const drop = useCallback(() => {
    queue.current.wanted = undefined;
    queue.current.waiting = undefined;
  }, []);
  return useMemo(() => ({ run, drop }), [run, drop]);
}

/** A function run once `delay` passes without another call; `cancel` forgets the one waiting. */
function useDebounced(run: (text: string) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);
  const schedule = useCallback(
    (text: string) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        run(text);
      }, delay);
    },
    [cancel, run, delay],
  );
  return useMemo(() => ({ schedule, cancel }), [schedule, cancel]);
}

/** Opens Songsterr's pages in the default browser; `notice` says when that failed. */
function usePageOpener(openPage: () => (url: string) => Promise<void>, isMounted: () => boolean) {
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const clearNotice = useCallback(() => setNotice(undefined), []);
  const openUrl = useCallback(
    (url: string) => {
      setNotice(undefined);
      openPage()(url).catch(() => {
        if (isMounted()) {
          setNotice(t('tools.songsterr.openFailed'));
        }
      });
    },
    [openPage, isMounted],
  );
  const openSong = useCallback((songId: number) => openUrl(songPageUrl(songId)), [openUrl]);
  const openTerms = useCallback(() => openUrl(SONGSTERR_TERMS_URL), [openUrl]);
  return { notice, clearNotice, openSong, openTerms };
}

/** What the hooks' callbacks read at the time they run: the latest props, the field's text and whether the panel is open. */
interface Latest {
  readonly song?: Song;
  readonly onClosed: () => void;
  readonly transport: SongsterrTransport;
  readonly openPage: (url: string) => Promise<void>;
  query: string;
  isOpen: boolean;
  isMounted: boolean;
}

type Debounced = ReturnType<typeof useDebounced>;

/** Opening (the field prefilled from the shown song, searched at once), closing (what waits is dropped), typing and ↩. */
function usePanelControls(latest: RefObject<Latest>, queue: SearchQueue, debounced: Debounced, clearNotice: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setText = useCallback(
    (text: string) => {
      latest.current.query = text;
      setQuery(text);
      clearNotice();
    },
    [latest, clearNotice],
  );
  const open = useCallback(() => {
    if (latest.current.isOpen) {
      return;
    }
    const prefill = songQueryOf(latest.current.song);
    const text = prefill === '' ? latest.current.query : prefill;
    latest.current.isOpen = true;
    setIsOpen(true);
    setText(text);
    queue.run(text);
  }, [latest, queue, setText]);
  const close = useCallback(() => {
    debounced.cancel();
    queue.drop();
    latest.current.isOpen = false;
    setIsOpen(false);
    latest.current.onClosed();
  }, [latest, debounced, queue]);
  const changeQuery = useCallback(
    (text: string) => {
      setText(text);
      debounced.schedule(text);
    },
    [debounced, setText],
  );
  const searchNow = useCallback(() => {
    debounced.cancel();
    queue.run(latest.current.query, true);
  }, [latest, debounced, queue]);
  return { isOpen, query, open, close, changeQuery, searchNow };
}

export function useSongsterr({ song, onClosed, transport = fetchSongsterr, openPage = openSongsterrPage }: SongsterrSearchOptions): SongsterrSearch {
  const [status, setStatus] = useState<SongsterrStatus>({ kind: 'idle' });
  const latest = useRef<Latest>({ song, onClosed, transport, openPage, query: '', isOpen: false, isMounted: true });
  // One object for the hook's life (its isMounted is what the cleanup sets), its props the latest render's.
  Object.assign(latest.current, { song, onClosed, transport, openPage });
  const queue = useSearchQueue(
    useCallback(() => latest.current.transport, []),
    setStatus,
  );
  const debounced = useDebounced(queue.run, SEARCH_DEBOUNCE_MS);
  const { notice, clearNotice, openSong, openTerms } = usePageOpener(
    useCallback(() => latest.current.openPage, []),
    useCallback(() => latest.current.isMounted, []),
  );
  const { isOpen, query, open, close, changeQuery, searchNow } = usePanelControls(latest, queue, debounced, clearNotice);
  useEffect(() => {
    const current = latest.current;
    current.isMounted = true;
    return () => {
      current.isMounted = false;
      debounced.cancel();
      queue.drop();
    };
  }, [debounced, queue]);
  return useMemo(
    () => ({ isOpen, query, status, notice, open, close, changeQuery, searchNow, openSong, openTerms }),
    [isOpen, query, status, notice, open, close, changeQuery, searchNow, openSong, openTerms],
  );
}
