// Notation mark edits as Guitar Pro 8's edition palette makes them (no TuxGuitar counterpart: TuxGuitar has none of
// these marks): a bar's directions, hairpins over a run of beats, a beat's rasgueado and the sustain pedal.
import { MUSICAL_DIRECTIONS, sortDirections } from '../formats/common/directions';
import { isRasgueadoPattern } from '../formats/common/rasgueado';
import { comparePedalMarks, durationTicks, measureTicks } from '../model/defaults';
import type { Beat, Hairpin, Measure, MeasureHeader, MusicalDirection, PedalAction, PedalMark, RasgueadoPattern, Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { replaceAt, updateBeat, updateMeasure, updateTrack } from './song-paths';

const HAIRPINS: readonly Hairpin[] = ['crescendo', 'decrescendo'];

function withDirections(header: MeasureHeader, directions: readonly MusicalDirection[]): MeasureHeader {
  const { directions: _removed, ...rest } = header;
  return directions.length === 0 ? rest : { ...rest, directions };
}

/** New song with a musical direction of one bar switched on or off (kept in GP5's order). Same song for an unknown bar or direction. */
export function toggleDirection(song: Song, measureIndex: number, direction: MusicalDirection): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined || !MUSICAL_DIRECTIONS.includes(direction)) {
    return song;
  }
  const current = header.directions ?? [];
  const next = current.includes(direction) ? current.filter((other) => other !== direction) : sortDirections([...current, direction]);
  return { ...song, measureHeaders: replaceAt(song.measureHeaders, measureIndex, withDirections(header, next)) };
}

function isBefore(a: BeatAddress, b: BeatAddress): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

function isInRange(measureIndex: number, beatIndex: number, first: BeatAddress, last: BeatAddress): boolean {
  const here = { ...first, measureIndex, beatIndex };
  return !isBefore(here, first) && !isBefore(last, here);
}

function withHairpin(beat: Beat, hairpin: Hairpin | undefined): Beat {
  if (beat.hairpin === hairpin) {
    return beat;
  }
  const { hairpin: _removed, ...rest } = beat;
  return hairpin === undefined ? rest : { ...rest, hairpin };
}

/** The beats of one track from `first` to `last` (each measure's beats in order). */
function beatsInRange(song: Song, first: BeatAddress, last: BeatAddress): readonly Beat[] {
  const measures = song.tracks[first.trackIndex]?.measures ?? [];
  return measures.flatMap((measure, measureIndex) => measure.beats.filter((_, beatIndex) => isInRange(measureIndex, beatIndex, first, last)));
}

/**
 * New song with a crescendo or decrescendo over the beats from `from` to `to` (either order, one track; the voice does
 * not matter: a hairpin is the beat's). When every one of them already has it, it is taken off instead. Same song when
 * there is no beat in the range or the hairpin is unknown.
 */
export function toggleHairpin(song: Song, from: BeatAddress, to: BeatAddress, hairpin: Hairpin): Song {
  const [first, last] = isBefore(to, from) ? [to, from] : [from, to];
  const beats = beatsInRange(song, first, last);
  if (beats.length === 0 || !HAIRPINS.includes(hairpin)) {
    return song;
  }
  const next = beats.every((beat) => beat.hairpin === hairpin) ? undefined : hairpin;
  return updateTrack(song, first.trackIndex, (track) => {
    const measures = track.measures.map((measure, measureIndex): Measure => {
      const changed = measure.beats.map((beat, beatIndex) => (isInRange(measureIndex, beatIndex, first, last) ? withHairpin(beat, next) : beat));
      return changed.every((beat, index) => beat === measure.beats[index]) ? measure : { ...measure, beats: changed };
    });
    return measures.every((measure, index) => measure === track.measures[index]) ? track : { ...track, measures };
  });
}

/** New song with the beat strummed as a rasgueado of `pattern`, or not (undefined). Same song for an unknown pattern. */
export function setBeatRasgueado(song: Song, at: BeatAddress, pattern: RasgueadoPattern | undefined): Song {
  if (pattern !== undefined && !isRasgueadoPattern(pattern)) {
    return song;
  }
  return updateBeat(song, at, (beat) => {
    if (beat.rasgueado === pattern) {
      return beat;
    }
    const { rasgueado: _removed, ...rest } = beat;
    return pattern === undefined ? rest : { ...rest, rasgueado: pattern };
  });
}

function withPedals(measure: Measure, pedals: readonly PedalMark[]): Measure {
  const { pedals: _removed, ...rest } = measure;
  return pedals.length === 0 ? rest : { ...rest, pedals };
}

/** The pedal mark switched on or off at `offset` in the measure, the marks kept in order. */
function togglePedalMark(measure: Measure, mark: PedalMark): Measure {
  const current = measure.pedals ?? [];
  const isThere = current.some((other) => other.offset === mark.offset && other.action === mark.action);
  const next = isThere ? current.filter((other) => other.offset !== mark.offset || other.action !== mark.action) : [...current, mark].sort(comparePedalMarks);
  return withPedals(measure, next);
}

/**
 * New song with the sustain pedal pressed where the addressed beat starts ('down') or released where it ends ('up'), in
 * the beat's voice; the same press or release again takes it off. Same song when that voice has no beat there.
 */
export function toggleBeatPedal(song: Song, at: BeatAddress, action: PedalAction): Song {
  const header = song.measureHeaders[at.measureIndex];
  const beat = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex];
  const voice = beat?.voices[at.voiceIndex];
  if (header === undefined || beat === undefined || voice === undefined || voice.isEmpty) {
    return song;
  }
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const start = beat.start - header.start;
  const position = action === 'down' ? start : start + durationTicks(voice.duration);
  const offset = Math.min(length, Math.max(0, position));
  return updateMeasure(song, at.trackIndex, at.measureIndex, (measure) => togglePedalMark(measure, { offset, action }));
}
