import { type Beat, type Chord, DEFAULT_STYLESHEET, type Measure, type TextStyle, chordLabel, hasChordDiagram } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import { CHORD_DIAGRAM, diagramFirstFret, diagramWidth, engraveChordDiagram } from './chord-diagram';
import type { DrawCommand } from './draw';
import { styleText } from './text-styles';

/** What the score shows of its chords (Guitar Pro shows both): a per-score setting of the track inspector. */
export interface ChordDisplay {
  readonly showsNames: boolean;
  readonly showsDiagrams: boolean;
}

export const DEFAULT_CHORD_DISPLAY: ChordDisplay = { showsNames: true, showsDiagrams: true };

export const CHORD_NAME = {
  size: 11,
  /** Width a character takes, as a share of the font size (the system font, bold). */
  charWidth: 0.62,
  /** Room between two chords on neighbouring beats. */
  padding: 8,
  /** The first-fret number beside a diagram. */
  fretLabelWidth: 8,
} as const;

/** The rows of the chord band above the staves, the same in every row of a track (`rowGeometry`). */
export interface ChordBands {
  /** A chord of the track has a name, and names are shown. */
  readonly hasChordNames: boolean;
  /** A chord of the track plays a string, and diagrams are shown. */
  readonly hasChordDiagrams: boolean;
}

const chordsOf = (measures: readonly Measure[]): readonly Chord[] =>
  measures.flatMap((measure) => measure.beats.flatMap((beat) => (beat.chord === undefined ? [] : [beat.chord])));

/** Whether a beat of the track has a chord. */
export function hasChords(measures: readonly Measure[]): boolean {
  return measures.some((measure) => measure.beats.some((beat) => beat.chord !== undefined));
}

/** The chord rows the track's rows make room for: none without chords, or with what they have hidden. */
export function chordBands(measures: readonly Measure[], display: ChordDisplay): ChordBands {
  const chords = chordsOf(measures);
  return {
    hasChordNames: display.showsNames && chords.some((chord) => chordLabel(chord) !== ''),
    hasChordDiagrams: display.showsDiagrams && chords.some(hasChordDiagram),
  };
}

export interface ChordsInput {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** Centre of the names line (`RowGeometry.chordNamesY`); no names when undefined. */
  readonly namesY?: number;
  /** Top of the diagrams (`RowGeometry.chordDiagramsTop`); no diagrams when undefined. */
  readonly diagramsTop?: number;
  readonly palette: Palette;
  /** The stylesheet's chord name font. */
  readonly style?: TextStyle;
}

/** The measure's chords, each centred over its beat (measure-local coordinates): the name, and the diagram under it. */
export function engraveChords({ measure, layout, namesY, diagramsTop, palette, style = DEFAULT_STYLESHEET.texts.chordName }: ChordsInput): DrawCommand[] {
  return layout.beats.flatMap(({ beatIndex, x }): DrawCommand[] => {
    const chord = measure.beats[beatIndex]?.chord;
    if (chord === undefined) {
      return [];
    }
    const label = chordLabel(chord);
    const name: DrawCommand[] =
      namesY !== undefined && label !== ''
        ? [styleText({ kind: 'text', x, y: namesY, text: label, size: CHORD_NAME.size, color: palette.text, font: 'ui', align: 'center', bold: true }, style, DEFAULT_STYLESHEET.texts.chordName)]
        : [];
    const diagram = diagramsTop !== undefined && hasChordDiagram(chord) ? engraveChordDiagram(chord, x, diagramsTop, palette.text) : [];
    return [...name, ...diagram];
  });
}

/** Room a beat needs for its chord's name (at the stylesheet's `nameSize`) and diagram, so neighbours do not overlap (0 without a chord). */
export function chordBeatWidth(beat: Beat, display: ChordDisplay, nameSize: number = CHORD_NAME.size): number {
  const chord = beat.chord;
  if (chord === undefined) {
    return 0;
  }
  const label = chordLabel(chord);
  const nameWidth = display.showsNames && label !== '' ? label.length * nameSize * CHORD_NAME.charWidth : 0;
  // Centred on the beat: a first-fret number on the left takes room on both sides.
  const labelWidth = diagramFirstFret(chord) > 1 ? 2 * CHORD_NAME.fretLabelWidth : 0;
  const diagram = display.showsDiagrams && hasChordDiagram(chord) ? diagramWidth(chord.frets.length) + 2 * CHORD_DIAGRAM.dotRadius + labelWidth : 0;
  const width = Math.max(nameWidth, diagram);
  return width === 0 ? 0 : width + CHORD_NAME.padding;
}
