import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationPlacement, Song, StringAddress } from '@gp-editor/core';
import {
  type AnnotationDraft,
  annotationExcerpt,
  beatAnnotation,
  canMoveAnnotation,
  cursorBeat,
  draftEdit,
  draftOf,
  isDraftHere,
  isDraftShown,
  isSameBeat,
  locateDraftBeat,
} from '../lib/annotation-draft';
import { t } from '../lib/i18n/i18n';
import type { SongAction, TrackBeat } from '../state/song-actions';
import type { WorkspaceAction } from '../state/workspace';

/** Edit ▸ Annotation… (J): the annotation of the cursor's beat, typed in a panel above the score. */
export interface AnnotationEditor {
  readonly isOpen: boolean;
  readonly draft?: AnnotationDraft;
  /** The draft's beat has an annotation in the song (Delete takes it away). */
  readonly hasAnnotation: boolean;
  /** An annotation the panel showed, which can go to the cursor's beat (Move here): its beat and first words. */
  readonly movable?: { readonly at: TrackBeat; readonly excerpt: string };
  /** Opens on the cursor's beat; open already, it keeps what was typed (it follows the cursor anyway). */
  readonly open: () => void;
  /** Writes what was typed, then closes. */
  readonly close: () => void;
  readonly changeText: (text: string) => void;
  /** Over or under the staves: at once for an annotation with text (one edit), else for the one about to be typed. */
  readonly changePlacement: (placement: AnnotationPlacement) => void;
  /** Writes the typing to the beat: one edit. */
  readonly apply: () => void;
  readonly remove: () => void;
  readonly moveHere: () => void;
}

/** The song and tab the draft belongs to (the typing goes there, whichever tab is shown when it is written). */
interface DraftHome {
  readonly song?: Song;
  readonly tabId?: string;
}

type HomeRef = { current: DraftHome };

/** What the panel does when the song, the cursor's beat or the shown tab changes: write the typing, show another draft. */
interface FollowStep {
  readonly commit: boolean;
  readonly next: AnnotationDraft | undefined | 'keep';
}

function followStep(draft: AnnotationDraft, home: DraftHome, song: Song | undefined, beat: TrackBeat | undefined, tabId: string | undefined, placement: AnnotationPlacement): FollowStep {
  if (song === undefined || beat === undefined) {
    return { commit: true, next: undefined };
  }
  if (home.tabId !== tabId || !isSameBeat(draft.at, beat)) {
    return { commit: true, next: draftOf(song, beat, placement) };
  }
  // Nothing typed: an edit that slid another beat under the cursor, or changed this one's annotation (an undo), shows the song's.
  const isStale = !draft.isEdited && (!isDraftHere(song, draft) || !isDraftShown(song, draft));
  return { commit: false, next: isStale ? draftOf(song, beat, placement) : 'keep' };
}

/** Writes an edit to a tab (the shown document without one); writes the draft's typing to its own beat and tab. */
function useDraftWriter(dispatch: Dispatch<WorkspaceAction>, home: HomeRef, setSource: (source: TrackBeat | undefined) => void) {
  const write = useCallback((action: SongAction | { readonly type: 'showHint'; readonly hint: string } | undefined, tab: string | undefined) => {
    if (action !== undefined) {
      dispatch(tab === undefined ? action : { type: 'inTab', tabId: tab, action });
    }
  }, [dispatch]);
  /** The typing written to its beat; its beat is then the annotation Move here offers. A beat gone meanwhile: the hint says so. */
  const commit = useCallback((current: AnnotationDraft | undefined) => {
    const { song: homeSong, tabId: homeTab } = home.current;
    if (current?.isEdited !== true || homeSong === undefined) {
      return;
    }
    const at = locateDraftBeat(homeSong, current);
    if (at === undefined) {
      write(current.text.trim() === '' ? undefined : { type: 'showHint', hint: t('tools.annotation.lost') }, homeTab);
      return;
    }
    write(draftEdit(homeSong, current), homeTab);
    setSource(current.text.trim() === '' ? undefined : at);
  }, [home, write, setSource]);
  return { write, commit };
}

interface FollowSources {
  readonly song: Song | undefined;
  readonly cursor: StringAddress | undefined;
  readonly tabId: string | undefined;
  readonly draft: AnnotationDraft | undefined;
  readonly setDraft: (draft: AnnotationDraft | undefined) => void;
  readonly setSource: (source: TrackBeat | undefined) => void;
  readonly placement: { current: AnnotationPlacement };
  readonly home: HomeRef;
  readonly commit: (draft: AnnotationDraft | undefined) => void;
}

/** The open panel follows the song, the cursor's beat and the shown tab (followStep); closed, it only keeps up with them. */
function useFollowCursor({ song, cursor, tabId, draft, setDraft, setSource, placement, home, commit }: FollowSources): void {
  const beat = cursorBeat(cursor);
  const [trackIndex, measureIndex, beatIndex] = [beat?.trackIndex, beat?.measureIndex, beat?.beatIndex];
  // Read when the song, the cursor's beat or the tab changes, not on every keystroke.
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const at = trackIndex === undefined || measureIndex === undefined || beatIndex === undefined ? undefined : { trackIndex, measureIndex, beatIndex };
    const shown = latest.current;
    const isHomeTab = home.current.tabId === tabId;
    home.current = shown === undefined || isHomeTab ? { song, tabId } : home.current;
    if (shown === undefined) {
      return;
    }
    const { commit: isCommitted, next } = followStep(shown, home.current, song, at, tabId, placement.current);
    if (isCommitted) {
      commit(shown);
    }
    home.current = { song, tabId };
    if (!isHomeTab || next === undefined) {
      setSource(undefined);
    } else if (next !== 'keep' && song !== undefined && beatAnnotation(song, next.at) !== undefined) {
      setSource(next.at);
    }
    if (next !== 'keep') {
      setDraft(next);
    }
  }, [song, trackIndex, measureIndex, beatIndex, tabId, commit, home, placement, setDraft, setSource]);
}

/**
 * The annotation panel's state: it follows the cursor's beat. Typing waits for Apply (⌘↩) — or for the panel to leave
 * the beat, close or see another tab shown, which write it too — so each change is one edit, in the tab it was typed in.
 * A placement, Delete and Move here are one edit each, at once.
 */
export function useAnnotationEditor(song: Song | undefined, cursor: StringAddress | undefined, tabId: string | undefined, dispatch: Dispatch<WorkspaceAction>): AnnotationEditor {
  const [draft, setDraft] = useState<AnnotationDraft | undefined>(undefined);
  const [source, setSource] = useState<TrackBeat | undefined>(undefined);
  const placement = useRef<AnnotationPlacement>('above');
  const home = useRef<DraftHome>({ song, tabId });
  const { write, commit } = useDraftWriter(dispatch, home, setSource);
  useFollowCursor({ song, cursor, tabId, draft, setDraft, setSource, placement, home, commit });
  const parts: EditorParts = { song, beat: cursorBeat(cursor), tabId, draft, setDraft, source, setSource, placement, home, write, commit };
  return { ...stateOf(parts), ...openAndClose(parts), ...typing(parts), ...beatActions(parts) };
}

interface EditorParts {
  readonly song: Song | undefined;
  readonly beat: TrackBeat | undefined;
  readonly tabId: string | undefined;
  readonly draft: AnnotationDraft | undefined;
  readonly setDraft: (draft: AnnotationDraft | undefined) => void;
  readonly source: TrackBeat | undefined;
  readonly setSource: (source: TrackBeat | undefined) => void;
  readonly placement: { current: AnnotationPlacement };
  readonly home: HomeRef;
  readonly write: ReturnType<typeof useDraftWriter>['write'];
  readonly commit: (draft: AnnotationDraft | undefined) => void;
}

/** The annotation Move here can bring to the draft's beat: nothing typed there, another beat's, and the beat has none. */
function movableAnnotation({ song, draft, source }: EditorParts) {
  return song === undefined || draft === undefined || draft.text.trim() !== '' || !canMoveAnnotation(song, source, draft.at) ? undefined : beatAnnotation(song, source);
}

/** What the panel shows: the draft, whether its beat has an annotation, and the annotation Move here can bring. */
function stateOf(parts: EditorParts): Pick<AnnotationEditor, 'isOpen' | 'draft' | 'hasAnnotation' | 'movable'> {
  const { song, draft, source } = parts;
  const located = song === undefined || draft === undefined ? undefined : locateDraftBeat(song, draft);
  const movable = movableAnnotation(parts);
  return {
    isOpen: draft !== undefined,
    draft,
    hasAnnotation: song !== undefined && beatAnnotation(song, located) !== undefined,
    movable: movable === undefined || source === undefined ? undefined : { at: source, excerpt: annotationExcerpt(movable.text) },
  };
}

function openAndClose({ song, beat, tabId, draft, setDraft, setSource, placement, home, commit }: EditorParts): Pick<AnnotationEditor, 'open' | 'close'> {
  return {
    open: () => {
      if (draft === undefined && song !== undefined && beat !== undefined) {
        home.current = { song, tabId };
        setDraft(draftOf(song, beat, placement.current));
        setSource(beatAnnotation(song, beat) === undefined ? undefined : beat);
      }
    },
    // The typing is written; what Move here could bring is forgotten with the panel.
    close: () => {
      commit(draft);
      setDraft(undefined);
      setSource(undefined);
    },
  };
}

function typing({ song, tabId, draft, setDraft, setSource, placement, write }: EditorParts): Pick<AnnotationEditor, 'changeText' | 'changePlacement' | 'apply'> {
  return {
    changeText: (text) => draft !== undefined && setDraft({ ...draft, text, isEdited: true }),
    changePlacement: (next) => {
      placement.current = next;
      if (draft === undefined || song === undefined) {
        return;
      }
      const placed = { ...draft, placement: next };
      if (placed.text.trim() !== '') {
        write(draftEdit(song, { ...placed, isEdited: true }), tabId);
      }
      setDraft({ ...placed, isEdited: false });
    },
    apply: () => {
      if (song !== undefined && draft !== undefined) {
        write(draftEdit(song, { ...draft, isEdited: true }), tabId);
        setDraft({ ...draft, isEdited: false });
        setSource(draft.text.trim() === '' ? undefined : (locateDraftBeat(song, draft) ?? draft.at));
      }
    },
  };
}

function beatActions(parts: EditorParts): Pick<AnnotationEditor, 'remove' | 'moveHere'> {
  const { song, tabId, draft, setDraft, source, setSource, write } = parts;
  const movable = movableAnnotation(parts);
  return {
    remove: () => {
      if (song !== undefined && draft !== undefined) {
        const at = locateDraftBeat(song, draft) ?? draft.at;
        write(beatAnnotation(song, at) === undefined ? undefined : { type: 'setBeatAnnotation', at, annotation: undefined }, tabId);
        setDraft({ ...draft, text: '', isEdited: false });
        setSource(isSameBeat(source, at) ? undefined : source);
      }
    },
    moveHere: () => {
      if (draft !== undefined && source !== undefined && movable !== undefined) {
        write({ type: 'moveBeatAnnotation', from: source, to: draft.at }, tabId);
        setDraft({ ...draft, text: movable.text, placement: movable.placement, isEdited: false });
        setSource(draft.at);
      }
    },
  };
}
