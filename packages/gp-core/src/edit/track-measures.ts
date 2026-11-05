// A bar inserted into or deleted from one track only (no TuxGuitar or Guitar Pro counterpart: their bars, the measure
// headers, belong to every track). The track's music moves one bar later or earlier along the song's bars; every
// header — time signature, tempo, key, repeats, marker — stays on its bar.
import { MAX_VOICES, headerTicks } from '../model/defaults';
import type { Beat, Lyrics, Measure, MeasureHeader, Song, Track } from '../model/song';
import type { StringAddress } from './addresses';
import { fitMeasure } from './measure-headers';
import { insertMeasure, restMeasure } from './measures';
import { moveMeasure } from './relayout';
import { replaceAt, updateNote } from './song-paths';
import { previousNoteForTie } from './ties';

/**
 * The music of `measure`, laid out against `from`, as measure `headerIndex` in the bar of `to`, with that bar's key: its
 * clef, pedal marks and beats go with it. A bar of another length fits it as a time signature change does (rests to a
 * longer bar line, its free rests shortened for a shorter one); notes that would start past a shorter bar line stay
 * where they are, the bar over-full, as Guitar Pro shows it.
 */
function moveMusic(measure: Measure, from: MeasureHeader, to: MeasureHeader, headerIndex: number, keySignature: number): Measure {
  const length = headerTicks(to);
  const fitted = measure.beats.length === 0 || headerTicks(from) === length ? measure : (fitMeasure(measure, from, length) ?? measure);
  return { ...moveMeasure(fitted, headerIndex, to.start - from.start), keySignature };
}

/** Each voice's first event in the bar: where a tie from the bar before begins. */
function firstEvents(beats: readonly Beat[]): readonly { readonly beatIndex: number; readonly voiceIndex: number }[] {
  return Array.from({ length: MAX_VOICES }, (_, voiceIndex) => ({ voiceIndex, beatIndex: beats.findIndex((beat) => beat.voices[voiceIndex]?.isEmpty === false) })).filter(
    (event) => event.beatIndex >= 0,
  );
}

/**
 * The song with the ties into the track's bar undone where the bar before no longer ends on the note they continue: no
 * note on their string, or another fret.
 */
function untieAtBarStart(song: Song, trackIndex: number, measureIndex: number): Song {
  const beats = song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  const addresses = firstEvents(beats).flatMap(({ beatIndex, voiceIndex }): StringAddress[] =>
    (beats[beatIndex]?.voices[voiceIndex]?.notes ?? []).filter((note) => note.isTied).map((note) => ({ trackIndex, measureIndex, beatIndex, voiceIndex, string: note.string })),
  );
  return addresses.reduce((current, at) => {
    const tiedFret = beats[at.beatIndex]?.voices[at.voiceIndex]?.notes.find((note) => note.string === at.string)?.fret;
    return previousNoteForTie(current, at)?.fret === tiedFret ? current : updateNote(current, at, (note) => ({ ...note, isTied: false }));
  }, song);
}

/** How the track's music moved: `bars` bars later (inserted, > 0) or earlier (deleted, < 0), from `measureIndex`. */
interface MusicMove {
  readonly measureIndex: number;
  readonly bars: number;
}

/** The lyrics' first bar (1-based) moved with the music; lyrics that started in deleted bars start where they were. */
function movedLyrics(lyrics: Lyrics | undefined, { measureIndex, bars }: MusicMove): Lyrics | undefined {
  const firstIndex = lyrics === undefined ? -1 : lyrics.from - 1;
  if (lyrics === undefined || firstIndex < measureIndex) {
    return lyrics;
  }
  const isAfterDeleted = bars > 0 || firstIndex > measureIndex - bars - 1;
  return isAfterDeleted ? { ...lyrics, from: lyrics.from + bars } : { ...lyrics, from: measureIndex + 1 };
}

/** The song with the track's measures (and its lyrics' first bar) replaced, and the ties into the moved music checked. */
function withTrackMusic(song: Song, trackIndex: number, track: Track, measures: readonly Measure[], move: MusicMove): Song {
  const lyrics = movedLyrics(track.lyrics, move);
  const moved: Track = { ...track, measures, ...(lyrics === undefined ? {} : { lyrics }) };
  const tieCheckIndex = move.bars > 0 ? move.measureIndex + move.bars : move.measureIndex;
  return untieAtBarStart({ ...song, tracks: replaceAt(song.tracks, trackIndex, moved) }, trackIndex, tieCheckIndex);
}

/** A beat's own keys that say nothing but "a rest here". */
const PLAIN_BEAT_KEYS: ReadonlySet<string> = new Set(['start', 'voices', 'stroke', 'pickStroke']);

/** True for a beat that shows more than rests: notes, a stroke, a chord, a text, an annotation, any mark. */
function isMarkedBeat(beat: Beat): boolean {
  const hasMarks = Object.entries(beat).some(([key, value]) => value !== undefined && !PLAIN_BEAT_KEYS.has(key));
  return hasMarks || beat.stroke.direction !== 'none' || beat.pickStroke !== 'none' || beat.voices.some((voice) => voice.notes.length > 0);
}

/** What a bar shows beyond its rests, whatever rests fill it: its clef, pedal marks and marked beats by place in the bar. */
function barContent(measure: Measure | undefined, header: MeasureHeader | undefined): string {
  const start = header?.start ?? 0;
  const beats = (measure?.beats ?? []).filter(isMarkedBeat).map((beat) => ({ ...beat, start: beat.start - start }));
  return JSON.stringify({ clef: measure?.clef, pedals: measure?.pedals ?? [], beats });
}

function isBarOf(song: Song, track: Track | undefined, measureIndex: number): track is Track {
  return track !== undefined && Number.isInteger(measureIndex) && measureIndex >= 0 && measureIndex < song.measureHeaders.length && measureIndex < track.measures.length;
}

/**
 * New song where the track's bars from `measureIndex` (`'after'`: from the bar after it) move one bar later and the
 * track rests in that bar, as if a bar were inserted in this track alone: the song gets one more bar at the end (a copy
 * of the last one's time signature and tempo, without repeats or marker; rests in the other tracks, which are otherwise
 * untouched). The bar of rests takes the clef of the bar at `measureIndex` and the key of its own bar. Moved bars are
 * fitted to their new bars (moveMusic); a tie into the moved music is undone. Same song for a track or bar it lacks.
 */
export function insertTrackMeasure(song: Song, trackIndex: number, measureIndex: number, position: 'before' | 'after' = 'before'): Song {
  const track = song.tracks[trackIndex];
  if (!isBarOf(song, track, measureIndex)) {
    return song;
  }
  const insertIndex = position === 'before' ? measureIndex : measureIndex + 1;
  const longer = insertMeasure(song, song.measureHeaders.length - 1, 'after');
  const slots = longer.tracks[trackIndex]?.measures ?? [];
  const measures = slots.map((slot, index) => {
    const header = longer.measureHeaders[index];
    const music = track.measures[index - 1];
    const from = song.measureHeaders[index - 1];
    if (index < insertIndex || header === undefined) {
      return slot;
    }
    return index === insertIndex || music === undefined || from === undefined
      ? { ...restMeasure(track, measureIndex, header, index), keySignature: slot.keySignature }
      : moveMusic(music, from, header, index, slot.keySignature);
  });
  return withTrackMusic(longer, trackIndex, track, measures, { measureIndex: insertIndex, bars: 1 });
}

/**
 * New song without the track's bars from `firstIndex` to `lastIndex` (inclusive, either order; the selection): its later
 * bars move that many bars earlier (fitted as insertTrackMeasure fits them) and its last bars become rests; the song
 * keeps its bars and the other tracks are untouched. A tie into the moved music that no longer continues its note is
 * undone. Same song for a track or bar it lacks, and when nothing would change: from the run on, the track shows only
 * rests (whatever rests fill its bars).
 */
export function deleteTrackMeasures(song: Song, trackIndex: number, firstIndex: number, lastIndex: number): Song {
  const track = song.tracks[trackIndex];
  const first = Math.min(firstIndex, lastIndex);
  const count = Math.abs(lastIndex - firstIndex) + 1;
  if (!isBarOf(song, track, first) || !isBarOf(song, track, first + count - 1)) {
    return song;
  }
  const finalIndex = song.measureHeaders.length - 1;
  const headers = song.measureHeaders;
  const measures = track.measures.map((slot, index) => {
    const header = headers[index];
    const music = track.measures[index + count];
    const from = headers[index + count];
    if (index < first || header === undefined) {
      return slot;
    }
    return music === undefined || from === undefined ? { ...restMeasure(track, finalIndex, header, index), keySignature: slot.keySignature } : moveMusic(music, from, header, index, slot.keySignature);
  });
  const isUnchanged = measures.every((measure, index) => index < first || barContent(measure, headers[index]) === barContent(track.measures[index], headers[index]));
  return isUnchanged ? song : withTrackMusic(song, trackIndex, track, measures, { measureIndex: first, bars: -count });
}

/** deleteTrackMeasures for the one bar at `measureIndex`. */
export function deleteTrackMeasure(song: Song, trackIndex: number, measureIndex: number): Song {
  return deleteTrackMeasures(song, trackIndex, measureIndex, measureIndex);
}
