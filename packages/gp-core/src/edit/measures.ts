// Measure insertion and removal after TuxGuitar's TGSongManager.addNewMeasure / removeMeasureHeader (LGPL-2.1).
import { headerTicks } from '../model/defaults';
import type { Clef, Measure, MeasureHeader, Song, Track } from '../model/song';
import { withMeasureDeleted, withMeasureInserted } from './audio-track';
import { relayoutMeasures } from './relayout';
import { insertAt, updateMeasure } from './song-paths';
import { restEvents, toBeats } from './timeline';

/** Voice slots of the beats around a measure: the measure's own beats, else any beat of the track, else one. */
function voiceCountNear(track: Track, measureIndex: number): number {
  const beat = track.measures[measureIndex]?.beats[0] ?? track.measures.find((measure) => measure.beats.length > 0)?.beats[0];
  return Math.max(1, beat?.voices.length ?? 1);
}

/** A copy of the neighbour's header for a new measure: same time signature, tempo and triplet feel, no marker or repeat. */
function newHeader(neighbour: MeasureHeader, start: number): MeasureHeader {
  return {
    number: neighbour.number,
    start,
    timeSignature: neighbour.timeSignature,
    tempo: neighbour.tempo,
    repeatOpen: false,
    repeatClose: 0,
    repeatAlternative: 0,
    tripletFeel: neighbour.tripletFeel,
  };
}

/** A measure of `voiceCount` voice slots holding only rests, in its first voice. */
export function emptyMeasure(header: MeasureHeader, headerIndex: number, voiceCount: number, clef: Clef = 'treble', keySignature = 0): Measure {
  const rests = restEvents(headerTicks(header)) ?? [];
  const voices = Array.from({ length: voiceCount }, (_, voiceIndex) => (voiceIndex === 0 ? rests : []));
  return { headerIndex, clef, keySignature, beats: toBeats(header.start, { voiceCount, voices }, []) };
}

/** A measure holding only rests in its first voice, with the neighbour's clef and key. */
export function restMeasure(track: Track, neighbourIndex: number, header: MeasureHeader, headerIndex: number): Measure {
  const neighbour = track.measures[neighbourIndex];
  return emptyMeasure(header, headerIndex, voiceCountNear(track, neighbourIndex), neighbour?.clef, neighbour?.keySignature);
}

/**
 * New song with a measure inserted before or after `measureIndex`. It copies that measure's time signature, tempo,
 * triplet feel, clef and key (no marker, no repeat), and every track gets a whole-measure rest. The following measures
 * move one measure later. Same song when the measure does not exist.
 */
export function insertMeasure(song: Song, measureIndex: number, position: 'before' | 'after'): Song {
  const neighbour = song.measureHeaders[measureIndex];
  if (neighbour === undefined) {
    return song;
  }
  const insertIndex = position === 'before' ? measureIndex : measureIndex + 1;
  const start = position === 'before' ? neighbour.start : neighbour.start + headerTicks(neighbour);
  const header = newHeader(neighbour, start);
  const measuresByTrack = song.tracks.map((track) => insertAt(track.measures, insertIndex, restMeasure(track, measureIndex, header, insertIndex)));
  const inserted = relayoutMeasures(song, insertAt(song.measureHeaders, insertIndex, header), measuresByTrack);
  return inserted.audioTrack === undefined ? inserted : { ...inserted, audioTrack: withMeasureInserted(inserted.audioTrack, insertIndex) };
}

/**
 * New song without the measure at `measureIndex` in every track; the following measures move back. Same song when the
 * measure does not exist or is the only one left.
 */
export function deleteMeasure(song: Song, measureIndex: number): Song {
  return deleteMeasures(song, measureIndex, measureIndex);
}

/**
 * New song without the measures from `firstIndex` to `lastIndex` (inclusive, either order) in every track, in one edit
 * (Guitar Pro deletes the selected bars); the following measures move back. Same song when a measure of the run does
 * not exist or no measure would be left.
 */
export function deleteMeasures(song: Song, firstIndex: number, lastIndex: number): Song {
  const first = Math.min(firstIndex, lastIndex);
  const last = Math.max(firstIndex, lastIndex);
  const count = song.measureHeaders.length;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= count || last - first + 1 >= count) {
    return song;
  }
  const keep = <T>(_item: T, index: number): boolean => index < first || index > last;
  const deleted = relayoutMeasures(
    song,
    song.measureHeaders.filter(keep),
    song.tracks.map((track) => track.measures.filter(keep)),
  );
  // Later bars first, so each deletion leaves the indexes of the ones still to go as they were.
  const indexes = Array.from({ length: last - first + 1 }, (_, offset) => last - offset);
  const { audioTrack } = deleted;
  return audioTrack === undefined ? deleted : { ...deleted, audioTrack: indexes.reduce((track, index) => withMeasureDeleted(track, index), audioTrack) };
}

/**
 * New song where the track's measure at `measureIndex`, when it holds no beats (the track rests there: many files leave
 * such bars empty), holds rests to the bar line in its first voice, as a measure insertMeasure adds; its clef, key and
 * pedal marks stay. An edit at the bar's beat 0 can then act on it as on the rest drawn there. Same song when the
 * measure has beats or does not exist.
 */
export function fillEmptyMeasure(song: Song, trackIndex: number, measureIndex: number): Song {
  const header = song.measureHeaders[measureIndex];
  const track = song.tracks[trackIndex];
  if (header === undefined || track === undefined || track.measures[measureIndex]?.beats.length !== 0) {
    return song;
  }
  const { beats } = restMeasure(track, measureIndex, header, measureIndex);
  return beats.length === 0 ? song : updateMeasure(song, trackIndex, measureIndex, (measure) => ({ ...measure, beats }));
}
