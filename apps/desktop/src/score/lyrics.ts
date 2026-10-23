import type { Measure, Track } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { TextCommand } from './draw';

/** The lyrics line under the staff. */
export const LYRICS = { size: 11 } as const;

/** One sung syllable, under its beat. */
export interface PlacedSyllable {
  readonly beatIndex: number;
  readonly text: string;
}

/** Whether the track has lyrics to show: only then do its rows make room for them (`rowGeometry`). */
export function hasLyrics(track: Track | undefined): boolean {
  return (track?.lyrics?.text.trim() ?? '') !== '';
}

/** Guitar Pro's syllables: line breaks count as spaces, and every single space separates two (TuxGuitar's TGLyric). */
function syllables(text: string): readonly string[] {
  return text.replace(/\r\n|\r|\n/g, ' ').split(' ');
}

/** Indexes of the measure's beats that have notes in any voice: each takes one syllable (TuxGuitar's TGLyricImpl). */
function sungBeats(measure: Measure | undefined): readonly number[] {
  return (measure?.beats ?? []).flatMap((beat, index) => (beat.voices.some((voice) => voice.notes.length > 0) ? [index] : []));
}

/** The syllables sung in a measure of the track, from the lyrics' first bar on; a blank syllable leaves its note bare. */
export function measureSyllables(track: Track, measureIndex: number): readonly PlacedSyllable[] {
  const lyrics = track.lyrics;
  const firstIndex = (lyrics?.from ?? 1) - 1;
  if (lyrics === undefined || measureIndex < firstIndex) {
    return [];
  }
  const tokens = syllables(lyrics.text);
  const before = track.measures.slice(Math.max(0, firstIndex), measureIndex).reduce((count, measure) => count + sungBeats(measure).length, 0);
  return sungBeats(track.measures[measureIndex]).flatMap((beatIndex, order) => {
    const text = tokens[before + order]?.trim() ?? '';
    return text === '' ? [] : [{ beatIndex, text }];
  });
}

export interface LyricsInput {
  readonly track: Track;
  readonly layout: MeasureLayout;
  /** Centre of the lyrics line. */
  readonly y: number;
  readonly palette: Palette;
}

/** The measure's syllables, each centred under its beat (measure-local coordinates). */
export function engraveLyrics({ track, layout, y, palette }: LyricsInput): TextCommand[] {
  return measureSyllables(track, layout.measureIndex).flatMap((syllable): TextCommand[] => {
    const beat = layout.beats.find((candidate) => candidate.beatIndex === syllable.beatIndex);
    return beat === undefined ? [] : [{ kind: 'text', x: beat.x, y, text: syllable.text, size: LYRICS.size, color: palette.text, font: 'ui', align: 'center' }];
  });
}
