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

/** The lyrics' first bar (1-based) moved with the music when they start in the moved bars. */
function movedLyrics(lyrics: Lyrics | undefined, measureIndex: number, step: 1 | -1): Lyrics | undefined {
  const firstIndex = lyrics === undefined ? -1 : lyrics.from - 1;
  const isMoved = step > 0 ? firstIndex >= measureIndex : firstIndex > measureIndex;
  return lyrics === undefined || !isMoved ? lyrics : { ...lyrics, from: lyrics.from + step };
}

/** Which way the track's music moved: one bar later (an inserted bar) or earlier (a deleted one), from `measureIndex`. */
interface MusicMove {
  readonly measureIndex: number;
  readonly step: 1 | -1;
}

/** The song with the track's measures (and its lyrics' first bar) replaced, and the ties into the moved music checked. */
function withTrackMusic(song: Song, trackIndex: number, track: Track, measures: readonly Measure[], { measureIndex, step }: MusicMove): Song {
  const lyrics = movedLyrics(track.lyrics, measureIndex, step);
  const moved: Track = { ...track, measures, ...(lyrics === undefined ? {} : { lyrics }) };
  return untieAtBarStart({ ...song, tracks: replaceAt(song.tracks, trackIndex, moved) }, trackIndex, step > 0 ? measureIndex + 1 : measureIndex);
}

function isBarOf(song: Song, track: Track | undefined, measureIndex: number): track is Track {
  return track !== undefined && Number.isInteger(measureIndex) && measureIndex >= 0 && measureIndex < song.measureHeaders.length && measureIndex < track.measures.length;
}

/**
 * New song where the track's bars from `measureIndex` move one bar later and the track rests in that bar, as if a bar
 * were inserted in this track alone: the song gets one more bar at the end (a copy of the last one's time signature
 * and tempo, without repeats or marker; rests in the other tracks, which are otherwise untouched). Moved bars are
 * fitted to their new bars (moveMusic); a tie into the moved music is undone. Same song for a track or bar it lacks.
 */
export function insertTrackMeasure(song: Song, trackIndex: number, measureIndex: number): Song {
  const track = song.tracks[trackIndex];
  if (!isBarOf(song, track, measureIndex)) {
    return song;
  }
  const longer = insertMeasure(song, song.measureHeaders.length - 1, 'after');
  const slots = longer.tracks[trackIndex]?.measures ?? [];
  const measures = slots.map((slot, index) => {
    const header = longer.measureHeaders[index];
    const music = track.measures[index - 1];
    const from = song.measureHeaders[index - 1];
    if (index < measureIndex || header === undefined) {
      return slot;
    }
    return index === measureIndex || music === undefined || from === undefined ? restMeasure(track, measureIndex, header, index) : moveMusic(music, from, header, index, slot.keySignature);
  });
  return withTrackMusic(longer, trackIndex, track, measures, { measureIndex, step: 1 });
}

/**
 * New song without the track's bar at `measureIndex`: its later bars move one bar earlier (fitted as insertTrackMeasure
 * fits them) and its last bar becomes rests; the song keeps its bars and the other tracks are untouched. A tie into
 * the moved music that no longer continues its note is undone. Same song for a track or bar it lacks.
 */
export function deleteTrackMeasure(song: Song, trackIndex: number, measureIndex: number): Song {
  const track = song.tracks[trackIndex];
  if (!isBarOf(song, track, measureIndex)) {
    return song;
  }
  const lastIndex = song.measureHeaders.length - 1;
  const measures = track.measures.map((slot, index) => {
    const header = song.measureHeaders[index];
    const music = track.measures[index + 1];
    const from = song.measureHeaders[index + 1];
    if (index < measureIndex || header === undefined) {
      return slot;
    }
    return music === undefined || from === undefined ? restMeasure(track, lastIndex, header, index) : moveMusic(music, from, header, index, slot.keySignature);
  });
  return withTrackMusic(song, trackIndex, track, measures, { measureIndex, step: -1 });
}
