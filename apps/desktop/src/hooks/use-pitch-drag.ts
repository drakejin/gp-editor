import { type Dispatch, type RefObject, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { type NoteGestureEnd, pitchDragHint } from '../lib/pitch-drag';
import { focusView } from '../native/focus-view';
import type { EditorAction, EditorState } from '../state/editor';
import { isInSelection } from '../state/selection';
import { shiftPitch } from '../state/semitone-shift';
import { useStableCallback } from './use-stable-callback';

/** A note dragged up or down on the score: what the score shows meanwhile, and the rows' handlers (they keep their identity). */
export interface PitchDrag {
  /** The song the score shows while the drag has gone some semitones: the move applied, not yet an undo step. */
  readonly song?: Song;
  /** The hint shown meanwhile ("+3 semitones: let go to move, Esc to cancel"). */
  readonly hint?: string;
  /** The mouse went down on a note (ScoreRow's onPressNote). */
  readonly onPressNote: (note: StringAddress) => void;
  /** The drag has reached `semitones` (ScoreRow's onDragNote). */
  readonly onDragNote: (semitones: number) => void;
  /** The gesture ended (ScoreRow's onEndNote). */
  readonly onEndNote: (end: NoteGestureEnd) => void;
  /** Esc while the mouse holds a note: the gesture stops, the notes where they were; true when it had moved them. */
  readonly cancel: () => boolean;
}

interface PitchDragSources {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  /** The view that receives the keys (Esc), focused again on a press, as a click on a beat does. */
  readonly keyboardView: RefObject<View | null>;
}

/** The note pressed, whether it is one of the selected notes (the drag moves them all), and the semitones so far. */
interface NoteGesture {
  readonly note: StringAddress;
  readonly isSelected: boolean;
  readonly semitones: number;
  readonly isCancelled: boolean;
}

const isSameAddress = (a: StringAddress | undefined, b: StringAddress): boolean =>
  a?.trackIndex === b.trackIndex && a.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex && a.voiceIndex === b.voiceIndex && a.string === b.string;

/**
 * What letting go does: a pitch drag's semitones as one shiftPitch (none for 0) — while the editor still points at what
 * was pressed (an arrow key or an MCP tool may have moved the cursor meanwhile) —, a click on a selected note the cursor
 * on it, as any click; nothing for a selection drag or a lost gesture.
 */
function releaseAction(state: EditorState, gesture: NoteGesture, end: NoteGestureEnd): EditorAction | undefined {
  const { note, isSelected, semitones } = gesture;
  if (end === 'click') {
    return isSelected ? { type: 'placeCursor', cursor: note } : undefined;
  }
  const isStillPressed = isSelected ? isInSelection(state, note) : isSameAddress(state.cursor, note);
  return end === 'drag' && semitones !== 0 && isStillPressed ? { type: 'shiftPitch', delta: semitones } : undefined;
}

/** The score's song and hint while the drag has gone `semitones`: the editor's own shiftPitch on the shown state. */
function usePitchPreview(state: EditorState, semitones: number): Pick<PitchDrag, 'song' | 'hint'> {
  return useMemo(() => {
    const preview = semitones === 0 ? undefined : shiftPitch(state, semitones);
    const song = preview?.document?.song;
    return { song: song === state.document?.song ? undefined : song, hint: pitchDragHint(semitones, preview?.hint) };
  }, [semitones, state]);
}

/**
 * Dragging a note up or down moves it by semitones: a press on a note outside the selection puts the cursor on it (that
 * note, with the notes tied to it, is what moves), one on a selected note keeps the selection (they all move). While the
 * drag goes the score shows the move; letting go makes it the one undo step, Esc stops it. The gesture is kept in a ref,
 * so every pointer move sees the last one; only the semitones are React state, for the preview.
 */
export function usePitchDrag({ state, dispatch, keyboardView }: PitchDragSources): PitchDrag {
  const gesture = useRef<NoteGesture | undefined>(undefined);
  const [semitones, setSemitones] = useState(0);
  const keep = (next: NoteGesture | undefined) => {
    gesture.current = next;
    setSemitones(next === undefined || next.isCancelled ? 0 : next.semitones);
  };
  const onPressNote = useStableCallback((note: StringAddress) => {
    const isSelected = isInSelection(state, note);
    keep({ note, isSelected, semitones: 0, isCancelled: false });
    if (!isSelected) {
      dispatch({ type: 'placeCursor', cursor: note });
    }
    focusView(keyboardView.current);
  });
  const onDragNote = useStableCallback((reached: number) => {
    const current = gesture.current;
    if (current !== undefined && !current.isCancelled && reached !== current.semitones) {
      keep({ ...current, semitones: reached });
    }
  });
  const onEndNote = useStableCallback((end: NoteGestureEnd) => {
    const current = gesture.current;
    keep(undefined);
    const action = current === undefined || current.isCancelled ? undefined : releaseAction(state, current, end);
    if (action !== undefined) {
      dispatch(action);
    }
  });
  const cancel = useStableCallback(() => {
    const current = gesture.current;
    if (current === undefined || current.isCancelled) {
      return false;
    }
    keep({ ...current, isCancelled: true });
    return current.semitones !== 0;
  });
  return { ...usePitchPreview(state, semitones), onPressNote, onDragNote, onEndNote, cancel };
}
