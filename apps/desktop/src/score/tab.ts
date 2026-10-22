import type { Beat, Measure, MeasureHeader, Track, Voice } from '@gp-editor/core';
import { type BeamLayout, beamGroupTicks, flagCount, layoutBeams } from '../lib/beams';
import { type BeatLayout, type MeasureLayout, TAB, primaryVoice } from '../lib/layout';
import { beatMarks, fretLabel } from '../lib/notation';
import type { Palette } from '../theme';
import { type DrawCommand, SMUFL } from './draw';

/** Where the tab staff of one measure goes and what to emphasise. Coordinates are measure-local (x = 0 at the left edge). */
export interface TabContext {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** The beat before this measure's first beat (last beat of the previous measure), for sustained effect marks. */
  readonly previousBeat?: Beat;
  /** Y of the first (highest) string. */
  readonly top: number;
  /** Y centre of the effect marks row. */
  readonly marksY: number;
  /** Rhythm stems, beams and rests under the staff (tab-only mode). */
  readonly showRhythm: boolean;
  readonly palette: Palette;
  /** Editor cursor in this measure. */
  readonly cursor?: { readonly beatIndex: number; readonly string: number };
  /** Beat being played. */
  readonly playingBeatIndex?: number;
}

const FRET_BOX = { width: 22, height: 14 } as const;
const FRET_FONT_SIZE = 11;
const MARK_FONT_SIZE = 9;
/** Effect marks start a little left of the beat and read rightwards, like a span label. */
const MARK_INSET = 8;
const STEM_GAP = 8;
const STEM_HEIGHT = 15;
const HALF_STEM_HEIGHT = 9;
const BEAM_SPACING = 3;
const MUSIC_SIZE = 32;

export function stringY(top: number, stringNumber: number): number {
  return top + (stringNumber - 1) * TAB.stringGap;
}

export function tabStaffHeight(stringCount: number): number {
  return Math.max(1, (stringCount - 1) * TAB.stringGap);
}

export function engraveTabMeasure(context: TabContext): DrawCommand[] {
  const { layout, track, top, palette } = context;
  const bottom = stringY(top, track.strings.length);
  const commands: DrawCommand[] = [];
  if (context.playingBeatIndex !== undefined) {
    commands.push(...playingColumn(context, context.playingBeatIndex, top, bottom));
  }
  track.strings.forEach((guitarString) => {
    const y = stringY(top, guitarString.number);
    commands.push({ kind: 'line', x1: 0, y1: y, x2: layout.width, y2: y, width: 1, color: palette.line });
  });
  commands.push(...barLines(context, top, bottom));
  if (layout.timeSignatureX !== undefined) {
    commands.push(...timeSignature(context, layout.timeSignatureX, top, bottom));
  }
  const beams = context.showRhythm ? measureBeams(context) : undefined;
  layout.beats.forEach((beatLayout) => {
    const beat = context.measure.beats[beatLayout.beatIndex];
    if (beat !== undefined) {
      const isBeamed = beams?.beamed.has(beatLayout.beatIndex) ?? false;
      commands.push(...engraveBeat(context, beat, beatLayout, bottom, isBeamed));
    }
  });
  if (context.cursor !== undefined) {
    commands.push(...cursorBox(context, context.cursor));
  }
  if (beams !== undefined) {
    commands.push(...beamLines(beams, bottom + STEM_GAP, palette));
  }
  return commands;
}

function playingColumn(context: TabContext, beatIndex: number, top: number, bottom: number): DrawCommand[] {
  const beat = context.layout.beats.find((b) => b.beatIndex === beatIndex);
  if (beat === undefined) {
    return [];
  }
  const color = `${context.palette.accent}33`;
  return [{ kind: 'rect', x: beat.x - FRET_BOX.width / 2, y: top - 10, width: FRET_BOX.width, height: bottom - top + 20, color, radius: 4 }];
}

function barLines(context: TabContext, top: number, bottom: number): DrawCommand[] {
  const { header, layout, palette } = context;
  const color = palette.text;
  const right = layout.width;
  const middle = (top + bottom) / 2;
  const commands: DrawCommand[] = [{ kind: 'line', x1: right, y1: top, x2: right, y2: bottom, width: 1, color }];
  if (header.repeatOpen) {
    commands.push(
      { kind: 'rect', x: 0, y: top, width: 3, height: bottom - top, color },
      { kind: 'circle', x: 8, y: middle - 6, radius: 2, color },
      { kind: 'circle', x: 8, y: middle + 6, radius: 2, color },
    );
  }
  if (header.repeatClose > 0) {
    commands.push(
      { kind: 'rect', x: right - 3, y: top, width: 3, height: bottom - top, color },
      { kind: 'circle', x: right - 8, y: middle - 6, radius: 2, color },
      { kind: 'circle', x: right - 8, y: middle + 6, radius: 2, color },
    );
  }
  return commands;
}

function timeSignature(context: TabContext, x: number, top: number, bottom: number): DrawCommand[] {
  const { numerator, denominator } = context.header.timeSignature;
  const middle = (top + bottom) / 2;
  const size = Math.min(22, Math.max(14, (bottom - top) / 2));
  const style = { size, color: context.palette.text, font: 'mono', align: 'center', bold: true } as const;
  const centre = x + TAB.timeSignatureWidth / 2 - 4;
  return [
    { kind: 'text', x: centre, y: middle - size / 2, text: String(numerator), ...style },
    { kind: 'text', x: centre, y: middle + size / 2, text: String(denominator), ...style },
  ];
}

function engraveBeat(context: TabContext, beat: Beat, beatLayout: BeatLayout, bottom: number, isBeamed: boolean): DrawCommand[] {
  const { palette, top } = context;
  const { beatIndex, x } = beatLayout;
  const commands: DrawCommand[] = [];
  const marks = beatMarks(beat, beatIndex === 0 ? context.previousBeat : context.measure.beats[beatIndex - 1]);
  if (marks.length > 0) {
    commands.push({ kind: 'text', x: x - MARK_INSET, y: context.marksY, text: marks.join(' '), size: MARK_FONT_SIZE, color: palette.muted, font: 'ui', align: 'left' });
  }
  beat.voices.forEach((voice, voiceIndex) => {
    voice.notes.forEach((note) => {
      const y = stringY(top, note.string);
      commands.push(
        { kind: 'rect', x: x - FRET_BOX.width / 2, y: y - FRET_BOX.height / 2, width: FRET_BOX.width, height: FRET_BOX.height, color: palette.paper, radius: 3 },
        { kind: 'text', x, y, text: fretLabel(note), size: FRET_FONT_SIZE, color: voiceIndex > 0 ? palette.accent : palette.text, font: 'mono', align: 'center', bold: true },
      );
    });
  });
  const voice = primaryVoice(beat);
  if (voice !== undefined && context.showRhythm) {
    if (voice.notes.length === 0) {
      commands.push(restGlyph(voice, x, (top + bottom) / 2, palette.text));
    }
    commands.push(...rhythmStem(voice, x, bottom + STEM_GAP, isBeamed, palette));
  }
  return commands;
}

/** The editor cursor: a box on the string at the beat, drawn over the staff whether or not a note is there. */
function cursorBox(context: TabContext, cursor: { readonly beatIndex: number; readonly string: number }): DrawCommand[] {
  const beat = context.layout.beats.find((b) => b.beatIndex === cursor.beatIndex);
  if (beat === undefined) {
    return [];
  }
  const y = stringY(context.top, cursor.string);
  const note = context.measure.beats[cursor.beatIndex]?.voices.flatMap((voice) => voice.notes).find((n) => n.string === cursor.string);
  const box = { x: beat.x - FRET_BOX.width / 2 - 1, y: y - FRET_BOX.height / 2 - 1, width: FRET_BOX.width + 2, height: FRET_BOX.height + 2 };
  const commands: DrawCommand[] = [{ kind: 'rect', ...box, color: context.palette.selection, radius: 4 }];
  if (note !== undefined) {
    commands.push({ kind: 'text', x: beat.x, y, text: fretLabel(note), size: FRET_FONT_SIZE, color: context.palette.text, font: 'mono', align: 'center', bold: true });
  }
  return commands;
}

const REST_GLYPHS: Readonly<Record<number, string>> = {
  1: SMUFL.restWhole,
  2: SMUFL.restHalf,
  4: SMUFL.restQuarter,
  8: SMUFL.rest8th,
  16: SMUFL.rest16th,
  32: SMUFL.rest32nd,
  64: SMUFL.rest64th,
};

function restGlyph(voice: Voice, x: number, middle: number, color: string): DrawCommand {
  return { kind: 'text', x, y: middle + 4, text: REST_GLYPHS[voice.duration.value] ?? SMUFL.restQuarter, size: MUSIC_SIZE * 0.75, color, font: 'music', align: 'center' };
}

function rhythmStem(voice: Voice, x: number, top: number, beamed: boolean, palette: Palette): DrawCommand[] {
  const value = voice.duration.value;
  if (value === 1) {
    return [];
  }
  const height = value === 2 ? HALF_STEM_HEIGHT : STEM_HEIGHT;
  const color = palette.text;
  const commands: DrawCommand[] = [{ kind: 'line', x1: x, y1: top, x2: x, y2: top + height, width: 1, color }];
  const flags = beamed ? 0 : flagCount(value);
  for (let i = 0; i < flags; i++) {
    const y = top + height - 1 - i * BEAM_SPACING;
    commands.push({ kind: 'line', x1: x, y1: y, x2: x + 6, y2: y, width: 1.5, color });
  }
  if (voice.duration.dotted || voice.duration.doubleDotted) {
    commands.push({ kind: 'circle', x: x + 5, y: top + height - 3, radius: 1.5, color });
  }
  const { enters, times } = voice.duration.tuplet;
  if (enters !== times) {
    commands.push({ kind: 'text', x, y: top + height + 6, text: String(enters), size: 8, color: palette.muted, font: 'ui', align: 'center' });
  }
  return commands;
}

function measureBeams(context: TabContext): BeamLayout {
  const rhythm = context.layout.beats.map((beatLayout) => {
    const beat = context.measure.beats[beatLayout.beatIndex];
    const voice = beat === undefined ? undefined : primaryVoice(beat);
    return { x: beatLayout.x, start: beat?.start ?? 0, value: voice?.duration.value ?? 4, isRest: voice === undefined || voice.notes.length === 0 };
  });
  const { numerator, denominator } = context.header.timeSignature;
  return layoutBeams(rhythm, context.header.start, beamGroupTicks(numerator, denominator));
}

function beamLines(beams: BeamLayout, top: number, palette: Palette): DrawCommand[] {
  return beams.beams.map((beam) => ({
    kind: 'rect',
    x: beam.fromX,
    y: top + STEM_HEIGHT - 2 - (beam.level - 1) * BEAM_SPACING,
    width: Math.max(1, beam.toX - beam.fromX + 1),
    height: 2,
    color: palette.text,
  }));
}

/** "TAB" clef at the start of a row. */
export function engraveTabRowHeader(track: Track, top: number, palette: Palette): DrawCommand[] {
  const bottom = stringY(top, track.strings.length);
  const glyph = track.strings.length <= 4 ? SMUFL.fourStringTabClef : SMUFL.sixStringTabClef;
  return [{ kind: 'text', x: 4, y: (top + bottom) / 2 + 12, text: glyph, size: MUSIC_SIZE, color: palette.text, font: 'music', align: 'left' }];
}
