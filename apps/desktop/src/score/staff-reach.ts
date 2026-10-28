import { type Measure, type MeasureHeader, type Song, type Track, stylesheetOf } from '@gp-editor/core';
import { isKeyboardTrack } from '../lib/fingering';
import { type MeasureLayout, type RowLayout, TAB, layoutMeasure, stretchMeasure } from '../lib/layout';
import { paletteFor } from '../theme';
import type { DrawCommand } from './draw';
import { ROW, type ScoreMode, showsTab } from './geometry';
import { inkExtent } from './ink';
import { STAFF_HEIGHT, engraveNotationMeasure, engraveNotationRowHeader } from './notation';
import { clefKind } from './notation/pitch';
import { engraveNotationExpressions } from './notation-expressions';
import { engraveTabMeasure, engraveTabRowHeader } from './tab';

/**
 * How far a row's staff reaches above its top line and below its bottom line — the notation's five lines, the tab's
 * strings —, so that its bands make room for that (`row-bands.ts`): the row header and every bar engraved as `row.ts`
 * engraves them (no cursor, nothing playing), measured.
 */
export interface StaffReach {
  readonly above: number;
  readonly below: number;
}

/** Colours do not move ink: any palette engraves the same shapes. */
const PALETTE = paletteFor({ appearance: 'light', contrast: 'standard', paper: 'light' });

const NONE: StaffReach = { above: 0, below: 0 };

/**
 * A bar is measured once, on a layout of its own — its natural one (`layoutMeasure`) with its beats this much further
 * apart — and followed by the next bar, not as its row places it: so it keeps its reach when the rows break or stretch
 * otherwise (a zoom, a wider window, the print). Spacing moves nothing up or down but arcs — ties, slurs, a hammer-on's
 * arc and its H —, which grow with their length up to their highest: three times its natural spacing is more than a
 * row stretches; and a link drawn whole into the next bar reaches as far as the halves a row's ends draw.
 */
const MEASURED_STRETCH = 3;

/** What a bar's staff is engraved from besides the bar itself: when all of it is the same, so is its reach. */
interface BarInputs {
  /** The staff, and for a tab its lanes and bends (where its marks go). */
  readonly part: string;
  readonly header: MeasureHeader;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  readonly nextHeader?: MeasureHeader;
  readonly strings: Track['strings'];
  /** The capo: the notes' written pitch. */
  readonly offset: number;
  readonly isPercussion: boolean;
  readonly hasSlashNotation: boolean;
  readonly isKeyboard: boolean;
  readonly showsTab: boolean;
  readonly stylesheet: Song['stylesheet'];
}

interface KeptReach {
  readonly inputs: BarInputs;
  readonly reach: StaffReach;
}

/** Each bar's reaches: a bar an edit left alone is not engraved again to measure it. */
const KEPT = new WeakMap<Measure, readonly KeptReach[]>();
/** Reaches kept per bar: both staves, in a mode or two. */
const KEPT_PER_BAR = 4;

function isSameInputs(a: BarInputs, b: BarInputs): boolean {
  return (Object.keys(a) as (keyof BarInputs)[]).every((key) => a[key] === b[key]);
}

function furthest(a: StaffReach, b: StaffReach): StaffReach {
  return { above: Math.max(a.above, b.above), below: Math.max(a.below, b.below) };
}

/** Commands engraved with the staff's top line at 0, `height` tall: how far they reach above it and below its bottom. */
function reachOf(commands: readonly DrawCommand[], height: number): StaffReach {
  const extent = inkExtent(commands);
  return extent === undefined ? NONE : { above: Math.max(0, -extent.top), below: Math.max(0, extent.bottom - height) };
}

/** A row of one track's staff: what every bar of it is engraved with. */
interface RowScope {
  readonly song: Song;
  readonly track: Track;
  readonly trackIndex: number;
  readonly showsTab: boolean;
  readonly isKeyboard: boolean;
  readonly part: string;
  /** The staff's height, top line to bottom line. */
  readonly height: number;
  readonly engrave: (bar: BarToEngrave) => DrawCommand[];
}

/** One bar on its measured layout, and what it is engraved from. */
interface BarToEngrave {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  readonly inputs: BarInputs;
  readonly nextInRow?: { readonly header: MeasureHeader; readonly layout: MeasureLayout };
}

function barInputs(scope: RowScope, measureIndex: number): BarInputs | undefined {
  const { song, track } = scope;
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return undefined;
  }
  return {
    part: scope.part, header, previousMeasure: track.measures[measureIndex - 1], nextMeasure: track.measures[measureIndex + 1],
    nextHeader: song.measureHeaders[measureIndex + 1], strings: track.strings, offset: track.offset,
    isPercussion: track.isPercussion, hasSlashNotation: track.hasSlashNotation === true, isKeyboard: scope.isKeyboard, showsTab: scope.showsTab,
    stylesheet: song.stylesheet,
  };
}

/** Each bar's measured layout, with what it was laid out from (its header, the bar before it, the stylesheet's spacing). */
const MEASURED_LAYOUTS = new WeakMap<Measure, { readonly header?: MeasureHeader; readonly previous?: Measure; readonly stylesheet: Song['stylesheet']; readonly layout: MeasureLayout }>();

function measuredLayout(scope: RowScope, measureIndex: number): MeasureLayout {
  const { song, track } = scope;
  const measure = track.measures[measureIndex];
  const header = song.measureHeaders[measureIndex];
  const previous = track.measures[measureIndex - 1];
  const kept = measure === undefined ? undefined : MEASURED_LAYOUTS.get(measure);
  if (kept !== undefined && kept.header === header && kept.previous === previous && kept.stylesheet === song.stylesheet) {
    return kept.layout;
  }
  const layout = stretchMeasure(layoutMeasure(song, scope.trackIndex, measureIndex), MEASURED_STRETCH);
  if (measure !== undefined) {
    MEASURED_LAYOUTS.set(measure, { header, previous, stylesheet: song.stylesheet, layout });
  }
  return layout;
}

/** One bar measured (kept for the next layout). */
function barReach(scope: RowScope, measureIndex: number): StaffReach {
  const measure = scope.track.measures[measureIndex];
  const inputs = barInputs(scope, measureIndex);
  if (measure === undefined || inputs === undefined) {
    return NONE;
  }
  const kept = KEPT.get(measure) ?? [];
  const found = kept.find((entry) => isSameInputs(entry.inputs, inputs));
  if (found !== undefined) {
    return found.reach;
  }
  const layout = measuredLayout(scope, measureIndex);
  const nextInRow = inputs.nextHeader === undefined ? undefined : { header: inputs.nextHeader, layout: measuredLayout(scope, measureIndex + 1) };
  const reach = reachOf(scope.engrave({ measure, layout, inputs, nextInRow }), scope.height);
  KEPT.set(measure, [{ inputs, reach }, ...kept].slice(0, KEPT_PER_BAR));
  return reach;
}

/** The row headers' reaches by what they show (a clef and key, a tab's strings): a handful in a song. */
const HEADER_REACHES = new Map<string, StaffReach>();

/** The reach of a row header showing `key`, engraved by `engrave` the first time. */
function headerReach(key: string, height: number, engrave: () => readonly DrawCommand[]): StaffReach {
  const kept = HEADER_REACHES.get(key);
  if (kept !== undefined) {
    return kept;
  }
  const reach = reachOf(engrave(), height);
  HEADER_REACHES.set(key, reach);
  return reach;
}

function rowReach(scope: RowScope, row: RowLayout, header: StaffReach): StaffReach {
  return row.measures.reduce((reach, layout) => furthest(reach, barReach(scope, layout.measureIndex)), header);
}

/** How far the notation of a track's row reaches above and below its five lines. */
export function notationReach(song: Song, trackIndex: number, mode: ScoreMode, row: RowLayout): StaffReach {
  const track = song.tracks[trackIndex];
  const first = track?.measures[row.measures[0]?.measureIndex ?? -1];
  if (track === undefined || first === undefined) {
    return NONE;
  }
  const sheet = stylesheetOf(song);
  const isTabShown = showsTab(mode);
  const isKeyboard = isKeyboardTrack(song, trackIndex);
  const engrave = ({ measure, layout, inputs, nextInRow }: BarToEngrave): DrawCommand[] => {
    const notation = engraveNotationMeasure({
      track, header: inputs.header, measure, layout, previousMeasure: inputs.previousMeasure, nextMeasure: inputs.nextMeasure, nextInRow,
      isRowStart: false, top: 0, palette: PALETTE, showsPickStrokes: !isTabShown, isKeyboard, showsCommonTime: sheet.notation.showsCommonTime,
    });
    // Without a tab staff, the fades and rasgueados go over the notation.
    return isTabShown ? notation : [...notation, ...engraveNotationExpressions(measure, layout, 0, PALETTE, sheet.notation)];
  };
  const scope: RowScope = { song, track, trackIndex, showsTab: isTabShown, isKeyboard, part: 'notation', height: STAFF_HEIGHT, engrave };
  const header = headerReach(`notation ${clefKind(track, first.clef)} ${first.keySignature}`, STAFF_HEIGHT, () => engraveNotationRowHeader(track, first, 0, PALETTE));
  return rowReach(scope, row, header);
}

/**
 * How far the tab of a track's row reaches above its top string and below its bottom string, its effect marks left out
 * (their lanes have a band of their own): a hammer-on's arc and its H, bend arrows, rhythm under a tab-only staff.
 */
export function tabReach(song: Song, trackIndex: number, mode: ScoreMode, row: RowLayout): StaffReach {
  const track = song.tracks[trackIndex];
  if (track === undefined || row.measures.length === 0) {
    return NONE;
  }
  const sheet = stylesheetOf(song);
  const engrave = ({ measure, layout, inputs, nextInRow }: BarToEngrave): DrawCommand[] => {
    const previousBeat = inputs.previousMeasure?.beats[inputs.previousMeasure.beats.length - 1];
    return engraveTabMeasure({
      track, header: inputs.header, measure, layout, previousBeat, previousMeasure: inputs.previousMeasure, nextMeasure: inputs.nextMeasure, nextInRow,
      isRowStart: false, markLanes: [], top: 0, marksY: -ROW.marks / 2, showRhythm: mode === 'tab', palette: PALETTE, notation: sheet.notation,
    });
  };
  const part = mode === 'tab' ? 'tabWithRhythm' : 'tab';
  const height = Math.max(0, track.strings.length - 1) * TAB.stringGap;
  const scope: RowScope = { song, track, trackIndex, showsTab: true, isKeyboard: false, part, height, engrave };
  return rowReach(scope, row, headerReach(`tab ${track.strings.length}`, height, () => engraveTabRowHeader(track, 0, PALETTE)));
}
