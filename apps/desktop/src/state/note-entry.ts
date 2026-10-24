import { BANJO_DRONE_FRET, type Song, type StringAddress, fretFromTab, trackTuning } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { pitchName } from '../lib/pitch';

/** A fret below the peg of a banjo's short 5th string. */
export function droneFretHint(): string {
  return t('palette.hint.droneFret', { fret: BANJO_DRONE_FRET, next: BANJO_DRONE_FRET + 1 });
}

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
  return t(skipped.length === 1 ? 'palette.hint.midiOutOfReach.one' : 'palette.hint.midiOutOfReach.other', { pitches: skipped.map(pitchName).join(', ') });
}
