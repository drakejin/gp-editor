import { type Song, type StringAddress, type TranspositionOptions, findNote, isPercussionTrack, transpose, voiceOf } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { noNoteHint } from './edit-hints';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { transpositionHint, transpositionScope } from './transposition';

// Guitar Pro 8's One semitone up / down (⌥⇧↑ / ⌥⇧↓, the palette's Raise / Lower by a Semitone): the selected notes, or
// the note at the cursor, a semitone higher or lower — gp-core's transpose on that scope, the chords and key left as
// they are (Tools ▸ Transpose… moves those).

/** A semitone up (1) or down (−1). */
export type SemitoneStep = 1 | -1;

function semitoneOptions(delta: SemitoneStep): TranspositionOptions {
  return { mode: 'chromatic', amount: delta, isNotesOnly: true };
}

/** Why a press can move nothing here (a drum track, a natural harmonic at the cursor); undefined when it may. */
function refusal(song: Song, cursor: StringAddress, hasSelection: boolean): string | undefined {
  const track = song.tracks[cursor.trackIndex];
  if (track !== undefined && isPercussionTrack(song, track)) {
    return t('palette.hint.semitoneDrums');
  }
  return !hasSelection && findNote(song, cursor)?.effect.harmonic?.type === 'natural' ? t('palette.hint.semitoneNaturalHarmonic') : undefined;
}

/** The string the cursor's note went to: the one note of its voice the edit made anew; the cursor's own when none. */
function movedNoteString(before: Song, after: Song, cursor: StringAddress): number {
  const voiceIn = (song: Song) => {
    const beat = song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
    return beat === undefined ? undefined : voiceOf(beat, cursor.voiceIndex);
  };
  const old = voiceIn(before)?.notes ?? [];
  return voiceIn(after)?.notes.find((note) => !old.includes(note))?.string ?? cursor.string;
}

function withHint(state: EditorState, hint: string | undefined): EditorState {
  return state.hint === hint ? state : { ...state, hint };
}

/**
 * The selected notes (in the selection's voice), else the note at the cursor and the notes tied to it, a semitone up or
 * down: one undo step. A note keeps its string while its fret allows, else goes to a string free on its beat (the
 * cursor goes with the cursor's note); one that fits nowhere stays, and the hint strip counts it. The selection stays,
 * for the next press. Drum tracks never move (a drum note's fret is its drum), nor does a natural harmonic.
 */
export function shiftPitch(state: EditorState, delta: SemitoneStep): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  const { song } = document;
  const selection = transpositionScope(state, 'selection');
  const refused = refusal(song, cursor, selection !== undefined);
  if (refused !== undefined) {
    return withHint(state, refused);
  }
  const options = semitoneOptions(delta);
  const result = transpose(song, selection ?? { kind: 'note', at: cursor }, options);
  if (result.moved === 0 && result.unplaced === 0) {
    return withHint(state, selection === undefined ? noNoteHint(cursor.string) : t('palette.hint.noNoteInSelection'));
  }
  const recorded = recordSong(state, document, result.song);
  const string = selection === undefined ? movedNoteString(song, result.song, cursor) : cursor.string;
  const followed = string === cursor.string ? recorded : { ...recorded, cursor: { ...cursor, string } };
  return withHint(followed, result.unplaced === 0 ? undefined : transpositionHint(result, options));
}
