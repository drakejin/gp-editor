// Runs of beats of one track between two addresses, as the palette's marks over a selection take them (hairpins, octave
// signs, Move Voice): either order, inclusive, across bars; the voice does not matter.
import type { Beat, Measure, Track } from '../model/song';
import type { BeatAddress } from './addresses';

/** True when `a` comes before `b` in their track: an earlier bar, or an earlier beat of the same bar. */
function isBeatBefore(a: BeatAddress, b: BeatAddress): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

/** The run's ends in track order. */
export function orderRun(from: BeatAddress, to: BeatAddress): readonly [BeatAddress, BeatAddress] {
  return isBeatBefore(to, from) ? [to, from] : [from, to];
}

/** True when beat `beatIndex` of bar `measureIndex` lies from `first` to `last` (in track order). */
export function isInRun(measureIndex: number, beatIndex: number, first: BeatAddress, last: BeatAddress): boolean {
  const here = { ...first, measureIndex, beatIndex };
  return !isBeatBefore(here, first) && !isBeatBefore(last, here);
}

/** The beats of one track from `first` to `last` (each measure's beats in order). */
export function runBeats(track: Track | undefined, first: BeatAddress, last: BeatAddress): readonly Beat[] {
  const measures = track?.measures ?? [];
  return measures.flatMap((measure, measureIndex) => measure.beats.filter((_, beatIndex) => isInRun(measureIndex, beatIndex, first, last)));
}

/** The track with `change` made to each beat from `first` to `last`; the same measures and track where nothing changes. */
export function updateRunBeats(track: Track, first: BeatAddress, last: BeatAddress, change: (beat: Beat) => Beat): Track {
  const measures = track.measures.map((measure, measureIndex): Measure => {
    const beats = measure.beats.map((beat, beatIndex) => (isInRun(measureIndex, beatIndex, first, last) ? change(beat) : beat));
    return beats.every((beat, index) => beat === measure.beats[index]) ? measure : { ...measure, beats };
  });
  return measures.every((measure, index) => measure === track.measures[index]) ? track : { ...track, measures };
}
