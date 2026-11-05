import { DEFAULT_STYLESHEET, type Measure, type TextStyle, type Track, isSungBeat, lyricsSyllables } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { TextCommand } from './draw';
import { textWidth } from './symbols/shapes';
import { styleText, styledSize } from './text-styles';

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

/** Indexes of the measure's beats that have notes in any voice: each takes one syllable (gp-core's isSungBeat, TuxGuitar's TGLyricImpl). */
export function sungBeats(measure: Measure | undefined): readonly number[] {
  return (measure?.beats ?? []).flatMap((beat, index) => (isSungBeat(beat) ? [index] : []));
}

/** Each of the track's bars' syllables, kept per track (an edit makes a new track). */
const TRACK_SYLLABLES = new WeakMap<Track, readonly (readonly PlacedSyllable[])[]>();

/** The syllables of every bar of the track, by bar index, from the lyrics' first bar on, in one pass. */
function trackSyllables(track: Track): readonly (readonly PlacedSyllable[])[] {
  const kept = TRACK_SYLLABLES.get(track);
  if (kept !== undefined) {
    return kept;
  }
  // Guitar Pro's syllables: spaces and line breaks, hyphens, "+" (gp-core's lyricsSyllables).
  const tokens = track.lyrics === undefined ? [] : lyricsSyllables(track.lyrics.text);
  const firstIndex = Math.max(0, (track.lyrics?.from ?? 1) - 1);
  let sung = 0;
  const bars = track.measures.map((measure, measureIndex): readonly PlacedSyllable[] => {
    if (measureIndex < firstIndex || sung >= tokens.length) {
      return [];
    }
    const placed = sungBeats(measure).flatMap((beatIndex, order) => {
      const text = tokens[sung + order]?.trim() ?? '';
      return text === '' ? [] : [{ beatIndex, text }];
    });
    sung += sungBeats(measure).length;
    return placed;
  });
  TRACK_SYLLABLES.set(track, bars);
  return bars;
}

/** The syllables sung in a measure of the track, from the lyrics' first bar on; a blank syllable leaves its note bare. */
export function measureSyllables(track: Track, measureIndex: number): readonly PlacedSyllable[] {
  return trackSyllables(track)[measureIndex] ?? [];
}

/** The bars of each track's lyrics that have a syllable to show, kept per track (an edit makes a new track). */
const SUNG_BARS = new WeakMap<Track, ReadonlySet<number>>();

/** The indexes of the track's bars with a syllable to show (as `measureSyllables` places them). */
export function barsWithSyllables(track: Track): ReadonlySet<number> {
  const kept = SUNG_BARS.get(track);
  if (kept !== undefined) {
    return kept;
  }
  const bars = new Set(trackSyllables(track).flatMap((syllables, measureIndex) => (syllables.length === 0 ? [] : [measureIndex])));
  SUNG_BARS.set(track, bars);
  return bars;
}

/** True when both tracks sing the same syllables on the same beats of a bar (a cached bar layout still holds). */
export function hasSameSyllables(previous: Track | undefined, track: Track | undefined, measureIndex: number): boolean {
  const before = previous === undefined ? [] : measureSyllables(previous, measureIndex);
  const after = track === undefined ? [] : measureSyllables(track, measureIndex);
  return before.length === after.length && before.every((syllable, i) => syllable.beatIndex === after[i]?.beatIndex && syllable.text === after[i]?.text);
}

/** Room around a syllable, so the words under neighbouring beats stay apart. */
const SYLLABLE_GAP = 4;

/** Room a beat needs for its syllable at the stylesheet's lyrics `style`, centred under it (0 without one). */
export function lyricsBeatWidth(track: Track | undefined, measureIndex: number, beatIndex: number, style: TextStyle = DEFAULT_STYLESHEET.texts.lyrics): number {
  const syllable = track?.lyrics === undefined ? undefined : measureSyllables(track, measureIndex).find((placed) => placed.beatIndex === beatIndex);
  return syllable === undefined ? 0 : textWidth(syllable.text, styledSize(LYRICS.size, style, DEFAULT_STYLESHEET.texts.lyrics)) + SYLLABLE_GAP;
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
