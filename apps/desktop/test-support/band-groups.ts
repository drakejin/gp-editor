// What each band of a score row draws, apart (the tests check that no band's ink runs into another's): every bar
// engraved as score/row.ts engraves it, its commands sorted by band. `bandGroups` checks it misses nothing row.ts draws.
import { type Song, isMeasureOverfull, stylesheetOf } from '@gp-editor/core';
import { isKeyboardTrack } from '../src/lib/fingering';
import { engraveChords } from '../src/score/chords';
import { engraveDirections } from '../src/score/directions';
import { type DrawCommand, translateCommands } from '../src/score/draw';
import { engraveDynamics } from '../src/score/dynamics';
import { engraveFreeTexts } from '../src/score/free-text';
import { showsTab } from '../src/score/geometry';
import { engraveHairpins } from '../src/score/hairpins';
import { engraveHeading } from '../src/score/heading';
import { type InkBox, inkBox } from '../src/score/ink';
import { engraveLyrics } from '../src/score/lyrics';
import { STAFF_HEIGHT, engraveNotationMeasure, engraveNotationRowHeader, staffLines } from '../src/score/notation';
import { engraveNotationExpressions } from '../src/score/notation-expressions';
import { engravePedals } from '../src/score/pedals';
import { type PlacedMeasure, type RowContext, engraveRow, placeRow } from '../src/score/row';
import { engraveTabMeasure, engraveTabRowHeader } from '../src/score/tab';

/** The bands, top to bottom as a row stacks them (lyrics above or below the staves; under a tab-only staff, its marks). */
export type BandName = 'heading' | 'directions' | 'freeTexts' | 'chords' | 'lyricsAbove' | 'notation' | 'lyrics' | 'dynamics' | 'pedals' | 'tab';

export interface BandGroup {
  readonly name: BandName;
  readonly commands: readonly DrawCommand[];
}

type Groups = Record<BandName, DrawCommand[]>;

function emptyGroups(): Groups {
  return { heading: [], directions: [], freeTexts: [], chords: [], lyricsAbove: [], notation: [], lyrics: [], dynamics: [], pedals: [], tab: [] };
}

/** One bar's commands by band, in the row's coordinates. */
function addBar(context: RowContext, song: Song, placed: PlacedMeasure, i: number, all: readonly PlacedMeasure[], groups: Groups): void {
  const track = song.tracks[context.trackIndex];
  const isRowStart = i === 0;
  const layout = isRowStart ? { ...placed.layout, keySignatureX: undefined } : placed.layout;
  const header = song.measureHeaders[layout.measureIndex];
  const measure = track?.measures[layout.measureIndex];
  if (track === undefined || header === undefined || measure === undefined) {
    return;
  }
  const { geometry, palette } = context;
  const sheet = stylesheetOf(song);
  const next = all[i + 1]?.layout;
  const nextHeader = next?.measureIndex === layout.measureIndex + 1 ? song.measureHeaders[next.measureIndex] : undefined;
  const nextInRow = next === undefined || nextHeader === undefined ? undefined : { header: nextHeader, layout: next };
  const previousMeasure = track.measures[layout.measureIndex - 1];
  const nextMeasure = track.measures[layout.measureIndex + 1];
  const put = (name: BandName, commands: readonly DrawCommand[]) => groups[name].push(...translateCommands(commands, placed.x, 0));
  if (context.hasHeading !== false) {
    const style = { barNumbers: sheet.barNumbers, isRowStart, barNumber: sheet.texts.barNumber, tempo: sheet.texts.tempo, showsTempoDecimals: sheet.notation.showsTempoDecimals };
    put('heading', engraveHeading(header, layout, palette, isMeasureOverfull(measure, header), style));
  }
  if (geometry.freeTextY !== undefined) {
    put('freeTexts', engraveFreeTexts({ measure, layout, y: geometry.freeTextY, palette, style: sheet.texts.freeText }));
  }
  put('chords', engraveChords({ measure, layout, namesY: geometry.chordNamesY, diagramsTop: geometry.chordDiagramsTop, palette, style: sheet.texts.chordName }));
  const { notationTop, tabTop, marksY, dynamicsY, pedalsY, lyricsY, directionsY } = geometry;
  const notation = notationTop === undefined ? undefined : engraveNotationMeasure({
    track, header, measure, layout, previousMeasure, nextMeasure, nextInRow, isRowStart, top: notationTop, palette, showsPickStrokes: !showsTab(context.mode),
    isKeyboard: isKeyboardTrack(song, context.trackIndex), editedVoiceIndex: context.editedVoiceIndex, showsCommonTime: sheet.notation.showsCommonTime,
  });
  put('notation', notation ?? []);
  if (dynamicsY !== undefined) {
    const isUnderLyrics = lyricsY !== undefined && notationTop !== undefined && lyricsY > notationTop;
    const staff = notation === undefined || notationTop === undefined || isUnderLyrics ? undefined : { commands: notation, bottomLine: notationTop + STAFF_HEIGHT };
    put('dynamics', engraveDynamics({ measures: track.measures, measureIndex: layout.measureIndex, layout, y: dynamicsY, palette, staff }));
    put('dynamics', engraveHairpins({ measures: track.measures, measureIndex: layout.measureIndex, layout, y: dynamicsY, palette }));
  }
  if (notationTop !== undefined && tabTop === undefined) {
    put('notation', engraveNotationExpressions(measure, layout, notationTop, palette, sheet.notation));
  }
  if (directionsY !== undefined) {
    put('directions', engraveDirections(header, layout.width, directionsY, palette));
  }
  if (pedalsY !== undefined) {
    put('pedals', engravePedals({ measures: track.measures, measureIndex: layout.measureIndex, header, layout, y: pedalsY, palette }));
  }
  if (lyricsY !== undefined) {
    const isAbove = notationTop === undefined ? lyricsY < (tabTop ?? 0) : lyricsY < notationTop;
    put(isAbove ? 'lyricsAbove' : 'lyrics', engraveLyrics({ track, layout, y: lyricsY, palette, style: sheet.texts.lyrics }));
  }
  if (tabTop !== undefined && marksY !== undefined) {
    put('tab', engraveTabMeasure({
      track, header, measure, layout, previousBeat: previousMeasure?.beats[previousMeasure.beats.length - 1], previousMeasure, nextMeasure, nextInRow, isRowStart,
      markLanes: context.markLanes, top: tabTop, marksY, showRhythm: context.mode === 'tab', palette, editedVoiceIndex: context.editedVoiceIndex, notation: sheet.notation,
    }));
  }
}

/**
 * The row's commands by band (no cursor, nothing playing, nothing selected). The row header's staff lines go with their
 * staves; the line at the row's start, which runs from the top staff to the bottom one, is left out.
 */
export function bandGroups(context: RowContext): BandGroup[] {
  const { song, geometry, palette } = context;
  const track = song.tracks[context.trackIndex];
  const groups = emptyGroups();
  const placed = placeRow(context.row, context.headerWidth);
  const first = track?.measures[placed[0]?.layout.measureIndex ?? 0];
  if (track !== undefined && first !== undefined && geometry.notationTop !== undefined) {
    groups.notation.push(...staffLines(0, context.headerWidth, geometry.notationTop, palette.line), ...engraveNotationRowHeader(track, first, geometry.notationTop, palette));
  }
  if (track !== undefined && geometry.tabTop !== undefined) {
    groups.tab.push(...engraveTabRowHeader(track, geometry.tabTop, palette));
  }
  placed.forEach((measure, i) => addBar(context, song, measure, i, placed, groups));
  return (Object.keys(groups) as BandName[]).map((name) => ({ name, commands: groups[name] }));
}

/** How many commands engraveRow draws that `bandGroups` leaves out: the row start's line and the tab header's string lines. */
export function leftOutOfGroups(context: RowContext): number {
  const track = context.song.tracks[context.trackIndex];
  return 1 + (context.geometry.tabTop === undefined ? 0 : (track?.strings.length ?? 0));
}

/** The commands' ink boxes, and the whole group's. */
export function inkBoxes(commands: readonly DrawCommand[]): { readonly boxes: InkBox[]; readonly extent?: InkBox } {
  const boxes = commands.map(inkBox);
  if (boxes.length === 0) {
    return { boxes };
  }
  const extent = boxes.reduce((all, box) => ({
    left: Math.min(all.left, box.left), right: Math.max(all.right, box.right), top: Math.min(all.top, box.top), bottom: Math.max(all.bottom, box.bottom),
  }));
  return { boxes, extent };
}

/** The total engraveRow draws, to check the groups miss nothing. */
export function rowCommandCount(context: RowContext): number {
  return engraveRow(context).length;
}
