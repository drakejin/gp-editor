import { NECK_FRETS, type Note, type Track, stringStartFret, trackTuning } from '@gp-editor/core';
import { pitchClassName } from '../lib/pitch';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { SCALE_COLORS, type ScaleHighlight, scaleMarkColor, scaleMarkName } from './scale-marks';

/** Fretboard geometry, in points. */
export const FRETBOARD = {
  frets: NECK_FRETS,
  stringGap: 20,
  /** Room for the fret numbers above the first string. */
  top: 24,
  bottom: 14,
  /** Column left of the nut for the open strings. */
  openWidth: 34,
  padRight: 10,
  noteRadius: 8.5,
} as const;

const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21] as const;
/** Background behind a note name, so the string line does not run through it. */
const NAME_PILL = { width: 17, height: 11 } as const;
const DOUBLE_INLAYS = [12, 24] as const;

export interface FretboardInput {
  readonly track: Track;
  readonly width: number;
  readonly palette: Palette;
  /** Notes sounding now (the playing beat, else the cursor's beat). Frets are relative to the capo, as in the tab. */
  readonly notes: readonly Note[];
  /** String of the editor cursor, outlined at the nut. */
  readonly cursorString?: number;
  /** The Scales panel's scale: its positions are coloured, the roots apart, under the current notes. */
  readonly scale?: ScaleHighlight;
}

export function fretboardHeight(stringCount: number): number {
  return FRETBOARD.top + Math.max(0, stringCount - 1) * FRETBOARD.stringGap + FRETBOARD.bottom;
}

/** Physical fret position of a tab fret: frets in Guitar Pro files count from the capo. */
export function neckFret(track: Track, fret: number): number {
  return fret + track.offset;
}

/** Where a note sits on the neck: neckFret, and a banjo's short 5th string counts from its peg at the 5th fret. */
export function neckPosition(track: Track, string: number, fret: number): number {
  return neckFret(track, fret) + stringStartFret(trackTuning(track), string);
}

/** A 24-fret neck for the track's tuning with every position's note name, the capo and the current notes. */
export function engraveFretboard(input: FretboardInput): DrawCommand[] {
  const { track, palette } = input;
  if (track.isPercussion || track.strings.length === 0) {
    return [];
  }
  const geometry = neckGeometry(input.width, track.strings.length);
  return [
    ...inlays(geometry, palette),
    ...fretLines(geometry, palette),
    ...stringLines(geometry, track, palette),
    ...pegs(geometry, track, palette),
    ...noteNames(geometry, track, palette, input.scale),
    ...capo(geometry, track, palette),
    ...currentNotes(geometry, input),
    ...cursorString(geometry, input),
  ];
}

interface NeckGeometry {
  readonly fretWidth: number;
  readonly nutX: number;
  readonly bottom: number;
  readonly stringCount: number;
}

function neckGeometry(width: number, stringCount: number): NeckGeometry {
  const nutX = FRETBOARD.openWidth;
  const fretWidth = Math.max(18, (width - nutX - FRETBOARD.padRight) / FRETBOARD.frets);
  return { fretWidth, nutX, bottom: stringY(stringCount), stringCount };
}

function stringY(stringNumber: number): number {
  return FRETBOARD.top + (stringNumber - 1) * FRETBOARD.stringGap;
}

/** Centre of a fret position; 0 = open string, left of the nut. */
export function fretX(geometry: { readonly nutX: number; readonly fretWidth: number }, fret: number): number {
  return fret === 0 ? geometry.nutX / 2 : geometry.nutX + (fret - 0.5) * geometry.fretWidth;
}

function inlays(geometry: NeckGeometry, palette: Palette): DrawCommand[] {
  const middle = (FRETBOARD.top + geometry.bottom) / 2;
  const color = `${palette.line}55`;
  const single = SINGLE_INLAYS.map((fret): DrawCommand => ({ kind: 'circle', x: fretX(geometry, fret), y: middle, radius: 5, color }));
  const offset = FRETBOARD.stringGap;
  const double = DOUBLE_INLAYS.flatMap((fret): DrawCommand[] => [
    { kind: 'circle', x: fretX(geometry, fret), y: middle - offset, radius: 5, color },
    { kind: 'circle', x: fretX(geometry, fret), y: middle + offset, radius: 5, color },
  ]);
  return [...single, ...double];
}

function fretLines(geometry: NeckGeometry, palette: Palette): DrawCommand[] {
  return Array.from({ length: FRETBOARD.frets + 1 }, (_, fret): DrawCommand[] => {
    const x = geometry.nutX + fret * geometry.fretWidth;
    const line: DrawCommand = { kind: 'line', x1: x, y1: FRETBOARD.top, x2: x, y2: geometry.bottom, width: fret === 0 ? 4 : 1, color: fret === 0 ? palette.text : palette.line };
    const label: DrawCommand = { kind: 'text', x: fretX(geometry, fret), y: FRETBOARD.top - 15, text: String(fret), size: 9, color: palette.muted, font: 'ui', align: 'center' };
    return [line, label];
  }).flat();
}

function stringLines(geometry: NeckGeometry, track: Track, palette: Palette): DrawCommand[] {
  const right = geometry.nutX + FRETBOARD.frets * geometry.fretWidth;
  const tuning = trackTuning(track);
  return track.strings.map((guitarString) => {
    const y = stringY(guitarString.number);
    const start = stringStartFret(tuning, guitarString.number);
    const x1 = start === 0 ? 0 : fretX(geometry, start);
    return { kind: 'line', x1, y1: y, x2: right, y2: y, width: 1 + (guitarString.number - 1) * 0.3, color: palette.line };
  });
}

/** The tuning peg of a string that starts up the neck (a banjo's 5th string, at the 5th fret), ringed round its open note. */
function pegs(geometry: NeckGeometry, track: Track, palette: Palette): DrawCommand[] {
  const tuning = trackTuning(track);
  return track.strings.flatMap((guitarString): DrawCommand[] => {
    const start = stringStartFret(tuning, guitarString.number);
    return start === 0 ? [] : [{ kind: 'circle', x: fretX(geometry, start), y: stringY(guitarString.number), radius: FRETBOARD.noteRadius, color: palette.text, strokeWidth: 1.5 }];
  });
}

/**
 * Each position's note name sits on its string, on a small pill in the neck's background colour; a string that starts
 * up the neck has none before its peg. A position of the chosen scale sits on a disc of the scale's colour instead.
 */
function noteNames(geometry: NeckGeometry, track: Track, palette: Palette, scale: ScaleHighlight | undefined): DrawCommand[] {
  const tuning = trackTuning(track);
  return track.strings.flatMap((guitarString) => {
    const y = stringY(guitarString.number);
    const start = stringStartFret(tuning, guitarString.number);
    return Array.from({ length: FRETBOARD.frets + 1 - start }, (_, i): DrawCommand[] => {
      const x = fretX(geometry, start + i);
      const isOpen = i === 0;
      const pitch = guitarString.tuning + i;
      const scaleColor = scaleMarkColor(pitch, scale);
      if (scaleColor !== undefined) {
        return [
          { kind: 'circle', x, y, radius: FRETBOARD.noteRadius - 1, color: scaleColor },
          { kind: 'text', x, y, text: scaleMarkName(pitch, scale), size: 7.5, color: SCALE_COLORS.text, font: 'ui', align: 'center', bold: true },
        ];
      }
      return [
        { kind: 'rect', x: x - NAME_PILL.width / 2, y: y - NAME_PILL.height / 2, width: NAME_PILL.width, height: NAME_PILL.height, color: palette.sidebar, radius: NAME_PILL.height / 2 },
        { kind: 'text', x, y, text: pitchClassName(pitch), size: 7.5, color: isOpen ? palette.text : palette.muted, font: 'ui', align: 'center', bold: isOpen },
      ];
    }).flat();
  });
}

/** Where a pitch can be pointed at on an instrument view (canvas points): a key of the piano, a position of the neck. */
export interface PitchRegion {
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Every position of every string as a cell around its note (the open string left of the nut), with the pitch it sounds
 * as the names show it — for previewing notes on hover. A string that starts up the neck starts at its peg.
 */
export function fretboardHoverRegions(track: Track, width: number): PitchRegion[] {
  const geometry = neckGeometry(width, track.strings.length);
  const tuning = trackTuning(track);
  return track.strings.flatMap((guitarString) => {
    const start = stringStartFret(tuning, guitarString.number);
    const y = stringY(guitarString.number) - FRETBOARD.stringGap / 2;
    return Array.from({ length: FRETBOARD.frets + 1 - start }, (_, i): PitchRegion => {
      const position = start + i;
      const x = position === 0 ? 0 : geometry.nutX + (position - 1) * geometry.fretWidth;
      const cellWidth = position === 0 ? geometry.nutX : geometry.fretWidth;
      return { pitch: guitarString.tuning + i, x, y, width: cellWidth, height: FRETBOARD.stringGap };
    });
  });
}

function capo(geometry: NeckGeometry, track: Track, palette: Palette): DrawCommand[] {
  if (track.offset <= 0) {
    return [];
  }
  const x = geometry.nutX + (track.offset - 0.15) * geometry.fretWidth;
  return [{ kind: 'rect', x: x - 3, y: FRETBOARD.top - 6, width: 6, height: geometry.bottom - FRETBOARD.top + 12, color: `${palette.text}AA`, radius: 3 }];
}

function currentNotes(geometry: NeckGeometry, input: FretboardInput): DrawCommand[] {
  const { track, palette } = input;
  return input.notes.flatMap((note): DrawCommand[] => {
    const tuning = track.strings[note.string - 1]?.tuning;
    if (tuning === undefined) {
      return [];
    }
    const position = neckPosition(track, note.string, note.fret);
    if (position > FRETBOARD.frets) {
      return [];
    }
    const x = fretX(geometry, position);
    const y = stringY(note.string);
    const label = note.effect.deadNote ? 'x' : pitchClassName(tuning + neckFret(track, note.fret));
    return [
      { kind: 'circle', x, y, radius: FRETBOARD.noteRadius, color: palette.accent },
      { kind: 'text', x, y, text: label, size: 8.5, color: palette.accentText, font: 'ui', align: 'center', bold: true },
    ];
  });
}

function cursorString(geometry: NeckGeometry, input: FretboardInput): DrawCommand[] {
  if (input.cursorString === undefined || input.cursorString > geometry.stringCount) {
    return [];
  }
  const y = stringY(input.cursorString);
  return [{ kind: 'rect', x: 1, y: y - 7, width: geometry.nutX - 6, height: 14, color: `${input.palette.accent}40`, radius: 4 }];
}
