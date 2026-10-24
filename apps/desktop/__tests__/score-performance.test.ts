import { readSong } from '@gp-editor/core';
import { layoutMeasure, layoutRows } from '../src/lib/layout';
import { SCORE_MODES, rowGeometry } from '../src/score/geometry';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { engraveRow, rowHeaderWidth } from '../src/score/row';
import { layoutScore } from '../src/score/score-layout';
import { engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { readFixture } from '../test-support/fixtures';
import { PALETTE } from '../test-support/score-helpers';

/** Generous budget for engraving a whole 224-bar track in Node; the app engraves only visible rows. */
const BUDGET_MS = 1500;

describe('score engraving performance', () => {
  const song = readSong(readFixture('guitarpro8', 'canon-audio-track.gp'));
  const track = song.tracks[0]!;

  it.each(SCORE_MODES)('engraves every row of a 224-bar track in %s mode within budget', (mode) => {
    // Arrange
    const measures = song.measureHeaders.map((_, i) => layoutMeasure(song, 0, i));
    const headerWidth = rowHeaderWidth(mode, track);
    const rows = layoutRows(measures, 1100 - headerWidth);
    const geometry = rowGeometry(mode, track.strings.length);

    // Act
    const started = Date.now();
    const commandCounts = rows.map((row) => engraveRow({ song, trackIndex: 0, row, headerWidth, mode, geometry, palette: PALETTE }).length);
    const elapsed = Date.now() - started;

    // Assert: one canvas per row instead of one native view per glyph
    expect(elapsed).toBeLessThan(BUDGET_MS);
    expect(rows.length).toBeLessThan(song.measureHeaders.length);
    expect(commandCounts.every((count) => count > 0)).toBe(true);
  });
});

describe('multitrack score performance', () => {
  // Every track shown, in Score + Tab: 11 tracks × 96 bars and 10 tracks × 216 bars.
  it.each([
    ['guitarpro5', 'nightwish.gp5'],
    ['guitarpro4', 'fade-to-black.gp4'],
  ])('lays out and engraves every staff of %s/%s within budget', (folder, name) => {
    // Arrange
    const multi = readSong(readFixture(folder, name));
    const specs = multi.tracks.map((_, trackIndex) => ({ trackIndex, mode: 'notationAndTab' as const }));

    // Act
    const started = Date.now();
    const layout = layoutScore(multi, specs, DEFAULT_CHORD_DISPLAY, 1100);
    const laidOut = Date.now();
    const counts = layout.systems.flatMap((system, systemIndex) =>
      layout.staves.map((staff, staffIndex) => {
        const context = {
          song: multi, trackIndex: staff.trackIndex, row: system.rows[staffIndex]!, headerWidth: layout.clefWidth, mode: staff.mode,
          geometry: staff.geometry, palette: PALETTE, markLanes: staff.markLanes, hasHeading: staff.hasHeading,
        };
        return engraveSystemStaff(context, staffDecor(multi, layout, systemIndex, staffIndex)!).length;
      }),
    );
    const engraved = Date.now();

    // Assert: the layout of all bars is quick (the app engraves only the staves in view)
    expect(laidOut - started).toBeLessThan(BUDGET_MS / 3);
    expect(engraved - laidOut).toBeLessThan(BUDGET_MS * 2);
    expect(counts.every((count) => count > 0)).toBe(true);
  });
});
