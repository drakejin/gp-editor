import {
  type Clef,
  type MeasureHeader,
  NOTE_VALUES,
  RED,
  type Song,
  type StringAddress,
  type TripletFeel,
  setKeySignature,
  setMeasureClef,
  setMeasureMarker,
  setRepeat,
  setTempo,
  setTimeSignature,
  setTripletFeel,
  toNoteValue,
} from '@gp-editor/core';
import { isOfTypes } from '../lib/type-guards';

/** Edits of the cursor's bar (its measure header, and its key in the cursor's track). */
export type BarEdit =
  | {
      readonly type: 'shiftTimeSignature';
      readonly part: 'numerator' | 'denominator';
      readonly delta: number;
    }
  /** A typed time signature (the MCP server's set_time_signature), from the cursor's bar, one undo step. */
  | { readonly type: 'setTimeSignature'; readonly numerator: number; readonly denominator: number }
  | { readonly type: 'shiftTempo'; readonly delta: number }
  /** A typed tempo (decimals kept to two places by setTempo). */
  | { readonly type: 'setTempo'; readonly tempo: number }
  | { readonly type: 'shiftKeySignature'; readonly delta: number }
  /** A key signature typed or picked (-7 flats … 7 sharps), from the cursor's bar. */
  | { readonly type: 'setKeySignature'; readonly keySignature: number }
  /** The clef of the cursor's track from the cursor's bar to its next clef change (G, F or C clef). */
  | { readonly type: 'setClef'; readonly clef: Clef }
  | { readonly type: 'toggleRepeatOpen' }
  | { readonly type: 'toggleRepeatClose' }
  /** Ending 1…8: plays this bar on that pass of the repeat. */
  | { readonly type: 'toggleAlternateEnding'; readonly ending: number }
  /** Only where the bar closes a repeat; the count stays at two or more. */
  | { readonly type: 'shiftRepeatCount'; readonly delta: number }
  | { readonly type: 'setTripletFeel'; readonly feel: TripletFeel }
  /** The bar's section marker; an empty title removes it. */
  | { readonly type: 'setSection'; readonly title: string };

export const isBarEdit = isOfTypes<BarEdit>({
  shiftTimeSignature: true, setTimeSignature: true, shiftTempo: true, setTempo: true, shiftKeySignature: true, setKeySignature: true, setClef: true, toggleRepeatOpen: true,
  toggleRepeatClose: true, toggleAlternateEnding: true, shiftRepeatCount: true, setTripletFeel: true, setSection: true,
});

/** Repeat count a new repeat close gets (play twice), and the fewest a repeat plays. */
const DEFAULT_REPEAT_COUNT = 2;
/** Alternate endings 1–8 (one bit each of MeasureHeader.repeatAlternative). */
const MAX_ALTERNATE_ENDING = 8;

/** Applies one bar edit to the cursor's bar; the key shifts from the key of the cursor's track. */
export function applyBarEdit(
  song: Song,
  cursor: StringAddress,
  edit: BarEdit,
): Song {
  const { measureIndex } = cursor;
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return song;
  }
  switch (edit.type) {
    case 'shiftTimeSignature':
      return shiftTimeSignature(
        song,
        measureIndex,
        header,
        edit.part,
        edit.delta,
      );
    case 'setTimeSignature':
      return setTimeSignature(song, measureIndex, { numerator: edit.numerator, denominator: edit.denominator });
    case 'shiftTempo':
      return setTempo(song, measureIndex, header.tempo + edit.delta);
    case 'setTempo':
      return setTempo(song, measureIndex, edit.tempo);
    case 'shiftKeySignature': {
      const keySignature =
        song.tracks[cursor.trackIndex]?.measures[measureIndex]?.keySignature ??
        0;
      return setKeySignature(song, measureIndex, keySignature + edit.delta);
    }
    case 'setKeySignature':
      return setKeySignature(song, measureIndex, edit.keySignature);
    case 'setClef':
      return setMeasureClef(song, cursor.trackIndex, measureIndex, edit.clef);
    default:
      return applyRepeatOrMark(song, measureIndex, header, edit);
  }
}

function shiftTimeSignature(
  song: Song,
  measureIndex: number,
  header: MeasureHeader,
  part: 'numerator' | 'denominator',
  delta: number,
): Song {
  const { numerator, denominator } = header.timeSignature;
  if (part === 'numerator') {
    return setTimeSignature(song, measureIndex, {
      numerator: numerator + delta,
      denominator,
    });
  }
  const shifted =
    NOTE_VALUES[NOTE_VALUES.indexOf(toNoteValue(denominator)) + delta] ??
    denominator;
  return setTimeSignature(song, measureIndex, {
    numerator,
    denominator: shifted,
  });
}

/** Repeats, alternate endings, triplet feel and the section marker of one bar. */
function applyRepeatOrMark(
  song: Song,
  measureIndex: number,
  header: MeasureHeader,
  edit: BarEdit,
): Song {
  switch (edit.type) {
    case 'toggleRepeatOpen':
      return setRepeat(song, measureIndex, { repeatOpen: !header.repeatOpen });
    case 'toggleRepeatClose':
      return setRepeat(song, measureIndex, {
        repeatClose: header.repeatClose > 0 ? 0 : DEFAULT_REPEAT_COUNT,
      });
    case 'toggleAlternateEnding':
      return isAlternateEnding(edit.ending)
        ? setRepeat(song, measureIndex, {
            repeatAlternative: toggledEnding(
              header.repeatAlternative,
              edit.ending,
            ),
          })
        : song;
    case 'shiftRepeatCount':
      return header.repeatClose > 0 && Number.isFinite(edit.delta)
        ? setRepeat(song, measureIndex, {
            repeatClose: Math.max(
              DEFAULT_REPEAT_COUNT,
              header.repeatClose + edit.delta,
            ),
          })
        : song;
    case 'setTripletFeel':
      return setTripletFeel(song, measureIndex, edit.feel);
    case 'setSection':
      return setMeasureMarker(song, measureIndex, {
        title: edit.title,
        color: header.marker?.color ?? RED,
      });
    default:
      return song;
  }
}

function isAlternateEnding(ending: number): boolean {
  return (
    Number.isInteger(ending) && ending >= 1 && ending <= MAX_ALTERNATE_ENDING
  );
}

/** The ending bit mask with the bit of `ending` (1 = bit 0) flipped. */
function toggledEnding(mask: number, ending: number): number {
  const bit = 2 ** (ending - 1);
  const isOn = Math.floor(mask / bit) % 2 === 1;
  return isOn ? mask - bit : mask + bit;
}
