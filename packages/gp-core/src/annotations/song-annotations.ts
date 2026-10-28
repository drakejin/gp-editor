// A song's annotations as JSON of our own (no TuxGuitar counterpart): the .gp writer stores them as a zip entry
// (GP7_ANNOTATIONS_ENTRY) that Guitar Pro ignores. GP3/GP4/GP5 cannot hold them; MusicXML writes them as boxed words.
import { ownValue, parseJsonText } from '../effects/effects-json';
import { songAnnotations } from '../edit/annotations';
import type { Annotation, Beat, Measure, Song, Track } from '../model/song';
import { isRawObject } from '../transcription/parse-values';
import { MAX_ANNOTATION_LENGTH, isAnnotationPlacement, toAnnotation } from './annotation-text';

export const SONG_ANNOTATIONS_VERSION = 1;
/** Entries read from a file at most (a file is untrusted: what it costs to read stays bounded). */
export const MAX_FILE_ANNOTATIONS = 10_000;

/**
 * `{ version, annotations: [{ trackIndex, measureIndex, offset, text, placement }] }` — `offset` is where the beat
 * starts in its bar, in ticks (QUARTER_TIME per quarter note), which does not depend on how a reader splits the bar into
 * beats; undefined when the song has no annotation.
 */
export function songAnnotationsToJson(song: Song): string | undefined {
  const annotations = songAnnotations(song).map(({ trackIndex, measureIndex, beatIndex, annotation }) => {
    const header = song.measureHeaders[measureIndex];
    const beat = song.tracks[trackIndex]?.measures[measureIndex]?.beats[beatIndex];
    return { trackIndex, measureIndex, offset: (beat?.start ?? 0) - (header?.start ?? 0), text: annotation.text, placement: annotation.placement };
  });
  return annotations.length === 0 ? undefined : JSON.stringify({ version: SONG_ANNOTATIONS_VERSION, annotations });
}

/** A text read from a file is cut to this before it is normalized (normalizing keeps MAX_ANNOTATION_LENGTH of it). */
const MAX_READ_TEXT = MAX_ANNOTATION_LENGTH * 4;

/** One entry checked: whole indexes in range, a whole non-negative offset, a text with something to show; undefined otherwise. */
interface ReadEntry {
  readonly trackIndex: number;
  readonly measureIndex: number;
  readonly offset: number;
  readonly annotation: Annotation;
}

function isIndexIn(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
}

function readEntry(song: Song, entry: unknown): ReadEntry | undefined {
  if (!isRawObject(entry)) {
    return undefined;
  }
  const [trackIndex, measureIndex, offset, text, placement] = ['trackIndex', 'measureIndex', 'offset', 'text', 'placement'].map((key) => ownValue(entry, key));
  if (!isIndexIn(trackIndex, song.tracks.length) || !isIndexIn(measureIndex, song.measureHeaders.length) || typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || typeof text !== 'string') {
    return undefined;
  }
  const annotation = toAnnotation(text.slice(0, MAX_READ_TEXT), isAnnotationPlacement(placement) ? placement : 'above');
  return annotation === undefined ? undefined : { trackIndex, measureIndex, offset, annotation };
}

/** The beat starting at `tick`, else the one sounding there (the last one starting before it); undefined before the first. */
function beatIndexAt(beats: readonly Beat[], tick: number): number | undefined {
  let found: number | undefined;
  for (let index = 0; index < beats.length && (beats[index]?.start ?? Number.POSITIVE_INFINITY) <= tick; index++) {
    found = index;
  }
  return found;
}

/** track → bar → beat → annotation. */
type PlacedAnnotations = Map<number, Map<number, Map<number, Annotation>>>;

/** The track with its measures' beats annotated as `byMeasure` says (bar → beat → annotation). */
function annotatedTrack(track: Track, byMeasure: ReadonlyMap<number, ReadonlyMap<number, Annotation>>): Track {
  const measures = track.measures.map((measure, measureIndex): Measure => {
    const byBeat = byMeasure.get(measureIndex);
    return byBeat === undefined ? measure : { ...measure, beats: measure.beats.map((beat, beatIndex) => {
      const annotation = byBeat.get(beatIndex);
      return annotation === undefined ? beat : { ...beat, annotation };
    }) };
  });
  return { ...track, measures };
}

/** Each entry's annotation on its beat, the first one for a beat kept; entries naming nothing in the song skipped. */
function placeEntries(song: Song, entries: readonly unknown[]): PlacedAnnotations {
  const placed: PlacedAnnotations = new Map();
  for (const entry of entries.slice(0, MAX_FILE_ANNOTATIONS)) {
    const read = readEntry(song, entry);
    const beats = read === undefined ? undefined : song.tracks[read.trackIndex]?.measures[read.measureIndex]?.beats;
    const header = read === undefined ? undefined : song.measureHeaders[read.measureIndex];
    const beatIndex = read === undefined || beats === undefined || header === undefined ? undefined : beatIndexAt(beats, header.start + read.offset);
    if (read === undefined || beatIndex === undefined) {
      continue;
    }
    const byMeasure = placed.get(read.trackIndex) ?? new Map<number, Map<number, Annotation>>();
    const byBeat = byMeasure.get(read.measureIndex) ?? new Map<number, Annotation>();
    if (!byBeat.has(beatIndex)) {
      byBeat.set(beatIndex, read.annotation);
    }
    byMeasure.set(read.measureIndex, byBeat);
    placed.set(read.trackIndex, byMeasure);
  }
  return placed;
}

/**
 * The song with the annotations `text` (songAnnotationsToJson's output) holds, checked like any untrusted input: at most
 * MAX_FILE_ANNOTATIONS entries, own properties only, entries naming no track, bar or beat of the song skipped, texts
 * normalized (annotations/annotation-text.ts); the first entry for a beat wins. Text of another version, or that is not
 * such JSON, leaves the song as it is.
 */
export function readSongAnnotations(song: Song, text: string): Song {
  const raw = parseJsonText(text);
  const entries = isRawObject(raw) && ownValue(raw, 'version') === SONG_ANNOTATIONS_VERSION ? ownValue(raw, 'annotations') : undefined;
  const placed: PlacedAnnotations = Array.isArray(entries) ? placeEntries(song, entries) : new Map();
  return placed.size === 0 ? song : { ...song, tracks: song.tracks.map((track, trackIndex) => {
    const byMeasure = placed.get(trackIndex);
    return byMeasure === undefined ? track : annotatedTrack(track, byMeasure);
  }) };
}
