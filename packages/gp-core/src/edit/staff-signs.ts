// Clefs and octave signs as Guitar Pro 8's Expression Text and edition palette set them (no TuxGuitar counterpart:
// TuxGuitar has neither edit). Both change only how the notation staff writes the notes, never their frets.
import { isOttava } from '../model/defaults';
import type { Beat, Clef, Measure, Ottava, Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { runEnd } from './measure-headers';
import { updateTrack } from './song-paths';

/** The clefs a pitched track's bar can take (Guitar Pro's G, F, C3 and C4 clefs); drum tracks keep the neutral one. */
const PITCHED_CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

function isBefore(a: BeatAddress, b: BeatAddress): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

function isInRange(measureIndex: number, beatIndex: number, first: BeatAddress, last: BeatAddress): boolean {
  const here = { ...first, measureIndex, beatIndex };
  return !isBefore(here, first) && !isBefore(last, here);
}

function withOttava(beat: Beat, ottava: Ottava | undefined): Beat {
  if (beat.ottava === ottava) {
    return beat;
  }
  const { ottava: _removed, ...rest } = beat;
  return ottava === undefined ? rest : { ...rest, ottava };
}

/**
 * New song with the octave sign `ottava` over the beats from `from` to `to` (either order, one track; rests too, so the
 * sign's line runs over them), or none (undefined). The voice does not matter: the sign is the beat's. Same song when
 * nothing changes, the sign is unknown or the track is a drum track (its staff has no pitches to move).
 */
export function setOttava(song: Song, from: BeatAddress, to: BeatAddress, ottava: Ottava | undefined): Song {
  if (ottava !== undefined && !isOttava(ottava)) {
    return song;
  }
  const [first, last] = isBefore(to, from) ? [to, from] : [from, to];
  return updateTrack(song, first.trackIndex, (track) => {
    if (track.isPercussion) {
      return track;
    }
    const measures = track.measures.map((measure, measureIndex): Measure => {
      const beats = measure.beats.map((beat, beatIndex) => (isInRange(measureIndex, beatIndex, first, last) ? withOttava(beat, ottava) : beat));
      return beats.every((beat, index) => beat === measure.beats[index]) ? measure : { ...measure, beats };
    });
    return measures.every((measure, index) => measure === track.measures[index]) ? track : { ...track, measures };
  });
}

/**
 * New song with the clef of one bar of a track set, and of the bars after it that had the same clef (up to the next clef
 * change), as setKeySignature does for keys. Only a pitched track's G, F and C clefs; same song for a drum track, the
 * neutral clef, an unknown bar or no change.
 */
export function setMeasureClef(song: Song, trackIndex: number, measureIndex: number, clef: Clef): Song {
  if (!PITCHED_CLEFS.includes(clef)) {
    return song;
  }
  return updateTrack(song, trackIndex, (track) => {
    const current = track.measures[measureIndex];
    if (track.isPercussion || current === undefined || current.clef === clef) {
      return track;
    }
    const end = runEnd(track.measures, measureIndex, (other) => other.clef === current.clef);
    return { ...track, measures: track.measures.map((measure, index) => (index >= measureIndex && index < end ? { ...measure, clef } : measure)) };
  });
}
