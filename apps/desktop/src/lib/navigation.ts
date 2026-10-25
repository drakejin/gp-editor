import { MAX_VOICES, type Measure, type Song, type StringAddress, findNote } from '@gp-editor/core';

/** Cursor on the track's first bar, first string: its first beat, or beat 0 of a bar without beats (the track rests there). */
export function firstCursor(song: Song, trackIndex: number): StringAddress | undefined {
  const track = song.tracks[trackIndex];
  if (track === undefined || track.measures.length === 0) {
    return undefined;
  }
  return { trackIndex, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };
}

/** Where the cursor can stand in a bar: on each beat, or on beat 0 alone of a bar without beats (the rest drawn there). */
function placesIn(measure: Measure | undefined): number {
  return Math.max(1, measure?.beats.length ?? 0);
}

/**
 * The same string position on the previous (-1) or next (+1) beat of the track, across bar lines (a bar without beats is
 * one stop); unchanged at either end.
 */
export function adjacentBeat(song: Song, cursor: StringAddress, step: -1 | 1): StringAddress {
  const measures = song.tracks[cursor.trackIndex]?.measures ?? [];
  const beatIndex = cursor.beatIndex + step;
  if (beatIndex >= 0 && beatIndex < placesIn(measures[cursor.measureIndex])) {
    return { ...cursor, beatIndex };
  }
  const measureIndex = cursor.measureIndex + step;
  const measure = measures[measureIndex];
  return measure === undefined ? cursor : { ...cursor, measureIndex, beatIndex: step > 0 ? 0 : placesIn(measure) - 1 };
}

/** The cursor moved up (-1, towards string 1) or down (+1) a string, kept on the track's strings. */
export function adjacentString(song: Song, cursor: StringAddress, delta: number): StringAddress {
  const stringCount = song.tracks[cursor.trackIndex]?.strings.length ?? 1;
  return { ...cursor, string: Math.min(stringCount, Math.max(1, cursor.string + delta)) };
}

/** A cursor that points inside the song: indexes clamped to what exists (beat 0 in a bar without beats); undefined without the track. */
export function clampCursor(song: Song, cursor: StringAddress): StringAddress | undefined {
  const track = song.tracks[cursor.trackIndex];
  if (track === undefined || track.measures.length === 0) {
    return undefined;
  }
  const measureIndex = Math.min(Math.max(0, cursor.measureIndex), track.measures.length - 1);
  return {
    ...cursor,
    measureIndex,
    beatIndex: Math.min(Math.max(0, cursor.beatIndex), placesIn(track.measures[measureIndex]) - 1),
    string: Math.min(Math.max(1, cursor.string), Math.max(1, track.strings.length)),
  };
}

/** The address in the voice that has a note on its string there (its own voice first); unchanged when none has (multivoice clicks). */
export function voiceWithNoteAt(song: Song, cursor: StringAddress): StringAddress {
  if (findNote(song, cursor) !== undefined) {
    return cursor;
  }
  const voiceIndex = Array.from({ length: MAX_VOICES }, (_, index) => index).find((index) => findNote(song, { ...cursor, voiceIndex: index }) !== undefined);
  return voiceIndex === undefined ? cursor : { ...cursor, voiceIndex };
}

/**
 * The cursor on another track at the same moment: the beat of the same bar sounding where the cursor's beat starts
 * (else the bar's first), on `string` kept on that track's strings.
 */
export function cursorInTrack(song: Song, cursor: StringAddress, trackIndex: number, string: number): StringAddress | undefined {
  const start = song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[cursor.beatIndex]?.start;
  const beats = song.tracks[trackIndex]?.measures[cursor.measureIndex]?.beats ?? [];
  const sounding = start === undefined ? -1 : beats.reduce((found, beat, index) => (beat.start <= start ? index : found), -1);
  return clampCursor(song, { ...cursor, trackIndex, beatIndex: Math.max(0, sounding), string });
}
