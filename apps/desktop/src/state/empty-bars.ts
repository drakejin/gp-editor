import { type Song, type StringAddress, fillEmptyMeasure } from '@gp-editor/core';

/**
 * Bars without beats: many files leave a bar empty where a track rests, and the score draws a whole rest there. The
 * cursor stands in such a bar on its beat 0, and an edit there acts as on that rest.
 */

/** The song as an edit at the cursor sees it: the cursor's bar, when it holds no beats, filled with the rests drawn there. */
export function withBarRests(song: Song, cursor: StringAddress): Song {
  return fillEmptyMeasure(song, cursor.trackIndex, cursor.measureIndex);
}

/**
 * `edit` at `at`; when it changes nothing in a bar without beats, it acts on the rests drawn there instead (a fret, a
 * drum key, a duration, a chord …). Bar edits (time signature, tempo, − Bar …) change the song as it is, so they never
 * fill the bar. The same song when neither changes anything.
 */
export function editAtCursor(song: Song, at: StringAddress, edit: (song: Song, at: StringAddress) => Song): Song {
  const edited = edit(song, at);
  const filled = edited === song ? withBarRests(song, at) : song;
  if (filled === song) {
    return edited;
  }
  const refilled = edit(filled, at);
  return refilled === filled ? song : refilled;
}
