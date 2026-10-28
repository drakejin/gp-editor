// Every row of a fixture's score, checked band by band: no band's ink runs into another's, every band stays on the
// row's canvas, the bands hold everything the row draws (bandGroups), and every music glyph drawn has its measured ink.
// Used by the row-bands sweeps.
import { type Song, readSong } from '@gp-editor/core';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { type ScoreMode, showsNotation } from '../src/score/geometry';
import type { InkBox } from '../src/score/ink';
import { GLYPH_INK } from '../src/score/symbols/glyph-ink';
import type { RowContext } from '../src/score/row';
import { type ScoreLayout, type StaffSpec, layoutScore } from '../src/score/score-layout';
import { type BandGroup, type BandName, bandGroups, inkBoxes, leftOutOfGroups, rowCommandCount } from './band-groups';
import { listFixtures, readFixture } from './fixtures';
import { PALETTE } from './score-helpers';

/** Ink may touch, not overlap: this much is rounding in the ink's estimate. */
const TOLERANCE = 0.5;

/** The bands top to bottom: over the staves, the notation, what goes under it, the tab. */
const ORDER: readonly BandName[] = ['heading', 'directions', 'freeTexts', 'chords', 'lyricsAbove', 'notation', 'lyrics', 'dynamics', 'pedals', 'tab'];
/** Without notation, the lyrics, dynamics and pedal go under the tab. */
const TAB_ONLY_ORDER: readonly BandName[] = ['heading', 'directions', 'freeTexts', 'chords', 'lyricsAbove', 'tab', 'lyrics', 'dynamics', 'pedals'];

const overlaps = (a: InkBox, b: InkBox): boolean =>
  a.right > b.left + TOLERANCE && b.right > a.left + TOLERANCE && a.bottom > b.top + TOLERANCE && b.bottom > a.top + TOLERANCE;

interface Inked {
  readonly name: BandName;
  readonly boxes: readonly InkBox[];
  readonly extent?: InkBox;
}

/** Where band `upper` (drawn above) runs into band `lower`; undefined when it does not. */
function clash(upper: Inked, lower: Inked): string | undefined {
  if (upper.extent === undefined || lower.extent === undefined || upper.extent.bottom <= lower.extent.top + TOLERANCE) {
    return undefined;
  }
  for (const a of upper.boxes) {
    const b = lower.boxes.find((other) => overlaps(a, other));
    if (b !== undefined) {
      return `${upper.name} [${a.left.toFixed(1)}, ${a.top.toFixed(1)}–${a.bottom.toFixed(1)}] runs into ${lower.name} [${b.left.toFixed(1)}, ${b.top.toFixed(1)}–${b.bottom.toFixed(1)}]`;
    }
  }
  return undefined;
}

/** What is wrong with one staff of one system: clashes, ink off the canvas, commands no band holds. */
export function rowProblems(context: RowContext, height: number): string[] {
  const groups = bandGroups(context);
  const drawn = groups.reduce((sum, group) => sum + group.commands.length, 0) + leftOutOfGroups(context);
  const order = showsNotation(context.mode) ? ORDER : TAB_ONLY_ORDER;
  const byName = new Map<BandName, BandGroup>(groups.map((group) => [group.name, group]));
  const inked: Inked[] = order.flatMap((name) => {
    const commands = byName.get(name)?.commands ?? [];
    return commands.length === 0 ? [] : [{ name, ...inkBoxes(commands) }];
  });
  const problems = inked.flatMap((upper, i) => inked.slice(i + 1).flatMap((lower) => clash(upper, lower) ?? []));
  const offCanvas = inked.filter((group) => (group.extent?.top ?? 0) < -TOLERANCE || (group.extent?.bottom ?? 0) > height + TOLERANCE);
  const count = rowCommandCount(context);
  const unmeasured = [...new Set(groups.flatMap((group) => group.commands.flatMap((command) => (command.kind === 'text' && command.font === 'music' ? [...command.text] : []))))]
    .filter((char) => GLYPH_INK[char.codePointAt(0) ?? 0] === undefined);
  return [
    ...problems,
    ...unmeasured.map((char) => `the glyph U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()} is not in GLYPH_INK (scripts/glyph-ink/run.sh)`),
    ...offCanvas.map((group) => `${group.name} reaches ${group.extent?.top.toFixed(1)}–${group.extent?.bottom.toFixed(1)} on a canvas ${height.toFixed(1)} tall`),
    ...(drawn === count ? [] : [`the bands hold ${drawn} commands, the row draws ${count}`]),
  ];
}

function layoutProblems(song: Song, layout: ScoreLayout): string[] {
  return layout.systems.flatMap((system, systemIndex) =>
    system.staves.flatMap((staff, staffIndex) => {
      const row = system.rows[staffIndex];
      if (row === undefined) {
        return [];
      }
      // A multitrack system's names column is left of the row; its decor is drawn apart (system-staff.ts).
      const context: RowContext = {
        song, trackIndex: staff.trackIndex, row, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PALETTE,
        markLanes: staff.markLanes, hasHeading: staff.hasHeading,
      };
      return rowProblems(context, staff.height).map((problem) => `system ${systemIndex + 1}, staff ${staffIndex + 1}: ${problem}`);
    }),
  );
}

const MODES: readonly ScoreMode[] = ['notationAndTab', 'notation', 'tab'];

/** The score layouts a fixture is checked in: its first track in each mode, every track, and its tracks together. */
function checkedLayouts(song: Song): readonly (readonly [string, readonly StaffSpec[], number])[] {
  const single = MODES.map((mode, i) => [`track 1 ${mode}`, [{ trackIndex: 0, mode }], 900 + i * 100] as const);
  // A bar's bands are measured once, whatever the width: narrow and wide rows break and stretch it otherwise.
  const widths = [650, 1600].map((width) => [`track 1 at ${width}`, [{ trackIndex: 0, mode: 'notationAndTab' as const }], width] as const);
  const others = song.tracks.slice(1).map((_, i) => [`track ${i + 2}`, [{ trackIndex: i + 1, mode: 'notationAndTab' as const }], 1000] as const);
  const mixed = song.tracks.map((_, trackIndex): StaffSpec => ({ trackIndex, mode: MODES[trackIndex % 3] ?? 'tab' }));
  return [...single, ...widths, ...others, ...(song.tracks.length > 1 ? [['multitrack', mixed, 1300] as const] : [])];
}

/** Every problem of every fixture in the folders, as "<file> <layout>, system …: …". */
export function fixtureBandProblems(folders: readonly string[]): string[] {
  return folders.flatMap((folder) =>
    listFixtures(folder).flatMap((name) => {
      let song: Song;
      try {
        song = readSong(readFixture(folder, name));
      } catch {
        return [];
      }
      return checkedLayouts(song).flatMap(([label, specs, width]) =>
        layoutProblems(song, layoutScore(song, specs, DEFAULT_CHORD_DISPLAY, width)).map((problem) => `${folder}/${name} ${label}, ${problem}`),
      );
    }),
  );
}
