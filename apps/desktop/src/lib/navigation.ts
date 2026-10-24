import { MAX_VOICES, type Song, type StringAddress, findNote } from '@gp-editor/core';

/** Cursor on the first beat of the track (first measure that has beats), first string. */
export function firstCursor(song: Song, trackIndex: number): StringAddress | undefined {
  const track = song.tracks[trackIndex];
  const measureIndex = track?.measures.findIndex((measure) => measure.beats.length > 0) ?? -1;
  if (track === undefined || measureIndex < 0) {
    return undefined;
  }
  return { trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: 1 };
}

/** The same string position on the previous (-1) or next (+1) beat of the track, across bar lines; unchanged at either end. */
export function adjacentBeat(song: Song, cursor: StringAddress, step: -1 | 1): StringAddress {
  const measures = song.tracks[cursor.trackIndex]?.measures ?? [];
  const beatCount = measures[cursor.measureIndex]?.beats.length ?? 0;
  const beatIndex = cursor.beatIndex + step;
  if (beatIndex >= 0 && beatIndex < beatCount) {
    return { ...cursor, beatIndex };
  }
  for (let measureIndex = cursor.measureIndex + step; measureIndex >= 0 && measureIndex < measures.length; measureIndex += step) {
    const count = measures[measureIndex]?.beats.length ?? 0;
    if (count > 0) {
      return { ...cursor, measureIndex, beatIndex: step > 0 ? 0 : count - 1 };
    }
  }
  return cursor;
}

/** The cursor moved up (-1, towards string 1) or down (+1) a string, kept on the track's strings. */
export function adjacentString(song: Song, cursor: StringAddress, delta: number): StringAddress {
  const stringCount = song.tracks[cursor.trackIndex]?.strings.length ?? 1;
  return { ...cursor, string: Math.min(stringCount, Math.max(1, cursor.string + delta)) };
}

/** A cursor that points inside the song: indexes clamped to what exists, else the track's first beat. */
export function clampCursor(song: Song, cursor: StringAddress): StringAddress | undefined {
  const track = song.tracks[cursor.trackIndex];
  const measureIndex = Math.min(cursor.measureIndex, (track?.measures.length ?? 1) - 1);
  const beats = track?.measures[measureIndex]?.beats ?? [];
  if (track === undefined || beats.length === 0) {
    return firstCursor(song, cursor.trackIndex);
  }
  return {
    ...cursor,
    measureIndex,
    beatIndex: Math.min(cursor.beatIndex, beats.length - 1),
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
