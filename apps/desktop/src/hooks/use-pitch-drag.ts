import { type Dispatch, type RefObject, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { type NoteGestureEnd, pitchDragHint } from '../lib/pitch-drag';
import { focusView } from '../native/focus-view';
import type { EditorAction, EditorState } from '../state/editor';
import { isInSelection } from '../state/selection';
import { type PressedNote, isStillPressed, shiftPitch } from '../state/semitone-shift';
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

/** The note pressed and whether it is one of the selected notes (the drag moves them all), and the semitones so far. */
interface NoteGesture {
  readonly pressed: PressedNote;
  readonly semitones: number;
  readonly isCancelled: boolean;
}

/**
 * What letting go does: a pitch drag's semitones as one shiftPitch (none for 0), naming the note pressed — the reducer
 * applies it only while the editor still points at that note, on its own up-to-date state —, a click on a selected note
 * the cursor on it, as any click; nothing for a selection drag or a lost gesture.
 */
function releaseAction(gesture: NoteGesture, end: NoteGestureEnd): EditorAction | undefined {
  const { pressed, semitones } = gesture;
  if (end === 'click') {
    return pressed.isSelected ? { type: 'placeCursor', cursor: pressed.note } : undefined;
  }
  return end === 'drag' && semitones !== 0 ? { type: 'shiftPitch', delta: semitones, pressed } : undefined;
}

/**
 * The score's song and hint while the drag has gone `semitones`: the editor's own shiftPitch on the shown state, as
 * letting go will apply it — nothing once the editor no longer points at the pressed note (an arrow key moved the cursor).
 */
function usePitchPreview(state: EditorState, semitones: number, pressed: PressedNote | undefined): Pick<PitchDrag, 'song' | 'hint'> {
  return useMemo(() => {
    const isShown = semitones !== 0 && (pressed === undefined || isStillPressed(state, pressed));
    const preview = isShown ? shiftPitch(state, semitones, pressed) : undefined;
    const song = preview?.document?.song;
    return { song: song === state.document?.song ? undefined : song, hint: isShown ? pitchDragHint(semitones, preview?.hint) : undefined };
  }, [semitones, pressed, state]);
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
  // The same object for the whole gesture, so the preview is laid out again only when the semitones change.
  const [pressed, setPressed] = useState<PressedNote | undefined>(undefined);
  const keep = (next: NoteGesture | undefined) => {
    gesture.current = next;
    setSemitones(next === undefined || next.isCancelled ? 0 : next.semitones);
    setPressed(next?.pressed);
  };
  const onPressNote = useStableCallback((note: StringAddress) => {
    const isSelected = isInSelection(state, note);
    keep({ pressed: { note, isSelected }, semitones: 0, isCancelled: false });
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
    const action = current === undefined || current.isCancelled ? undefined : releaseAction(current, end);
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
  return { ...usePitchPreview(state, semitones, pressed), onPressNote, onDragNote, onEndNote, cancel };
}
