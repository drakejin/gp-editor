import { DEFAULT_STYLESHEET, type Measure, type Stylesheet, type TextStyle } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { TextCommand } from './draw';
import { ROW } from './geometry';
import { styleText } from './text-styles';

/** A text line's height for its font size: a line of lyrics or free text, and the chord names' line. */
const LINE_HEIGHT = { text: 1.6, chordNames: 1.45 } as const;
/** A free text starts a little left of its beat's centre, over the fret. */
const FREE_TEXT_INSET = 4;

/** Whether a beat of the track has a free text (Guitar Pro's text above the beat): only then do its rows make room. */
export function hasFreeTexts(measures: readonly Measure[]): boolean {
  return measures.some((measure) => measure.beats.some((beat) => (beat.text ?? '').trim() !== ''));
}

/** The text lines' heights for the stylesheet's sizes; the default sizes keep the bands the app always had. */
export function textBandHeights(sheet: Stylesheet): { readonly lyricsHeight: number; readonly chordNamesHeight: number; readonly freeTextHeight: number } {
  const { lyrics, chordName, freeText } = sheet.texts;
  return {
    lyricsHeight: Math.max(ROW.lyrics, Math.ceil(lyrics.size * LINE_HEIGHT.text)),
    chordNamesHeight: Math.max(ROW.chordNames, Math.ceil(chordName.size * LINE_HEIGHT.chordNames)),
    freeTextHeight: Math.max(ROW.freeText, Math.ceil(freeText.size * LINE_HEIGHT.text)),
  };
}

export interface FreeTextsInput {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** Centre of the free texts line (`RowGeometry.freeTextY`). */
  readonly y: number;
  readonly palette: Palette;
  readonly style?: TextStyle;
}

/** The measure's free texts, each starting at its beat (measure-local coordinates), in the stylesheet's free text font. */
export function engraveFreeTexts({ measure, layout, y, palette, style = DEFAULT_STYLESHEET.texts.freeText }: FreeTextsInput): TextCommand[] {
  const base = DEFAULT_STYLESHEET.texts.freeText;
  return layout.beats.flatMap(({ beatIndex, x }): TextCommand[] => {
    const text = measure.beats[beatIndex]?.text?.trim() ?? '';
    if (text === '') {
      return [];
    }
    const command: TextCommand = { kind: 'text', x: x - FREE_TEXT_INSET, y, text, size: base.size, color: palette.text, font: 'ui', align: 'left', italic: base.isItalic };
    return [styleText(command, style, base)];
  });
}
