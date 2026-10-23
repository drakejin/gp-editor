import type { Measure, Track } from '../model/song';
import type { TranscribedMeasure, TranscriptionPage } from './types';
import { countOf } from './wording';

/** Guitar Pro's lyrics separate syllables with single spaces: two in a row leave a note without one. */
const SYLLABLE_SEPARATOR = ' ';

/** The track the lyrics are sung on: the first page that names it, else the first track. */
export function resolveLyricsTrack(pages: readonly TranscriptionPage[]): number {
  return pages.map((page) => page.song?.lyricsTrack).find((track) => track !== undefined) ?? 0;
}

/** Beats with notes in any voice: each takes one syllable, as in Guitar Pro (TuxGuitar's TGLyricImpl). */
function sungBeatCount(measure: Measure | undefined): number {
  return measure?.beats.filter((beat) => beat.voices.some((voice) => voice.notes.length > 0)).length ?? 0;
}

interface MeasureSyllables {
  readonly syllables: readonly string[];
  readonly warning?: string;
}

/** A measure's syllables fitted to its sung beats: missing ones are notes without a syllable, extra ones are left out. */
function fitSyllables(source: TranscribedMeasure, measure: Measure | undefined, barNumber: number): MeasureSyllables {
  const given = source.lyrics ?? [];
  const sung = sungBeatCount(measure);
  const syllables = Array.from({ length: sung }, (_, index) => given[index] ?? '');
  const extra = given.length - sung;
  return extra > 0 ? { syllables, warning: `Bar ${barNumber}: ${countOf(given.length, 'syllable')} for ${countOf(sung, 'note')}; the last ${extra} was left out` } : { syllables };
}

export interface TracksWithLyrics {
  readonly tracks: readonly Track[];
  readonly warnings: readonly string[];
}

/**
 * Gives the lyrics track the transcribed syllables, from bar 1, one per sung beat; the tracks stay as they were when
 * no measure has lyrics.
 */
export function withLyrics(tracks: readonly Track[], measures: readonly TranscribedMeasure[], lyricsTrack: number): TracksWithLyrics {
  const track = tracks[lyricsTrack];
  if (track === undefined || measures.every((measure) => measure.lyrics === undefined)) {
    return { tracks, warnings: [] };
  }
  const fitted = measures.map((source, index) => fitSyllables(source, track.measures[index], index + 1));
  const text = fitted.flatMap((measure) => measure.syllables).join(SYLLABLE_SEPARATOR).trimEnd();
  const warnings = fitted.flatMap((measure) => measure.warning ?? []);
  if (text.trim() === '') {
    return { tracks, warnings };
  }
  const sung: Track = { ...track, lyrics: { from: 1, text } };
  return { tracks: tracks.map((other, index) => (index === lyricsTrack ? sung : other)), warnings };
}
