import { DEFAULT_STYLESHEET, type Measure, type TextStyle, type Track, lyricsSyllables } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { TextCommand } from './draw';
import { styleText } from './text-styles';

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

/** Indexes of the measure's beats that have notes in any voice: each takes one syllable (TuxGuitar's TGLyricImpl). */
export function sungBeats(measure: Measure | undefined): readonly number[] {
  return (measure?.beats ?? []).flatMap((beat, index) => (beat.voices.some((voice) => voice.notes.length > 0) ? [index] : []));
}

/** The syllables sung in a measure of the track, from the lyrics' first bar on; a blank syllable leaves its note bare. */
export function measureSyllables(track: Track, measureIndex: number): readonly PlacedSyllable[] {
  const lyrics = track.lyrics;
  const firstIndex = (lyrics?.from ?? 1) - 1;
  if (lyrics === undefined || measureIndex < firstIndex) {
    return [];
  }
  // Guitar Pro's syllables: spaces and line breaks, hyphens, "+" (gp-core's lyricsSyllables).
  const tokens = lyricsSyllables(lyrics.text);
  const before = track.measures.slice(Math.max(0, firstIndex), measureIndex).reduce((count, measure) => count + sungBeats(measure).length, 0);
  return sungBeats(track.measures[measureIndex]).flatMap((beatIndex, order) => {
    const text = tokens[before + order]?.trim() ?? '';
    return text === '' ? [] : [{ beatIndex, text }];
  });
}

/** The bars of each track's lyrics that have a syllable to show, kept per track (an edit makes a new track). */
const SUNG_BARS = new WeakMap<Track, ReadonlySet<number>>();

/** The indexes of the track's bars with a syllable to show (as `measureSyllables` places them), in one pass. */
export function barsWithSyllables(track: Track): ReadonlySet<number> {
  const kept = SUNG_BARS.get(track);
  if (kept !== undefined) {
    return kept;
  }
  const lyrics = track.lyrics;
  const tokens = lyrics === undefined ? [] : lyricsSyllables(lyrics.text);
  const firstIndex = Math.max(0, (lyrics?.from ?? 1) - 1);
  const bars = new Set<number>();
  let sung = 0;
  for (let measureIndex = firstIndex; measureIndex < track.measures.length && sung < tokens.length; measureIndex += 1) {
    const beats = sungBeats(track.measures[measureIndex]).length;
    if (tokens.slice(sung, sung + beats).some((token) => token.trim() !== '')) {
      bars.add(measureIndex);
    }
    sung += beats;
  }
  SUNG_BARS.set(track, bars);
  return bars;
}

export interface LyricsInput {
  readonly track: Track;
  readonly layout: MeasureLayout;
  /** Centre of the lyrics line. */
  readonly y: number;
  readonly palette: Palette;
  /** The stylesheet's lyrics font. */
  readonly style?: TextStyle;
}

/** The measure's syllables, each centred under its beat (measure-local coordinates). */
export function engraveLyrics({ track, layout, y, palette, style = DEFAULT_STYLESHEET.texts.lyrics }: LyricsInput): TextCommand[] {
  return measureSyllables(track, layout.measureIndex).flatMap((syllable): TextCommand[] => {
    const beat = layout.beats.find((candidate) => candidate.beatIndex === syllable.beatIndex);
    const command: TextCommand | undefined = beat === undefined ? undefined : { kind: 'text', x: beat.x, y, text: syllable.text, size: LYRICS.size, color: palette.text, font: 'ui', align: 'center' };
    return command === undefined ? [] : [styleText(command, style, DEFAULT_STYLESHEET.texts.lyrics)];
  });
}
