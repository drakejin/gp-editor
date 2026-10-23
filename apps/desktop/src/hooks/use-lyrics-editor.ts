import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { Lyrics, Song } from '@gp-editor/core';
import { type LyricsDraft, draftLyrics, effectiveLyrics, initialLyricsDraft, isSameLyrics, trackLyricsDraft } from '../lib/lyrics-draft';
import type { EditorAction } from '../state/editor';
import type { WorkspaceAction } from '../state/workspace';

/** The score follows the typing once it pauses this long; each pause is one undo step. */
export const LYRICS_APPLY_DELAY = 400;

/** Edit ▸ Lyrics…: the panel's draft of one track's lyrics, applied to the song as it is typed. */
export interface LyricsEditor {
  readonly isOpen: boolean;
  readonly draft?: LyricsDraft;
  readonly open: () => void;
  /** Applies what is still waiting, then closes. */
  readonly close: () => void;
  readonly chooseTrack: (trackIndex: number) => void;
  /** The bar the lyrics start at, kept inside the song. */
  readonly changeFrom: (from: number) => void;
  readonly changeText: (text: string) => void;
}

/** An edit waiting for the typing to pause, and the tab it belongs to. */
interface Pending {
  readonly draft: LyricsDraft;
  readonly tabId?: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * The Lyrics panel's state. Typing applies the draft (`setTrackLyrics`) LYRICS_APPLY_DELAY ms after the last key, to
 * the tab it was typed in, so the score updates live and each pause is one undo step. When the song's lyrics change
 * otherwise (undo, redo, another tab shown), the panel shows them.
 */
export function useLyricsEditor(song: Song | undefined, shownTrackIndex: number, tabId: string | undefined, dispatch: Dispatch<WorkspaceAction>): LyricsEditor {
  const [draft, setDraft] = useState<LyricsDraft | undefined>(undefined);
  const pending = useRef<Pending | undefined>(undefined);
  // The draft track's lyrics as the panel last saw or left them in the song: anything else came from outside.
  const known = useRef<Lyrics | undefined>(undefined);
  const draftTab = useRef(tabId);

  const apply = useCallback(
    (next: LyricsDraft, tab: string | undefined) => {
      const action: EditorAction = { type: 'setTrackLyrics', trackIndex: next.trackIndex, lyrics: draftLyrics(next) };
      dispatch(tab === undefined ? action : { type: 'inTab', tabId: tab, action });
    },
    [dispatch],
  );
  const flush = useCallback(() => {
    const waiting = pending.current;
    if (waiting !== undefined) {
      clearTimeout(waiting.timer);
      pending.current = undefined;
      apply(waiting.draft, waiting.tabId);
    }
  }, [apply]);
  const show = useCallback((next: LyricsDraft | undefined, from: Song | undefined) => {
    setDraft(next);
    known.current = next === undefined || from === undefined ? undefined : effectiveLyrics(from, from.tracks[next.trackIndex]?.lyrics);
  }, []);
  const edit = useCallback(
    (next: LyricsDraft) => {
      setDraft(next);
      known.current = song === undefined ? undefined : effectiveLyrics(song, draftLyrics(next));
      if (pending.current !== undefined) {
        clearTimeout(pending.current.timer);
      }
      const timer = setTimeout(() => {
        pending.current = undefined;
        apply(next, tabId);
      }, LYRICS_APPLY_DELAY);
      pending.current = { draft: next, tabId, timer };
    },
    [song, tabId, apply],
  );

  useFollowSong({ song, shownTrackIndex, tabId, draft, draftTab, pending, known, flush, show });
  // An edit still waiting when the window goes away is dropped with it.
  useEffect(() => {
    const waiting = pending;
    return () => {
      if (waiting.current !== undefined) {
        clearTimeout(waiting.current.timer);
      }
    };
  }, []);

  const measureCount = song?.measureHeaders.length ?? 1;
  return {
    isOpen: draft !== undefined,
    draft,
    open: useCallback(() => {
      draftTab.current = tabId;
      show(song === undefined ? undefined : initialLyricsDraft(song, shownTrackIndex), song);
    }, [song, shownTrackIndex, tabId, show]),
    close: useCallback(() => {
      flush();
      show(undefined, undefined);
    }, [flush, show]),
    chooseTrack: useCallback(
      (trackIndex: number) => {
        flush();
        show(song === undefined ? undefined : trackLyricsDraft(song, trackIndex), song);
      },
      [song, flush, show],
    ),
    changeFrom: useCallback(
      (from: number) => draft !== undefined && Number.isFinite(from) && edit({ ...draft, from: Math.min(Math.max(1, measureCount), Math.max(1, Math.round(from))) }),
      [draft, measureCount, edit],
    ),
    changeText: useCallback((text: string) => draft !== undefined && edit({ ...draft, text }), [draft, edit]),
  };
}

interface FollowSong {
  readonly song: Song | undefined;
  readonly shownTrackIndex: number;
  readonly tabId: string | undefined;
  readonly draft: LyricsDraft | undefined;
  readonly draftTab: { current: string | undefined };
  readonly pending: { readonly current: Pending | undefined };
  readonly known: { readonly current: Lyrics | undefined };
  readonly flush: () => void;
  readonly show: (next: LyricsDraft | undefined, from: Song | undefined) => void;
}

/**
 * Keeps the open panel on the song shown: another tab's lyrics when the tab changes (what was typed still goes to its
 * own tab), the song's lyrics after an undo or redo, closed without a song.
 */
function useFollowSong({ song, shownTrackIndex, tabId, draft, draftTab, pending, known, flush, show }: FollowSong): void {
  useEffect(() => {
    if (draft === undefined) {
      return;
    }
    if (song === undefined) {
      flush();
      show(undefined, undefined);
    } else if (draftTab.current !== tabId) {
      draftTab.current = tabId;
      flush();
      show(initialLyricsDraft(song, shownTrackIndex), song);
    } else if (pending.current === undefined) {
      const current = effectiveLyrics(song, song.tracks[draft.trackIndex]?.lyrics);
      if (!isSameLyrics(current, known.current)) {
        show(trackLyricsDraft(song, draft.trackIndex), song);
      }
    }
  }, [song, shownTrackIndex, tabId, draft, draftTab, pending, known, flush, show]);
}
