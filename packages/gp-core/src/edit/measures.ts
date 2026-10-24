// Measure insertion and removal after TuxGuitar's TGSongManager.addNewMeasure / removeMeasureHeader (LGPL-2.1).
import { headerTicks } from '../model/defaults';
import type { Measure, MeasureHeader, Song, Track } from '../model/song';
import { withMeasureDeleted, withMeasureInserted } from './audio-track';
import { relayoutMeasures } from './relayout';
import { insertAt } from './song-paths';
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

/** A measure holding only rests in its first voice, with the neighbour's clef and key. */
export function restMeasure(track: Track, neighbourIndex: number, header: MeasureHeader, headerIndex: number): Measure {
  const neighbour = track.measures[neighbourIndex];
  const voiceCount = voiceCountNear(track, neighbourIndex);
  const rests = restEvents(headerTicks(header)) ?? [];
  const voices = Array.from({ length: voiceCount }, (_, voiceIndex) => (voiceIndex === 0 ? rests : []));
  return {
    headerIndex,
    clef: neighbour?.clef ?? 'treble',
    keySignature: neighbour?.keySignature ?? 0,
    beats: toBeats(header.start, { voiceCount, voices }, []),
  };
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
  if (song.measureHeaders[measureIndex] === undefined || song.measureHeaders.length <= 1) {
    return song;
  }
  const keep = <T>(_item: T, index: number): boolean => index !== measureIndex;
  const deleted = relayoutMeasures(
    song,
    song.measureHeaders.filter(keep),
    song.tracks.map((track) => track.measures.filter(keep)),
  );
  return deleted.audioTrack === undefined ? deleted : { ...deleted, audioTrack: withMeasureDeleted(deleted.audioTrack, measureIndex) };
}
