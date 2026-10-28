// A beat's annotation (the app's own, no TuxGuitar counterpart): set, changed, taken away or moved to another beat,
// each edit returning a new song. Kept on the beat, it goes wherever the beat goes: bars and beats inserted or deleted
// before it, track edits, cut and paste, voice moves (edit/timeline.ts carries it with the beat's other marks).
import { isSameAnnotation, toAnnotation } from '../annotations/annotation-text';
import type { Annotation, Beat, Measure, Song, Track } from '../model/song';
import type { BeatAddress } from './addresses';
import { fillEmptyMeasure } from './measures';
import { updateBeat } from './song-paths';

/** An annotation and the beat it is on. */
export interface PlacedAnnotation {
  readonly trackIndex: number;
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly annotation: Annotation;
}

function withoutAnnotation(beat: Beat): Beat {
  const { annotation: _removed, ...rest } = beat;
  return rest;
}

/** The beat with `annotation` (none takes it away); the same beat when it already shows that. */
function annotate(beat: Beat, annotation: Annotation | undefined): Beat {
  if (isSameAnnotation(beat.annotation, annotation)) {
    return beat;
  }
  return annotation === undefined ? withoutAnnotation(beat) : { ...beat, annotation };
}

/** The beat's annotation, if the address names a beat. */
function annotationAt(song: Song, at: BeatAddress): Annotation | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.annotation;
}

function hasBeat(song: Song, at: BeatAddress): boolean {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex] !== undefined;
}

/**
 * New song with the annotation of the addressed beat set (its text normalized, annotations/annotation-text.ts), changed,
 * or taken away (undefined, or a text with nothing to show). Beat 0 of a bar without beats (a track resting there) is
 * the rest drawn there: the bar gets its rests first. Same song when nothing changes or there is no such beat.
 */
export function setBeatAnnotation(song: Song, at: BeatAddress, annotation: Annotation | undefined): Song {
  const next = annotation === undefined ? undefined : toAnnotation(annotation.text, annotation.placement);
  if (isSameAnnotation(annotationAt(song, at), next)) {
    return song;
  }
  const filled = next !== undefined && at.beatIndex === 0 ? fillEmptyMeasure(song, at.trackIndex, at.measureIndex) : song;
  return updateBeat(filled, at, (beat) => annotate(beat, next));
}

/**
 * New song with the annotation of `from` on the beat at `to` instead (any track, bar or beat), as one edit. Same song
 * when `from` has none, `to` is the same beat or no beat, or already has an annotation of its own.
 */
export function moveBeatAnnotation(song: Song, from: BeatAddress, to: BeatAddress): Song {
  const annotation = annotationAt(song, from);
  const isSameBeat = from.trackIndex === to.trackIndex && from.measureIndex === to.measureIndex && from.beatIndex === to.beatIndex;
  if (annotation === undefined || isSameBeat || !hasBeat(song, to) || annotationAt(song, to) !== undefined) {
    return song;
  }
  return updateBeat(updateBeat(song, from, withoutAnnotation), to, (beat) => ({ ...beat, annotation }));
}

/** Every annotation of the song with its beat, track by track, bar by bar, beat by beat. */
export function songAnnotations(song: Song): readonly PlacedAnnotation[] {
  return song.tracks.flatMap((track, trackIndex) =>
    track.measures.flatMap((measure, measureIndex) =>
      measure.beats.flatMap((beat, beatIndex) => (beat.annotation === undefined ? [] : [{ trackIndex, measureIndex, beatIndex, annotation: beat.annotation }])),
    ),
  );
}

export function hasAnnotations(song: Song): boolean {
  return song.tracks.some((track) => track.measures.some((measure) => measure.beats.some((beat) => beat.annotation !== undefined)));
}

function measureWithoutAnnotations(measure: Measure): Measure {
  return measure.beats.some((beat) => beat.annotation !== undefined) ? { ...measure, beats: measure.beats.map((beat) => (beat.annotation === undefined ? beat : withoutAnnotation(beat))) } : measure;
}

function trackWithoutAnnotations(track: Track): Track {
  const measures = track.measures.map(measureWithoutAnnotations);
  return measures.every((measure, i) => measure === track.measures[i]) ? track : { ...track, measures };
}

/** The song with no annotation (an export that leaves them out); the same song when it has none. */
export function withoutAnnotations(song: Song): Song {
  return hasAnnotations(song) ? { ...song, tracks: song.tracks.map(trackWithoutAnnotations) } : song;
}
