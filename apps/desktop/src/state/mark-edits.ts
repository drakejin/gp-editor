import {
  type Hairpin,
  type MusicalDirection,
  type Ottava,
  type PedalAction,
  type RasgueadoPattern,
  type Song,
  type StringAddress,
  setBeatRasgueado,
  setOttava,
  toggleBeatPedal,
  toggleDirection,
  toggleHairpin,
} from '@gp-editor/core';
import { isOfTypes } from '../lib/type-guards';

/** A beat of the cursor's track, where a selection starts. */
export interface BeatPlace {
  readonly measureIndex: number;
  readonly beatIndex: number;
}

/** Notation marks at the cursor: the bar's directions, the beat's hairpin, rasgueado and sustain pedal. */
export type MarkEdit =
  /** A target (segno, coda, fine …) or jump (D.C., D.S. al Coda …) on the cursor's bar, on or off. */
  | { readonly type: 'toggleDirection'; readonly direction: MusicalDirection }
  /** A crescendo or decrescendo on the cursor's beat, or on every beat from `from` (the selection's start) to it. */
  | { readonly type: 'toggleHairpin'; readonly hairpin: Hairpin; readonly from?: BeatPlace }
  | { readonly type: 'setRasgueado'; readonly pattern: RasgueadoPattern | 'none' }
  /** Ped. where the cursor's beat starts, or ✱ where it ends; again takes it off. */
  | { readonly type: 'togglePedal'; readonly action: PedalAction }
  /** An octave sign (8va …) on the cursor's beat, or on every beat from `from` (the selection's start) to it; 'none' takes it off. */
  | { readonly type: 'setOttava'; readonly ottava: Ottava | 'none'; readonly from?: BeatPlace };

export const isMarkEdit = isOfTypes<MarkEdit>({ toggleDirection: true, toggleHairpin: true, setRasgueado: true, togglePedal: true, setOttava: true });

/** Edits that go over the selected beats (or bars): they get where the selection starts. */
const RANGE_EDIT_TYPES: ReadonlySet<string> = new Set(['toggleHairpin', 'setOttava', 'moveToVoice', 'deleteMeasure']);

/**
 * A hairpin or octave sign goes over the selection, Move Voice moves its beats and − Bar deletes its bars: the edit gets
 * where the selection starts (other edits are left as they are).
 */
export function withSelectionStart<T extends { readonly type: string }>(edit: T, anchor: StringAddress | undefined): T {
  if (anchor === undefined || !RANGE_EDIT_TYPES.has(edit.type)) {
    return edit;
  }
  return { ...edit, from: { measureIndex: anchor.measureIndex, beatIndex: anchor.beatIndex } };
}

/** Applies one mark edit at the cursor; the same song when it does not apply. */
export function applyMarkEdit(song: Song, cursor: StringAddress, edit: MarkEdit): Song {
  const { trackIndex, measureIndex, beatIndex, voiceIndex } = cursor;
  const at = { trackIndex, measureIndex, beatIndex, voiceIndex };
  switch (edit.type) {
    case 'toggleDirection':
      return toggleDirection(song, measureIndex, edit.direction);
    case 'toggleHairpin':
      return toggleHairpin(song, edit.from === undefined ? at : { ...at, ...edit.from }, at, edit.hairpin);
    case 'setRasgueado':
      return setBeatRasgueado(song, at, edit.pattern === 'none' ? undefined : edit.pattern);
    case 'togglePedal':
      return toggleBeatPedal(song, at, edit.action);
    case 'setOttava':
      return setOttava(song, edit.from === undefined ? at : { ...at, ...edit.from }, at, edit.ottava === 'none' ? undefined : edit.ottava);
  }
}
