import { type Song, type Stylesheet, type Track, type TrackNameFormat, abbreviateTrackName, stylesheetOf } from '@gp-editor/core';
import { layoutAlignedMeasures, layoutAlignedRows } from '../lib/aligned-measures';
import { t } from '../lib/i18n/i18n';
import type { MeasureLayout, RowLayout } from '../lib/layout';
import { withBeatOffsets } from '../lib/system-design';
import { type ChordDisplay, chordBands, chordBeatWidth } from './chords';
import { hasDirections } from './directions';
import { hasDynamicChanges } from './dynamics';
import { ROW, type RowBands, type RowGeometry, type ScoreMode, rowGeometry, showsTab } from './geometry';
import { hasFreeTexts, textBandHeights } from './free-text';
import { hasLyrics } from './lyrics';
import { hasPedals } from './pedals';
import { NOTATION } from './notation';
import { rowHeaderWidth } from './row';
import { rowBands, rowMarkLanes } from './row-bands';
import { hasBends } from './symbols/bends';
import { textWidth } from './symbols/shapes';
import { type TabMarkKind, tabMarkLanes } from './tab';

/** A multitrack system's spacing, names and bracket, in points. */
export const SYSTEM = {
  /** Room over a track's staves under another track's (in place of the heading band). */
  staffSpacing: 10,
  /** Under a system's last staves, before the next system. */
  gap: 18,
  nameSize: 10,
  /** The longest name drawn; longer ones are cut with an ellipsis. */
  maxNameWidth: 120,
  /** Between a name and the bracket. */
  nameGap: 6,
  /** From the bracket's thick line to the staves. */
  bracketGap: 7,
  /** Left of the names. */
  margin: 4,
} as const;

/** A shown track and the staves it is drawn with. */
export interface StaffSpec {
  readonly trackIndex: number;
  readonly mode: ScoreMode;
}

/**
 * A shown track's staves stacked in a system: the plan its geometry is made from, and its place in the system. A
 * system's own (`ScoreSystem.staves`) have the bands of its bars; the layout's (`ScoreLayout.staves`) every band the
 * track has anywhere.
 */
export interface ScoreStaff extends StaffPlan {
  readonly geometry: RowGeometry;
  /** Bar numbers, tempo and markers over it: the top staff only. */
  readonly hasHeading: boolean;
  /** From the system's top. */
  readonly top: number;
  /** Its geometry's height, and the gap before the next system under the last staff of a multitrack system. */
  readonly height: number;
}

/** One line of the score: the same bars on every staff. */
export interface ScoreSystem {
  /** One row per staff (the staves' order), sharing their bar widths. */
  readonly rows: readonly RowLayout[];
  /** The track names left of the staves; 0 with one track. */
  readonly namesWidth: number;
  /** Where the bars start: the names, then the clef column. */
  readonly headerWidth: number;
  /** Its staves stacked with the bands its own bars need (`systemBands`): what draws, scrolls and hit-tests the system. */
  readonly staves: readonly ScoreStaff[];
  /** From the first system's top, in layout points. */
  readonly top: number;
  /** Its staves' height, with the room under the last one. */
  readonly height: number;
}

export interface ScoreLayout {
  /** Each shown track's staves with every band the track has anywhere: the tallest a system can be. */
  readonly staves: readonly ScoreStaff[];
  readonly systems: readonly ScoreSystem[];
  /** The clef (+ key signature) column, as wide as the widest staff needs. */
  readonly clefWidth: number;
}

/** A staff before it is stacked: what its geometry is made from. */
export interface StaffPlan extends StaffSpec {
  readonly stringCount: number;
  readonly bands: RowBands;
  readonly markLanes: readonly TabMarkKind[];
}

/**
 * The bands a track's staves make room for, in every system; the top staff has the heading and the directions. The
 * stylesheet places (or hides) the lyrics and dynamics, sizes the text lines and adds its staff and track spacing.
 */
function staffBands(song: Song, track: Track, markLaneCount: number, isTop: boolean, chordDisplay: ChordDisplay): RowBands {
  const { measures } = track;
  const sheet = stylesheetOf(song);
  return {
    markLaneCount,
    hasDynamics: sheet.notation.showsDynamics && hasDynamicChanges(measures),
    hasBends: hasBends(measures),
    hasLyrics: sheet.lyrics !== 'hidden' && hasLyrics(track),
    ...chordBands(measures, chordDisplay),
    hasDirections: isTop && hasDirections(song),
    hasPedals: hasPedals(measures),
    headingHeight: isTop ? ROW.heading : SYSTEM.staffSpacing + sheet.systems.trackSpacing,
    hasFreeTexts: hasFreeTexts(measures),
    hasLyricsAbove: sheet.lyrics === 'above',
    staffSpacing: sheet.systems.staffSpacing,
    // The whole track's room: each system's is as far as its own notes reach (`systemBands`).
    notationAbove: NOTATION.above,
    notationBelow: NOTATION.below,
    tabAbove: 0,
    tabBelow: 0,
    ...textBandHeights(sheet),
  };
}

/** The staves' plans of the last layout, to reuse those of the tracks an edit left alone (an edit keeps them identical). */
export interface PlanCache {
  /** Its stylesheet too: the bands follow the stylesheet. */
  readonly song: Song;
  readonly chordDisplay: ChordDisplay;
  readonly plans: readonly StaffPlan[];
}

/** A plan still holds when its staff shows the same track object, so drawn; the top staff's when the headers are the same too. */
function isPlanKept(cache: PlanCache, song: Song, spec: StaffSpec, staffIndex: number): boolean {
  const kept = cache.plans[staffIndex];
  return (
    kept !== undefined && kept.trackIndex === spec.trackIndex && kept.mode === spec.mode && cache.song.stylesheet === song.stylesheet &&
    cache.song.tracks[spec.trackIndex] === song.tracks[spec.trackIndex] && (staffIndex > 0 || cache.song.measureHeaders === song.measureHeaders)
  );
}

export function staffPlans(song: Song, specs: readonly StaffSpec[], chordDisplay: ChordDisplay, cache?: PlanCache): StaffPlan[] {
  const reusable = cache !== undefined && cache.chordDisplay === chordDisplay ? cache : undefined;
  return specs.flatMap((spec, staffIndex) => {
    const track = song.tracks[spec.trackIndex];
    const kept = reusable === undefined || !isPlanKept(reusable, song, spec, staffIndex) ? undefined : reusable.plans[staffIndex];
    if (kept !== undefined) {
      return [kept];
    }
    if (track === undefined) {
      return [];
    }
    const markLanes = tabMarkLanes(track.measures);
    const bands = staffBands(song, track, markLanes.length, staffIndex === 0, chordDisplay);
    return [{ ...spec, stringCount: track.strings.length, bands, markLanes }];
  });
}

/**
 * The staves one under the other; the last one of several keeps the gap before the next system, and the last one the
 * stylesheet's `systemSpacing` too.
 */
export function stackStaves(plans: readonly StaffPlan[], systemSpacing = 0): ScoreStaff[] {
  let top = 0;
  return plans.map((plan, staffIndex) => {
    const geometry = sharedGeometry(plan);
    const isLast = staffIndex === plans.length - 1;
    const gap = (isLast && plans.length > 1 ? SYSTEM.gap : 0) + (isLast ? systemSpacing : 0);
    const staff: ScoreStaff = { ...plan, geometry, hasHeading: staffIndex === 0, top, height: geometry.height + gap };
    top += staff.height;
    return staff;
  });
}

/** Geometries made lately, by what they are made from: the rows compare them by identity, so equal bands give the same object. */
const GEOMETRIES = new Map<string, RowGeometry>();
/** Past this many kinds of rows the cache starts again (a few per shown track are usual). */
const MAX_GEOMETRIES = 512;

function sharedGeometry(plan: StaffPlan): RowGeometry {
  // The bands are numbers and booleans: cheaper than JSON on every system of every layout.
  const key = `${plan.mode} ${plan.stringCount} ${Object.entries(plan.bands).join()}`;
  const kept = GEOMETRIES.get(key);
  if (kept !== undefined) {
    return kept;
  }
  if (GEOMETRIES.size >= MAX_GEOMETRIES) {
    GEOMETRIES.clear();
  }
  const geometry = rowGeometry(plan.mode, plan.stringCount, plan.bands);
  GEOMETRIES.set(key, geometry);
  return geometry;
}

/** The bands a staff makes room for in one system (`plan`: the track's staff), from that system's bars (`row`). */
export function systemBands(song: Song, plan: ScoreStaff, row: RowLayout): RowBands {
  const track = song.tracks[plan.trackIndex];
  return track === undefined ? plan.bands : { ...plan.bands, ...rowBands(song, plan, row) };
}

/** A system's staves: the layout's plans with the bands and mark lanes of the system's bars, stacked as `stackStaves` stacks them. */
function systemStaves(song: Song, staves: readonly ScoreStaff[], rows: readonly RowLayout[]): ScoreStaff[] {
  const plans = staves.map((staff, staffIndex): StaffPlan => {
    const { trackIndex, mode, stringCount } = staff;
    const row = rows[staffIndex] ?? { measures: [] };
    const track = song.tracks[trackIndex];
    const markLanes = track === undefined || !showsTab(mode) ? staff.markLanes : rowMarkLanes(track, row);
    return { trackIndex, mode, stringCount, markLanes, bands: systemBands(song, staff, row) };
  });
  return stackStaves(plans, stylesheetOf(song).systems.systemSpacing);
}

/** The bars of the last layout, kept to reuse those an edit left alone (an edit keeps untouched measures identical). */
export interface MeasureCache {
  readonly song: Song;
  readonly trackIndexes: readonly number[];
  readonly chordDisplay: ChordDisplay;
  readonly measures: readonly (readonly MeasureLayout[])[];
}

/** A bar's layout depends on its header and measures and the ones before them (signatures and key changes shown). */
function isSameBar(previous: Song, song: Song, trackIndexes: readonly number[], measureIndex: number): boolean {
  const isSame = (index: number) =>
    previous.measureHeaders[index] === song.measureHeaders[index] &&
    trackIndexes.every((trackIndex) => previous.tracks[trackIndex]?.measures[index] === song.tracks[trackIndex]?.measures[index]);
  return isSame(measureIndex) && isSame(measureIndex - 1);
}

/** Every bar laid out for the shown tracks together, `[measureIndex][staffIndex]`; `cache`'s bars reused where they still hold. */
export function scoreMeasures(song: Song, trackIndexes: readonly number[], chordDisplay: ChordDisplay, cache?: MeasureCache): (readonly MeasureLayout[])[] {
  // A beat with a chord is as wide as its diagram or name, so neighbouring chords do not overlap.
  const sheet = stylesheetOf(song);
  const nameSize = sheet.texts.chordName.size;
  const beatRoom = (beat: Parameters<typeof chordBeatWidth>[0]) => chordBeatWidth(beat, chordDisplay, nameSize);
  const cachedSheet = cache === undefined ? undefined : stylesheetOf(cache.song);
  const isSameSpacing = cachedSheet !== undefined && cachedSheet.noteSpacing === sheet.noteSpacing && cachedSheet.texts.chordName.size === nameSize;
  const reusable =
    cache !== undefined && isSameSpacing && cache.chordDisplay === chordDisplay && cache.trackIndexes.join() === trackIndexes.join() ? cache : undefined;
  return song.measureHeaders.map((_, measureIndex) => {
    const kept = reusable?.measures[measureIndex];
    return kept !== undefined && reusable !== undefined && isSameBar(reusable.song, song, trackIndexes, measureIndex)
      ? kept
      : layoutAlignedMeasures(song, trackIndexes, measureIndex, beatRoom);
  });
}

/** The stylesheet's track names of a system: the first's (full by default), the others' (short by default). */
function nameFormat(sheet: Stylesheet, isFirstSystem: boolean): TrackNameFormat {
  return isFirstSystem ? sheet.systems.firstSystemNames : sheet.systems.otherSystemNames;
}

/**
 * What a staff is labelled with: the track's name in full, or its short name — its own, else the name abbreviated
 * (gp-core `abbreviateTrackName`) — as the stylesheet's `format` says; '' when hidden.
 */
export function staffLabel(track: Pick<Track, 'name' | 'number' | 'shortName'>, isFirstSystem: boolean, format: TrackNameFormat = isFirstSystem ? 'full' : 'short'): string {
  if (format === 'hidden') {
    return '';
  }
  const name = track.name.trim() === '' ? t('common.trackNumber', { number: track.number }) : track.name.trim();
  return format === 'full' ? name : (track.shortName ?? abbreviateTrackName(name));
}

/** The names column: the longest label (at most SYSTEM.maxNameWidth), the gap and the bracket; none for one track. */
export function namesColumnWidth(song: Song, staves: readonly StaffSpec[], isFirstSystem: boolean): number {
  if (staves.length < 2) {
    return 0;
  }
  const sheet = stylesheetOf(song);
  const format = nameFormat(sheet, isFirstSystem);
  const widths = staves.map((staff) => {
    const track = song.tracks[staff.trackIndex];
    return track === undefined ? 0 : textWidth(staffLabel(track, isFirstSystem, format), sheet.texts.trackName.size);
  });
  return SYSTEM.margin + Math.min(SYSTEM.maxNameWidth, Math.max(0, ...widths)) + SYSTEM.nameGap + SYSTEM.bracketGap;
}

/** The track names a system's staves are labelled with (the stylesheet's format for that system). */
export function systemNameFormat(song: Song, systemIndex: number): TrackNameFormat {
  return nameFormat(stylesheetOf(song), systemIndex === 0);
}

/** Each staff's row of a system with its beats where Design Mode moved them. */
function withDesignedBeats(song: Song, staves: readonly ScoreStaff[], rows: readonly RowLayout[]): RowLayout[] {
  return rows.map((row, staffIndex) => {
    const track = song.tracks[staves[staffIndex]?.trackIndex ?? -1];
    const measures = row.measures.map((measure) => withBeatOffsets(measure, track, song.measureHeaders[measure.measureIndex]));
    return measures.every((measure, i) => measure === row.measures[i]) ? row : { measures };
  });
}

/**
 * The systems across `rowWidth` (layout points): the first one with the full names, the others with short ones; the
 * stylesheet's bars per system and Design Mode's system starts, bar widths and beat positions applied.
 */
export function scoreSystems(song: Song, staves: readonly ScoreStaff[], measures: readonly (readonly MeasureLayout[])[], rowWidth: number): Pick<ScoreLayout, 'systems' | 'clefWidth'> {
  const clefWidth = Math.max(0, ...staves.map((staff) => {
    const track = song.tracks[staff.trackIndex];
    return track === undefined ? 0 : rowHeaderWidth(staff.mode, track);
  }));
  const firstNames = namesColumnWidth(song, staves, true);
  const otherNames = namesColumnWidth(song, staves, false);
  const rules = { barsPerSystem: stylesheetOf(song).systems.barsPerSystem, headers: song.measureHeaders };
  const rows = rowWidth > 0 ? layoutAlignedRows(measures, rowWidth - clefWidth - otherNames, rowWidth - clefWidth - firstNames, rules) : [];
  let top = 0;
  const systems = rows.map((staffRows, systemIndex): ScoreSystem => {
    const namesWidth = systemIndex === 0 ? firstNames : otherNames;
    const designed = withDesignedBeats(song, staves, staffRows);
    const ownStaves = systemStaves(song, staves, designed);
    const system: ScoreSystem = { rows: designed, namesWidth, headerWidth: namesWidth + clefWidth, staves: ownStaves, top, height: systemHeightOf(ownStaves) };
    top += system.height;
    return system;
  });
  return { systems, clefWidth };
}

/** A system's height: its staves', with the room under the last one. */
export function systemHeightOf(staves: readonly ScoreStaff[]): number {
  return staves.reduce((sum, staff) => sum + staff.height, 0);
}

/** A staff group per shown track (in the order given), as every system stacks them: their height does not depend on the width. */
export function scoreStaves(song: Song, specs: readonly StaffSpec[], chordDisplay: ChordDisplay): ScoreStaff[] {
  return stackStaves(staffPlans(song, specs, chordDisplay), stylesheetOf(song).systems.systemSpacing);
}

/** The layout of staves already stacked (`scoreStaves`): the bars laid out for their tracks and broken into systems across `rowWidth`. */
export function layoutStaves(song: Song, staves: readonly ScoreStaff[], chordDisplay: ChordDisplay, rowWidth: number): ScoreLayout {
  const measures = scoreMeasures(song, staves.map((staff) => staff.trackIndex), chordDisplay);
  return { staves, ...scoreSystems(song, staves, measures, rowWidth) };
}

/**
 * The score's layout: a staff group per shown track (in the order given), the bars broken into systems across
 * `rowWidth`. With one track it is the single-track score: no names, no bracket, the rows as layoutRows makes them.
 */
export function layoutScore(song: Song, specs: readonly StaffSpec[], chordDisplay: ChordDisplay, rowWidth: number): ScoreLayout {
  return layoutStaves(song, scoreStaves(song, specs, chordDisplay), chordDisplay, rowWidth);
}
