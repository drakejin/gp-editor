import type { Beat, Measure, MeasureHeader, Note } from '@gp-editor/core';
import type { MeasureLayout } from '../../lib/layout';

/**
 * The next measure when it follows on the same row, starting at this measure's right bar line: slurs and slides into it
 * are drawn whole, from note to note, by this measure, and it draws no half of them. At a row's end there is none, and
 * the links run to the bar line and come in again at the next row's start.
 */
export interface NextInRow {
  readonly header: MeasureHeader;
  readonly layout: MeasureLayout;
}

/** A note joined to another by a slur, slide or tie: where it is and whether it is in the neighbouring measure. */
export interface LinkedNote {
  readonly note: Note;
  readonly beatIndex: number;
  readonly isInOtherMeasure: boolean;
}

type Search =
  | { readonly found: Note; readonly beatIndex: number }
  | 'rest'
  | undefined;

/** The note on `string` in the voice of `beat`: found, a rest (which ends the search) or nothing to see here. */
function noteOn(
  beat: Beat | undefined,
  voiceIndex: number,
  string: number,
): Note | 'rest' | undefined {
  const voice = beat?.voices[voiceIndex];
  if (voice === undefined || voice.isEmpty) {
    return undefined;
  }
  return voice.notes.length === 0
    ? 'rest'
    : voice.notes.find(note => note.string === string);
}

function search(
  beats: readonly Beat[],
  indexes: readonly number[],
  voiceIndex: number,
  string: number,
): Search {
  for (const beatIndex of indexes) {
    const found = noteOn(beats[beatIndex], voiceIndex, string);
    if (found === 'rest') {
      return 'rest';
    }
    if (found !== undefined) {
      return { found, beatIndex };
    }
  }
  return undefined;
}

function range(from: number, to: number): number[] {
  return from >= to
    ? []
    : Array.from({ length: to - from }, (_, i) => from + i);
}

function toLinked(
  result: Search,
  isInOtherMeasure: boolean,
): LinkedNote | undefined {
  return result === undefined || result === 'rest'
    ? undefined
    : { note: result.found, beatIndex: result.beatIndex, isInOtherMeasure };
}

/**
 * The note `string` plays next in voice `voiceIndex` after beat `beatIndex`: later in the measure, else early in
 * `nextMeasure`. A rest in the voice ends the search.
 */
export function nextNoteOnString(
  measure: Measure,
  beatIndex: number,
  voiceIndex: number,
  string: number,
  nextMeasure?: Measure,
): LinkedNote | undefined {
  const inMeasure = search(
    measure.beats,
    range(beatIndex + 1, measure.beats.length),
    voiceIndex,
    string,
  );
  if (inMeasure !== undefined || nextMeasure === undefined) {
    return toLinked(inMeasure, false);
  }
  return toLinked(
    search(
      nextMeasure.beats,
      range(0, nextMeasure.beats.length),
      voiceIndex,
      string,
    ),
    true,
  );
}

/** The note `string` played before beat `beatIndex` in voice `voiceIndex`: earlier in the measure, else late in `previousMeasure`. */
export function previousNoteOnString(
  measure: Measure,
  beatIndex: number,
  voiceIndex: number,
  string: number,
  previousMeasure?: Measure,
): LinkedNote | undefined {
  const inMeasure = search(
    measure.beats,
    range(0, beatIndex).reverse(),
    voiceIndex,
    string,
  );
  if (inMeasure !== undefined || previousMeasure === undefined) {
    return toLinked(inMeasure, false);
  }
  return toLinked(
    search(
      previousMeasure.beats,
      range(0, previousMeasure.beats.length).reverse(),
      voiceIndex,
      string,
    ),
    true,
  );
}
