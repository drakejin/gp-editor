import type { Beat, Duration, Measure, MeasureHeader, NotationStyle, Track, Voice } from '@gp-editor/core';
import { type BeamLayout, beamGroupBoundsOf, flagCount, layoutBeams } from '../lib/beams';
import { type BeatLayout, type MeasureLayout, TAB, primaryVoice } from '../lib/layout';
import { fretLabel, tabFretOf } from '../lib/notation';
import type { Palette } from '../theme';
import { type DrawCommand, SMUFL, restGlyph } from './draw';
import { SLASH_GLYPHS } from './symbols/smufl';
import { FRET_BOX, tabStringY, voiceColor } from './symbols/tab-geometry';
import { type TabMarkKind, engraveTabMarks } from './symbols/tab-marks';
import { engraveTabTechniques } from './symbols/tab-notes';
import { cursorFill } from './voices';

export { type TabMarkKind, tabMarkLanes } from './symbols/tab-marks';

/** Where the tab staff of one measure goes and what to emphasise. Coordinates are measure-local (x = 0 at the left edge). */
export interface TabContext {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** The beat before this measure's first beat (last beat of the previous measure), for sustained effect marks. */
  readonly previousBeat?: Beat;
  /** For slurs and slides arriving from the previous measure (its last beat stands in for `previousBeat` when that is absent). */
  readonly previousMeasure?: Measure;
  /** For slurs and slides leaving the measure, and spans ("P.M. - - -") that go on past the bar line. */
  readonly nextMeasure?: Measure;
  /** Lanes of the effect marks, e.g. `tabMarkLanes(rowMeasures)` so each kind keeps its height across a row; default: this measure's. */
  readonly markLanes?: readonly TabMarkKind[];
  /** Y of the first (highest) string. */
  readonly top: number;
  /** Y centre of the lowest effect-mark lane; further lanes stack `TAB_MARKS.laneHeight` above it. */
  readonly marksY: number;
  /** Rhythm stems, beams and rests under the staff (tab-only mode). */
  readonly showRhythm: boolean;
  readonly palette: Palette;
  /** Editor cursor in this measure (in voice 1 when no voice is given). */
  readonly cursor?: TabCursor;
  /** Beat being played. */
  readonly playingBeatIndex?: number;
  /** The voice being edited (the cursor's): the other voices' frets are drawn faded, as Guitar Pro 8 does. */
  readonly editedVoiceIndex?: number;
  /** The stylesheet's labels, symbol lines over rests, H / P, "sl." and voice colours; the defaults when absent. */
  readonly notation?: NotationStyle;
}

export interface TabCursor {
  readonly beatIndex: number;
  readonly string: number;
  readonly voiceIndex?: number;
}

const FRET_FONT_SIZE = 11;
const STEM_GAP = 8;
const STEM_HEIGHT = 15;
const HALF_STEM_HEIGHT = 9;
const BEAM_SPACING = 3;
const MUSIC_SIZE = 32;
/** A slash on the tab staff, smaller than on the five-line staff: two string gaps tall. */
const SLASH_SIZE = MUSIC_SIZE * 0.75;

export function stringY(top: number, stringNumber: number): number {
  return tabStringY(top, stringNumber);
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
  commands.push(...engraveTabMarks({ ...context, previousBeat: context.previousBeat ?? lastBeat(context.previousMeasure) }));
  commands.push(...engraveTabTechniques({ ...context, measure: withoutSlashedNotes(context.track, context.measure) }));
  if (context.cursor !== undefined) {
    commands.push(...cursorBox(context, context.cursor));
  }
  if (beams !== undefined) {
    commands.push(...beamLines(beams, bottom + STEM_GAP, palette));
  }
  return commands;
}

/** A voice written as rhythm slashes (its own or its track's slash notation): the tab shows its rhythm, not its frets. */
function isSlashedVoice(track: Track, voice: Voice): boolean {
  return track.hasSlashNotation === true || voice.isSlashed === true;
}

/** The measure without the notes of slashed voices, for the marks drawn at a fret (bends, slides …). */
function withoutSlashedNotes(track: Track, measure: Measure): Measure {
  const beats = measure.beats.map((beat) =>
    beat.voices.some((voice) => voice.notes.length > 0 && isSlashedVoice(track, voice))
      ? { ...beat, voices: beat.voices.map((voice) => (isSlashedVoice(track, voice) ? { ...voice, notes: [] } : voice)) }
      : beat,
  );
  return { ...measure, beats };
}

/** A rhythm slash across the middle of the tab staff. */
function slashGlyph(x: number, middle: number, color: string): DrawCommand {
  return { kind: 'text', x, y: middle, text: SLASH_GLYPHS.black.text, size: SLASH_SIZE, color, font: 'music', align: 'center' };
}

function lastBeat(measure: Measure | undefined): Beat | undefined {
  return measure?.beats[measure.beats.length - 1];
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
  const { palette, top, editedVoiceIndex } = context;
  const { x } = beatLayout;
  const commands: DrawCommand[] = [];
  beat.voices.forEach((voice, voiceIndex) => {
    const color = voiceColor(voiceIndex, palette, editedVoiceIndex, context.notation?.showsVoiceColors);
    if (isSlashedVoice(context.track, voice)) {
      commands.push(...(voice.notes.length > 0 ? [slashGlyph(x, (top + bottom) / 2, color)] : []));
      return;
    }
    voice.notes.forEach((note) => {
      const y = stringY(top, note.string);
      commands.push(
        { kind: 'rect', x: x - FRET_BOX.width / 2, y: y - FRET_BOX.height / 2, width: FRET_BOX.width, height: FRET_BOX.height, color: palette.paper, radius: 3 },
        { kind: 'text', x, y, text: fretLabel(note, tabFretOf(context.track, note)), size: FRET_FONT_SIZE, color, font: 'mono', align: 'center', bold: true },
      );
    });
  });
  const voice = primaryVoice(beat);
  if (voice !== undefined && context.showRhythm) {
    if (voice.notes.length === 0) {
      commands.push(rhythmRest(voice, x, (top + bottom) / 2, palette.text));
    }
    commands.push(...rhythmStem(voice, x, bottom + STEM_GAP, isBeamed, palette));
  }
  return commands;
}

/**
 * The editor cursor: a box on the string at the beat, washed in its voice's colour, drawn over the staff whether or not
 * a note is there. The note of the cursor's voice shows on it in ink; else another voice's note there, as that voice is drawn.
 */
function cursorBox(context: TabContext, cursor: TabCursor): DrawCommand[] {
  const beat = context.layout.beats.find((b) => b.beatIndex === cursor.beatIndex);
  if (beat === undefined) {
    return [];
  }
  const voiceIndex = cursor.voiceIndex ?? 0;
  const y = stringY(context.top, cursor.string);
  const notes = (context.measure.beats[cursor.beatIndex]?.voices ?? []).flatMap((voice, index) =>
    isSlashedVoice(context.track, voice) ? [] : voice.notes.filter((n) => n.string === cursor.string).map((note) => ({ note, index })),
  );
  const shown = notes.find((candidate) => candidate.index === voiceIndex) ?? notes[0];
  const box = { x: beat.x - FRET_BOX.width / 2 - 1, y: y - FRET_BOX.height / 2 - 1, width: FRET_BOX.width + 2, height: FRET_BOX.height + 2 };
  const commands: DrawCommand[] = [{ kind: 'rect', ...box, color: cursorFill(voiceIndex, context.palette), radius: 4 }];
  if (shown !== undefined) {
    const color = shown.index === voiceIndex ? context.palette.text : voiceColor(shown.index, context.palette, context.editedVoiceIndex, context.notation?.showsVoiceColors);
    commands.push({ kind: 'text', x: beat.x, y, text: fretLabel(shown.note, tabFretOf(context.track, shown.note)), size: FRET_FONT_SIZE, color, font: 'mono', align: 'center', bold: true });
  }
  return commands;
}

function rhythmRest(voice: Voice, x: number, middle: number, color: string): DrawCommand {
  return { kind: 'text', x, y: middle + 4, text: restGlyph(voice.duration.value), size: MUSIC_SIZE * 0.75, color, font: 'music', align: 'center' };
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
  const label = tupletLabel(voice.duration);
  if (label !== undefined) {
    commands.push({ kind: 'text', x, y: top + height + 6, text: label, size: 8, color: palette.muted, font: 'ui', align: 'center' });
  }
  return commands;
}

/** The tuplet number under a stem: "3", or "5(3)" for a triplet inside a quintuplet; undefined for no tuplet. */
function tupletLabel(duration: Duration): string | undefined {
  const { tuplet, innerTuplet } = duration;
  if (tuplet.enters === tuplet.times) {
    return undefined;
  }
  return innerTuplet === undefined ? String(tuplet.enters) : `${tuplet.enters}(${innerTuplet.enters})`;
}

function measureBeams(context: TabContext): BeamLayout {
  const rhythm = context.layout.beats.map((beatLayout) => {
    const beat = context.measure.beats[beatLayout.beatIndex];
    const voice = beat === undefined ? undefined : primaryVoice(beat);
    const isRest = voice === undefined || voice.notes.length === 0;
    return { x: beatLayout.x, start: beat?.start ?? 0, value: voice?.duration.value ?? 4, isRest, ...(voice?.beamToNext === undefined ? {} : { beamToNext: voice.beamToNext }) };
  });
  return layoutBeams(rhythm, context.header.start, beamGroupBoundsOf(context.header));
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
