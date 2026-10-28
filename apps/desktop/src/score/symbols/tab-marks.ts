import {
  type Beat,
  type BendPoint,
  DEFAULT_STYLESHEET,
  type HarmonicType,
  type Measure,
  type NotationStyle,
  type Note,
  type NoteEffect,
  type SymbolLabel,
} from '@gp-editor/core';
import type { MeasureLayout } from '../../lib/layout';
import type { Palette } from '../../theme';
import type { DrawAlign, DrawCommand, LineCommand, TextCommand } from '../draw';
import { hasPickStroke, tabPickStrokes } from './pick-strokes';
import { rasgueadoLabel } from './rasgueado-label';
import { dashedSpan, textWidth, wavyLine } from './shapes';
import {
  type MusicGlyph,
  TECHNIQUE_GLYPHS,
  TREMOLO_GLYPHS,
  staffSpace,
} from './smufl';
import { TAB_MARKS, beatEndX } from './tab-geometry';
import {
  hasVibrato,
  hasWideVibrato,
  splitVibratoRun,
  vibratoGlyph,
} from './vibrato';

/**
 * Effect marks above the tab staff, Guitar Pro style: per-beat labels (T, S, P, A.H., accents …), spans over
 * consecutive beats (vibrato, trill, tremolo bar, "P.M. - - -┐", "let ring - - -┐") and pick strokes. Each kind
 * present gets a lane.
 */
export type TabMarkKind =
  | 'labels'
  | 'vibrato'
  | 'trill'
  | 'whammy'
  | 'palmMute'
  | 'letRing'
  | 'pickStroke';

/** Kinds that come from the notes' effects (pick strokes are the beat's). */
type NoteMarkKind = Exclude<TabMarkKind, 'pickStroke'>;

/** Lane order, nearest the staff first; pick strokes go outermost, like bowing marks. */
export const TAB_MARK_KINDS: readonly TabMarkKind[] = [
  'labels',
  'vibrato',
  'trill',
  'whammy',
  'palmMute',
  'letRing',
  'pickStroke',
];

const HARMONIC_LABELS: Readonly<Partial<Record<HarmonicType, string>>> = {
  artificial: 'A.H.',
  pinch: 'P.H.',
  tapped: 'T.H.',
  semi: 'S.H.',
};
/** Effects written as words over the beat, by the stylesheet's labels (T, S, P by default). */
const TEXT_LABELS: ReadonlyArray<readonly [keyof NoteEffect, SymbolLabel]> = [
  ['tapping', 'tapping'],
  ['slapping', 'slap'],
  ['popping', 'pop'],
];

const MARK = {
  hook: 4,
  labelGap: 2,
  itemGap: 2,
  hairpinLength: 10,
  hairpinOpening: 3,
  lineWidth: 0.8,
  /** Tremolo bar dip: points per quarter tone, and the furthest it goes from the lane centre. */
  whammyScale: 1,
  whammyReach: 6,
  whammyLabelGap: 3,
  lastBendPosition: 12,
  /** Flags of a note value: tremolo strokes for tremolo picking. */
  quarterLog: 2,
} as const;

const HAS: Readonly<Record<NoteMarkKind, (effect: NoteEffect) => boolean>> = {
  labels: e =>
    e.tapping ||
    e.slapping ||
    e.popping ||
    e.fadeIn ||
    e.fadeOut === true ||
    e.volumeSwell === true ||
    e.staccato ||
    e.accentuatedNote ||
    e.heavyAccentuatedNote ||
    e.tremoloPicking !== undefined ||
    (e.harmonic !== undefined &&
      HARMONIC_LABELS[e.harmonic.type] !== undefined),
  vibrato: hasVibrato,
  trill: e => e.trill !== undefined,
  whammy: e => e.tremoloBar !== undefined,
  palmMute: e => e.palmMute,
  letRing: e => e.letRing,
};

function beatNotes(beat: Beat | undefined): readonly Note[] {
  return beat?.voices.flatMap(voice => voice.notes) ?? [];
}

/** Whether the beat has a mark of `kind` (its notes looked at where they are: every beat of a track is asked, per kind). */
function beatHas(beat: Beat | undefined, kind: TabMarkKind): boolean {
  if (kind === 'labels' && beat?.rasgueado !== undefined) {
    return true;
  }
  if (kind === 'pickStroke') {
    return hasPickStroke(beat);
  }
  const has = HAS[kind];
  return beat?.voices.some(voice => voice.notes.some(note => has(note.effect))) ?? false;
}

/** The kinds of marks in `measures`, in lane order: pass a row's measures to keep each kind at one height across the row. */
export function tabMarkLanes(measures: readonly Measure[]): TabMarkKind[] {
  return TAB_MARK_KINDS.filter(kind =>
    measures.some(measure => measure.beats.some(beat => beatHas(beat, kind))),
  );
}

export interface TabMarksContext {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** Last beat of the previous measure: a span it has goes on here without a new label. */
  readonly previousBeat?: Beat;
  /** A span its first beat has runs on to the bar line without an end hook. */
  readonly nextMeasure?: Measure;
  readonly marksY: number;
  readonly markLanes?: readonly TabMarkKind[];
  readonly palette: Palette;
  /** The stylesheet's labels and whether symbol lines go on over rests; the defaults when absent. */
  readonly notation?: NotationStyle;
}

function labelsOf(context: Pick<TabMarksContext, 'notation'>): NotationStyle['labels'] {
  return (context.notation ?? DEFAULT_STYLESHEET.notation).labels;
}

/** Consecutive beats (positions in layout order) with one kind of mark. */
interface Run {
  readonly first: number;
  readonly last: number;
  readonly isContinued: boolean;
  readonly goesOn: boolean;
}

/** No note in any voice of the beat. */
function isRest(beat: Beat | undefined): boolean {
  return beatNotes(beat).length === 0;
}

/** Whether every beat between two places of the layout (both left out) is a rest. */
function restsBetween(context: TabMarksContext, from: number, to: number): boolean {
  return context.layout.beats.slice(from + 1, Math.max(from + 1, to)).every((placed) => isRest(context.measure.beats[placed.beatIndex]));
}

function runs(context: TabMarksContext, kind: TabMarkKind): Run[] {
  const { layout, measure } = context;
  // The stylesheet's "extend symbol lines over rests": a let ring or palm mute line bridges the rests between its notes.
  const bridges = context.notation?.showsLinesOverRests === true && (kind === 'palmMute' || kind === 'letRing');
  const spans = layout.beats.reduce<
    ReadonlyArray<{ readonly first: number; readonly last: number }>
  >((found, beatLayout, position) => {
    if (!beatHas(measure.beats[beatLayout.beatIndex], kind)) {
      return found;
    }
    const previous = found[found.length - 1];
    const joins = previous !== undefined && (previous.last === position - 1 || (bridges && restsBetween(context, previous.last, position)));
    return previous !== undefined && joins
      ? [...found.slice(0, -1), { ...previous, last: position }]
      : [...found, { first: position, last: position }];
  }, []);
  const lastPosition = layout.beats.length - 1;
  return spans.map(span => ({
    ...span,
    isContinued: (span.first === 0 || (bridges && restsBetween(context, -1, span.first))) && beatHas(context.previousBeat, kind),
    goesOn:
      (span.last === lastPosition || (bridges && restsBetween(context, span.last, lastPosition + 1))) &&
      beatHas(context.nextMeasure?.beats[0], kind),
  }));
}

function runStart(context: TabMarksContext, run: Run): number {
  return run.isContinued
    ? 0
    : (context.layout.beats[run.first]?.x ?? 0) - TAB_MARKS.inset;
}

function runEnd(context: TabMarksContext, run: Run): number {
  return run.goesOn ? context.layout.width : beatEndX(context.layout, run.last);
}

function label(
  text: string,
  x: number,
  y: number,
  color: string,
  align: DrawAlign = 'left',
): TextCommand {
  return {
    kind: 'text',
    x,
    y,
    text,
    size: TAB_MARKS.fontSize,
    color,
    font: 'ui',
    align,
  };
}

/** Baseline that centres the glyph's ink on y. */
function centredBaseline(glyph: MusicGlyph, y: number): number {
  return y + ((glyph.top + glyph.bottom) / 2) * staffSpace(TAB_MARKS.musicSize);
}

function musicText(
  text: string,
  x: number,
  y: number,
  color: string,
): TextCommand {
  return {
    kind: 'text',
    x,
    y,
    text,
    size: TAB_MARKS.musicSize,
    color,
    font: 'music',
    align: 'left',
  };
}

function dashedSpans(
  context: TabMarksContext,
  kind: 'palmMute' | 'letRing',
  y: number,
): DrawCommand[] {
  const color = context.palette.muted;
  const text = labelsOf(context)[kind];
  return runs(context, kind).flatMap(run => {
    const end = runEnd(context, run);
    const style = { hook: run.goesOn ? undefined : MARK.hook, color };
    const x = runStart(context, run);
    if (run.isContinued) {
      return dashedSpan(x, end, y, style);
    }
    return [
      label(text, x, y, color),
      ...dashedSpan(
        x + textWidth(text, TAB_MARKS.fontSize) + MARK.labelGap,
        end,
        y,
        style,
      ),
    ];
  });
}

/** Slight and wide vibrato share the lane; a run changing width is drawn as one wave per width. */
function vibratoWaves(context: TabMarksContext, y: number): DrawCommand[] {
  const { layout, measure } = context;
  const isWideAt = (position: number) =>
    hasWideVibrato(measure.beats[layout.beats[position]?.beatIndex ?? -1]);
  return runs(context, 'vibrato')
    .flatMap(run => splitVibratoRun(run, isWideAt))
    .flatMap(piece => {
      const glyph = vibratoGlyph(piece.isWide);
      return wavyLine(
        runStart(context, piece),
        runEnd(context, piece),
        centredBaseline(glyph, y),
        glyph,
        TAB_MARKS.musicSize,
        context.palette.muted,
      );
    });
}

function trillWaves(context: TabMarksContext, y: number): DrawCommand[] {
  const color = context.palette.muted;
  const tr = TECHNIQUE_GLYPHS.ornamentTrill;
  const wave = TECHNIQUE_GLYPHS.wiggleTrill;
  return runs(context, 'trill').flatMap(run => {
    const start = runStart(context, run);
    const sign = run.isContinued
      ? []
      : [musicText(tr.text, start, centredBaseline(tr, y), color)];
    const waveStart = run.isContinued
      ? start
      : start + tr.advance * staffSpace(TAB_MARKS.musicSize) + MARK.itemGap;
    return [
      ...sign,
      ...wavyLine(
        waveStart,
        runEnd(context, run),
        centredBaseline(wave, y),
        wave,
        TAB_MARKS.musicSize,
        color,
      ),
    ];
  });
}

/** The tremolo bar's dip as a line graph over the note's time, down for negative amounts. */
function dipLines(
  points: readonly BendPoint[],
  x1: number,
  x2: number,
  y: number,
  color: string,
): LineCommand[] {
  const sorted = [...points].sort((a, b) => a.position - b.position);
  const at = (point: BendPoint) => ({
    x:
      x1 +
      ((x2 - x1) *
        Math.max(0, Math.min(MARK.lastBendPosition, point.position))) /
        MARK.lastBendPosition,
    y:
      y -
      Math.max(
        -MARK.whammyReach,
        Math.min(MARK.whammyReach, point.value * MARK.whammyScale),
      ),
  });
  return sorted.slice(1).map((point, i) => {
    const from = at(sorted[i] ?? point);
    const to = at(point);
    return {
      kind: 'line',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      width: MARK.lineWidth,
      color,
    };
  });
}

function whammy(context: TabMarksContext, y: number): DrawCommand[] {
  const { layout, measure } = context;
  const color = context.palette.muted;
  const labels = runs(context, 'whammy')
    .filter(run => !run.isContinued)
    .map(run =>
      label(
        labelsOf(context).whammyBar,
        (layout.beats[run.first]?.x ?? 0) - MARK.whammyLabelGap,
        y,
        color,
        'right',
      ),
    );
  const dips = layout.beats.flatMap((beatLayout, position) => {
    const bar = beatNotes(measure.beats[beatLayout.beatIndex]).find(
      note => note.effect.tremoloBar !== undefined,
    )?.effect.tremoloBar;
    return bar === undefined
      ? []
      : dipLines(
          bar.points,
          beatLayout.x,
          beatEndX(layout, position),
          y,
          color,
        );
  });
  return [...labels, ...dips];
}

/** One mark of a beat's labels, laid out left to right. */
interface LabelItem {
  readonly width: number;
  readonly draw: (x: number, y: number, color: string) => DrawCommand[];
}

function articulationItem(effects: readonly NoteEffect[]): LabelItem[] {
  const glyphs = [
    effects.some(e => e.staccato)
      ? TECHNIQUE_GLYPHS.articStaccatoAbove
      : undefined,
    effects.some(e => e.accentuatedNote)
      ? TECHNIQUE_GLYPHS.articAccentAbove
      : undefined,
    effects.some(e => e.heavyAccentuatedNote)
      ? TECHNIQUE_GLYPHS.articMarcatoAbove
      : undefined,
  ].filter((glyph): glyph is MusicGlyph => glyph !== undefined);
  const tallest = glyphs.reduce<MusicGlyph | undefined>(
    (top, glyph) => (top === undefined || glyph.top > top.top ? glyph : top),
    undefined,
  );
  if (tallest === undefined) {
    return [];
  }
  const text = glyphs.map(glyph => glyph.text).join('');
  const width =
    glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) *
    staffSpace(TAB_MARKS.musicSize);
  return [
    {
      width,
      draw: (x, y, color) => [
        musicText(text, x, centredBaseline(tallest, y), color),
      ],
    },
  ];
}

function tremoloItem(effects: readonly NoteEffect[]): LabelItem[] {
  const picking = effects.find(
    e => e.tremoloPicking !== undefined,
  )?.tremoloPicking;
  if (picking === undefined) {
    return [];
  }
  const strokes = Math.max(
    1,
    Math.min(
      TREMOLO_GLYPHS.length,
      Math.log2(picking.duration.value) - MARK.quarterLog,
    ),
  );
  const glyph = TREMOLO_GLYPHS[strokes - 1] ?? TREMOLO_GLYPHS[0];
  const half = (glyph?.advance ?? 0) * staffSpace(TAB_MARKS.musicSize);
  // Tremolo ink is centred on the glyph origin.
  return glyph === undefined
    ? []
    : [
        {
          width: 2 * half,
          draw: (x, y, color) => [musicText(glyph.text, x + half, y, color)],
        },
      ];
}

function textItem(effects: readonly NoteEffect[], labels: NotationStyle['labels']): LabelItem[] {
  const words = [
    ...TEXT_LABELS.filter(([key]) => effects.some(e => e[key] === true)).map(
      ([, name]) => labels[name],
    ),
    ...new Set(
      effects
        .flatMap(e =>
          e.harmonic === undefined ? [] : [HARMONIC_LABELS[e.harmonic.type]],
        )
        .filter((word): word is string => word !== undefined),
    ),
  ];
  if (words.length === 0) {
    return [];
  }
  const text = words.join(' ');
  return [
    {
      width: textWidth(text, TAB_MARKS.fontSize),
      draw: (x, y, color) => [label(text, x, y, color)],
    },
  ];
}

/** A small wedge: opening to the right (fade in, `opens`) or closing (fade out). */
function wedge(x: number, y: number, color: string, opens: boolean): DrawCommand[] {
  return [-1, 1].map(side => ({
    kind: 'line',
    x1: x,
    y1: y + (opens ? 0 : side * MARK.hairpinOpening),
    x2: x + MARK.hairpinLength,
    y2: y + (opens ? side * MARK.hairpinOpening : 0),
    width: MARK.lineWidth,
    color,
  }));
}

/** Fade in (<), fade out (>) or volume swell (<>), as Guitar Pro marks them over the tab. */
function hairpinItem(effects: readonly NoteEffect[]): LabelItem[] {
  if (effects.some(e => e.fadeIn)) {
    return [{ width: MARK.hairpinLength, draw: (x, y, color) => wedge(x, y, color, true) }];
  }
  if (effects.some(e => e.fadeOut === true)) {
    return [{ width: MARK.hairpinLength, draw: (x, y, color) => wedge(x, y, color, false) }];
  }
  if (!effects.some(e => e.volumeSwell === true)) {
    return [];
  }
  const draw = (x: number, y: number, color: string): DrawCommand[] => [
    ...wedge(x, y, color, true),
    ...wedge(x + MARK.hairpinLength, y, color, false),
  ];
  return [{ width: MARK.hairpinLength * 2, draw }];
}

/** "rasg." and the pattern's fingers (³ for a triplet, an. for an anapaest), over a rasgueado beat. */
function rasgueadoItem(beat: Beat | undefined, labels: NotationStyle['labels']): LabelItem[] {
  if (beat?.rasgueado === undefined) {
    return [];
  }
  const text = rasgueadoLabel(beat.rasgueado, labels.rasgueado);
  return [
    {
      width: textWidth(text, TAB_MARKS.fontSize),
      draw: (x, y, color) => [label(text, x, y, color)],
    },
  ];
}

function beatLabels(context: TabMarksContext, y: number): DrawCommand[] {
  const color = context.palette.muted;
  return context.layout.beats.flatMap(beatLayout => {
    const beat = context.measure.beats[beatLayout.beatIndex];
    const effects = beatNotes(beat).map(note => note.effect);
    const items = [
      ...articulationItem(effects),
      ...tremoloItem(effects),
      ...textItem(effects, labelsOf(context)),
      ...hairpinItem(effects),
      ...rasgueadoItem(beat, labelsOf(context)),
    ];
    const start = {
      commands: [] as readonly DrawCommand[],
      x: beatLayout.x - TAB_MARKS.inset,
    };
    return items.reduce(
      (placed, item) => ({
        commands: [...placed.commands, ...item.draw(placed.x, y, color)],
        x: placed.x + item.width + MARK.itemGap,
      }),
      start,
    ).commands;
  });
}

const DRAW: Readonly<
  Record<TabMarkKind, (context: TabMarksContext, y: number) => DrawCommand[]>
> = {
  labels: beatLabels,
  vibrato: vibratoWaves,
  trill: trillWaves,
  whammy,
  palmMute: (context, y) => dashedSpans(context, 'palmMute', y),
  letRing: (context, y) => dashedSpans(context, 'letRing', y),
  pickStroke: tabPickStrokes,
};

/** Every effect mark of the measure, each kind in its lane (lane 0 at marksY, the others stacked above). */
export function engraveTabMarks(context: TabMarksContext): DrawCommand[] {
  const lanes = context.markLanes ?? tabMarkLanes([context.measure]);
  return lanes.flatMap((kind, lane) =>
    DRAW[kind](context, context.marksY - lane * TAB_MARKS.laneHeight),
  );
}
