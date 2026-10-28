import { type Measure, type Song, type Track, isPedalDownBefore } from '@gp-editor/core';
import type { RowLayout } from '../lib/layout';
import { chordBands } from './chords';
import { dynamicMarks } from './dynamics';
import { hasFreeTexts } from './free-text';
import { ROW, type RowBands, type ScoreMode, showsNotation, showsTab } from './geometry';
import { barsWithSyllables } from './lyrics';
import { notationReach, tabReach } from './staff-reach';
import { hasPedals } from './pedals';
import { hasBends } from './symbols/bends';
import { TAB_MARK_KINDS, type TabMarkKind, tabMarkLanes } from './tab';

/**
 * A row makes room only for what its own bars hold (Guitar Pro and alphaTab space each system by its content): every
 * band the track has (its staff's `bands`, the track's) only where the row puts something in it, the heading as tall as
 * what it shows, and the notation's room above and below the staff as far as its ink reaches.
 */

/** The notation's room above and below its staff, besides how far its ink reaches: the least, and the clearance. */
export const NOTATION_ROOM = {
  minAbove: 8,
  minBelow: 8,
  /** Between the ink and the band's edge: what the next band draws keeps this far away. */
  clearance: 2,
} as const;

/** What `rowBands` needs of the staff: its track, mode and the track's bands; the heading on the system's top staff. */
export interface RowStaff {
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly bands: RowBands;
  readonly hasHeading: boolean;
}

function rowMeasures(track: Track, row: RowLayout): Measure[] {
  return row.measures.flatMap((layout) => {
    const measure = track.measures[layout.measureIndex];
    return measure === undefined ? [] : [measure];
  });
}

/** Each bar's kinds of effect marks (`tabMarkLanes` of the bar alone), kept while the bar stays the same. */
const BAR_MARKS = new WeakMap<Measure, readonly TabMarkKind[]>();

function barMarks(measure: Measure): readonly TabMarkKind[] {
  const kept = BAR_MARKS.get(measure);
  if (kept !== undefined) {
    return kept;
  }
  const kinds = tabMarkLanes([measure]);
  BAR_MARKS.set(measure, kinds);
  return kinds;
}

/** The effect-mark lanes of the row's bars (their kinds in `tabMarkLanes`' order): its marks stack as its own bars need. */
export function rowMarkLanes(track: Track, row: RowLayout): TabMarkKind[] {
  const kinds = new Set(rowMeasures(track, row).flatMap(barMarks));
  return TAB_MARK_KINDS.filter((kind) => kinds.has(kind));
}

/** A dynamic mark or a hairpin under one of the row's beats. */
function hasRowDynamics(track: Track, row: RowLayout): boolean {
  return row.measures.some((layout) => {
    const measure = track.measures[layout.measureIndex];
    return dynamicMarks(track.measures, layout.measureIndex).length > 0 || (measure?.beats.some((beat) => beat.hairpin !== undefined) ?? false);
  });
}

/** Ped. or ✱ in the row's bars, or a pedal held into its first bar. */
function hasRowPedals(track: Track, row: RowLayout, measures: readonly Measure[]): boolean {
  const first = row.measures[0]?.measureIndex;
  return hasPedals(measures) || (first !== undefined && isPedalDownBefore(track.measures, first));
}

/** The heading's room: the whole band for a tempo, triplet feel, ending or repeat count; else the bar number's line. */
function headingHeight(song: Song, row: RowLayout): number {
  const isTall = row.measures.some((layout) => {
    const header = song.measureHeaders[layout.measureIndex];
    return layout.showTempo || layout.showTripletFeel || (header !== undefined && (header.repeatAlternative > 0 || header.repeatClose > 0));
  });
  return isTall ? ROW.heading : ROW.headingCompact;
}

/** The notation's room above and below the staff: its ink's reach and the clearance, at least the least room. */
function notationRooms(song: Song, staff: RowStaff, row: RowLayout): Partial<Pick<RowBands, 'notationAbove' | 'notationBelow'>> {
  if (!showsNotation(staff.mode)) {
    return {};
  }
  const reach = notationReach(song, staff.trackIndex, staff.mode, row);
  return {
    notationAbove: Math.max(NOTATION_ROOM.minAbove, reach.above + NOTATION_ROOM.clearance),
    notationBelow: Math.max(NOTATION_ROOM.minBelow, reach.below + NOTATION_ROOM.clearance),
  };
}

/** The room over and under the tab: as far as its ink reaches past its strings (its marks have their lanes), and the clearance. */
function tabRooms(song: Song, staff: RowStaff, row: RowLayout): Partial<Pick<RowBands, 'tabAbove' | 'tabBelow'>> {
  if (!showsTab(staff.mode)) {
    return {};
  }
  const reach = tabReach(song, staff.trackIndex, staff.mode, row);
  return { tabAbove: reach.above + NOTATION_ROOM.clearance, tabBelow: reach.below + NOTATION_ROOM.clearance };
}

/** The bands of a staff in one system (`systemBands`): the track's own, each kept only where the system's bars use it. */
export function rowBands(song: Song, staff: RowStaff, row: RowLayout): Partial<RowBands> {
  const track = song.tracks[staff.trackIndex];
  if (track === undefined) {
    return {};
  }
  const { bands } = staff;
  const measures = rowMeasures(track, row);
  const chords = chordBands(measures, { showsNames: bands.hasChordNames, showsDiagrams: bands.hasChordDiagrams });
  return {
    markLaneCount: rowMarkLanes(track, row).length,
    hasBends: bands.hasBends && hasBends(measures),
    hasDynamics: bands.hasDynamics && hasRowDynamics(track, row),
    hasLyrics: bands.hasLyrics && row.measures.some((layout) => barsWithSyllables(track).has(layout.measureIndex)),
    ...chords,
    hasDirections: bands.hasDirections && row.measures.some((layout) => (song.measureHeaders[layout.measureIndex]?.directions?.length ?? 0) > 0),
    hasPedals: bands.hasPedals && hasRowPedals(track, row, measures),
    hasFreeTexts: bands.hasFreeTexts && hasFreeTexts(measures),
    ...(staff.hasHeading ? { headingHeight: headingHeight(song, row) } : {}),
    ...notationRooms(song, staff, row),
    ...tabRooms(song, staff, row),
  };
}
