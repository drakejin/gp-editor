import { BANJO_DRONE_FRET, type Song, type StringAddress, fretFromTab, trackTuning } from '@gp-editor/core';
import { pitchName } from '../lib/pitch';

/** A fret below the peg of a banjo's short 5th string. */
export const DRONE_FRET_HINT = `The banjo's 5th string starts at fret ${BANJO_DRONE_FRET}: type 0 for the open string, or ${BANJO_DRONE_FRET + 1} and up.`;

/**
 * The fret the file stores for a fret typed at the cursor, as the tab shows it: on a banjo's short 5th string the tab
 * counts from the main nut (7) and the file from the string's peg (2). Undefined for frets 1–5 of that string.
 */
export function storedFret(song: Song, cursor: StringAddress, typed: number): number | undefined {
  const track = song.tracks[cursor.trackIndex];
  return track === undefined ? typed : fretFromTab(trackTuning(track), cursor.string, typed);
}

/** What MIDI step entry left out (pitches no string of the track plays); undefined when every pitch went in. */
export function playedNotesHint(skipped: readonly number[]): string | undefined {
  if (skipped.length === 0) {
    return undefined;
  }
  return `MIDI input: ${skipped.map(pitchName).join(', ')} ${skipped.length === 1 ? 'is' : 'are'} out of this track's reach.`;
}
