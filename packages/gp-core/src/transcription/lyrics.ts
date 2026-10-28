import type { Measure, Track } from '../model/song';
import type { TranscribedInstrument, TranscribedMeasure, TranscriptionPage } from './types';
import { countOf } from './wording';

/** Guitar Pro's lyrics separate syllables with single spaces: two in a row leave a note without one. */
const SYLLABLE_SEPARATOR = ' ';

/** A track as the lyrics see it: its name, and whether it is a voice or drums. */
export interface LyricsCandidate {
  readonly name: string;
  readonly instrument: TranscribedInstrument;
}

/** Where the lyrics go (none: no track can sing them), and why not where the page said. */
export interface LyricsTrack {
  readonly trackIndex?: number;
  readonly warning?: string;
}

/** The first vocal track, else the first track that is not drums. */
function defaultLyricsTrack(tracks: readonly LyricsCandidate[]): number | undefined {
  const vocals = tracks.findIndex((track) => track.instrument === 'vocals');
  const pitched = tracks.findIndex((track) => track.instrument !== 'drums');
  return vocals >= 0 ? vocals : pitched >= 0 ? pitched : undefined;
}

function trackLabel(tracks: readonly LyricsCandidate[], trackIndex: number): string {
  return `track ${trackIndex + 1} (${tracks[trackIndex]?.name ?? ''})`;
}

/**
 * The track the lyrics are sung on: the one the first page naming one names, else the first vocal track, else the first
 * track that is not drums. A named track the song lacks, or a drum track, is not sung on: the default is, with a warning.
 */
export function resolveLyricsTrack(pages: readonly TranscriptionPage[], tracks: readonly LyricsCandidate[]): LyricsTrack {
  const named = pages.map((page) => page.song?.lyricsTrack).find((track) => track !== undefined);
  const fallback = defaultLyricsTrack(tracks);
  if (named === undefined) {
    return { trackIndex: fallback };
  }
  const track = tracks[named];
  if (track !== undefined && track.instrument !== 'drums') {
    return { trackIndex: named };
  }
  const why = track === undefined ? `track ${named + 1} does not exist` : `${trackLabel(tracks, named)} is a drum track`;
  const where = fallback === undefined ? '' : `; sung on ${trackLabel(tracks, fallback)}`;
  return { trackIndex: fallback, warning: `Lyrics: ${why}${where}` };
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
 * no measure has lyrics, and (with a warning) when no track can sing them.
 */
export function withLyrics(tracks: readonly Track[], measures: readonly TranscribedMeasure[], lyricsTrack: LyricsTrack): TracksWithLyrics {
  if (measures.every((measure) => measure.lyrics === undefined)) {
    return { tracks, warnings: [] };
  }
  const resolution = lyricsTrack.warning === undefined ? [] : [lyricsTrack.warning];
  const { trackIndex } = lyricsTrack;
  const track = trackIndex === undefined ? undefined : tracks[trackIndex];
  if (track === undefined) {
    return { tracks, warnings: [...resolution, 'Lyrics: left out (no track to sing them on)'] };
  }
  const fitted = measures.map((source, index) => fitSyllables(source, track.measures[index], index + 1));
  const text = fitted.flatMap((measure) => measure.syllables).join(SYLLABLE_SEPARATOR).trimEnd();
  const warnings = [...resolution, ...fitted.flatMap((measure) => measure.warning ?? [])];
  if (text.trim() === '') {
    return { tracks, warnings };
  }
  const sung: Track = { ...track, lyrics: { from: 1, text } };
  return { tracks: tracks.map((other, index) => (index === trackIndex ? sung : other)), warnings };
}
