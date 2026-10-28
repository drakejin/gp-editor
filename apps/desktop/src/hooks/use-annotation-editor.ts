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
  isDraftShown,
  isSameBeat,
  locateDraftBeat,
} from '../lib/annotation-draft';
import type { SongAction, TrackBeat } from '../state/song-actions';
import type { WorkspaceAction } from '../state/workspace';

/** Edit ▸ Annotation… (J): the annotation of the cursor's beat, typed in a panel above the score. */
export interface AnnotationEditor {
  readonly isOpen: boolean;
  readonly draft?: AnnotationDraft;
  /** An annotation the panel showed, which can go to the cursor's beat (Move here): its beat and first words. */
  readonly movable?: { readonly at: TrackBeat; readonly excerpt: string };
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
  // An undo, a redo or another edit changed the beat's annotation while nothing was typed: show the song's.
  return { commit: false, next: !draft.isEdited && !isDraftShown(song, draft) ? draftOf(song, beat, placement) : 'keep' };
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
  const write = useCallback((action: SongAction | undefined, tab: string | undefined) => {
    if (action !== undefined) {
      dispatch(tab === undefined ? action : { type: 'inTab', tabId: tab, action });
    }
  }, [dispatch]);
  /** The draft's typing written to its beat in its own tab; the beat is then the annotation Move here offers. */
  const commit = useCallback((current: AnnotationDraft | undefined) => {
    const { song: homeSong, tabId: homeTab } = home.current;
    if (current?.isEdited !== true || homeSong === undefined) {
      return;
    }
    write(draftEdit(homeSong, current), homeTab);
    setSource(current.text.trim() === '' ? undefined : (locateDraftBeat(homeSong, current) ?? current.at));
  }, [write]);
  const beat = cursorBeat(cursor);
  const [trackIndex, measureIndex, beatIndex] = [beat?.trackIndex, beat?.measureIndex, beat?.beatIndex];
  // Read when the song, the cursor's beat or the tab changes, not on every keystroke.
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const at = trackIndex === undefined || measureIndex === undefined || beatIndex === undefined ? undefined : { trackIndex, measureIndex, beatIndex };
    const draft = latest.current;
    if (draft === undefined) {
      home.current = { song, tabId };
      return;
    }
    const isHomeTab = home.current.tabId === tabId;
    home.current = isHomeTab ? { song, tabId } : home.current;
    const step = followStep(draft, home.current, song, at, tabId, placement.current);
    if (step.commit) {
      commit(draft);
    }
    home.current = { song, tabId };
    const { next } = step;
    if (!isHomeTab || next === undefined) {
      setSource(undefined);
    } else if (next !== 'keep' && song !== undefined && beatAnnotation(song, next.at) !== undefined) {
      setSource(next.at);
    }
    if (next !== 'keep') {
      setDraft(next);
    }
  }, [song, trackIndex, measureIndex, beatIndex, tabId, commit]);
  return useEditorActions({ song, beat, draft, setDraft, source, setSource, placement, home, write, commit });
}

interface EditorParts {
  readonly song: Song | undefined;
  readonly beat: TrackBeat | undefined;
  readonly draft: AnnotationDraft | undefined;
  readonly setDraft: (draft: AnnotationDraft | undefined) => void;
  readonly source: TrackBeat | undefined;
  readonly setSource: (source: TrackBeat | undefined) => void;
  readonly placement: { current: AnnotationPlacement };
  readonly home: { current: DraftHome };
  readonly write: (action: SongAction | undefined, tab: string | undefined) => void;
  readonly commit: (draft: AnnotationDraft | undefined) => void;
}

/** The panel's buttons and field. */
function useEditorActions(parts: EditorParts): AnnotationEditor {
  const { song, beat, draft, setDraft, source, setSource, placement, home, write, commit } = parts;
  const tab = home.current.tabId;
  const movableAnnotation = song === undefined || draft === undefined || draft.text.trim() !== '' || !canMoveAnnotation(song, source, draft.at) ? undefined : beatAnnotation(song, source);
  const apply = () => {
    if (song !== undefined && draft !== undefined) {
      write(draftEdit(song, { ...draft, isEdited: true }), tab);
      setDraft({ ...draft, isEdited: false });
      setSource(draft.text.trim() === '' ? undefined : draft.at);
    }
  };
  return {
    isOpen: draft !== undefined,
    draft,
    movable: movableAnnotation === undefined || source === undefined ? undefined : { at: source, excerpt: annotationExcerpt(movableAnnotation.text) },
    open: () => {
      if (song !== undefined && beat !== undefined) {
        home.current = { song, tabId: tab ?? home.current.tabId };
        setDraft(draftOf(song, beat, placement.current));
        setSource(beatAnnotation(song, beat) === undefined ? source : beat);
      }
    },
    close: () => {
      commit(draft);
      setDraft(undefined);
    },
    changeText: (text) => draft !== undefined && setDraft({ ...draft, text, isEdited: true }),
    changePlacement: (next) => {
      placement.current = next;
      if (draft === undefined || song === undefined) {
        return;
      }
      const placed = { ...draft, placement: next };
      if (placed.text.trim() !== '') {
        write(draftEdit(song, { ...placed, isEdited: true }), tab);
      }
      setDraft({ ...placed, isEdited: false });
    },
    apply,
    remove: () => {
      if (song !== undefined && draft !== undefined) {
        const at = locateDraftBeat(song, draft) ?? draft.at;
        write(beatAnnotation(song, at) === undefined ? undefined : { type: 'setBeatAnnotation', at, annotation: undefined }, tab);
        setDraft({ ...draft, text: '', isEdited: false });
        setSource(isSameBeat(source, at) ? undefined : source);
      }
    },
    moveHere: () => {
      if (draft !== undefined && source !== undefined && movableAnnotation !== undefined) {
        write({ type: 'moveBeatAnnotation', from: source, to: draft.at }, tab);
        setDraft({ ...draft, text: movableAnnotation.text, placement: movableAnnotation.placement, isEdited: false });
        setSource(draft.at);
      }
    },
  };
}
