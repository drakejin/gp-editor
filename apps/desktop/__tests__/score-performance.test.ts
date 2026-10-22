import { readSong } from '@gp-editor/core';
import { layoutMeasure, layoutRows } from '../src/lib/layout';
import { SCORE_MODES, rowGeometry } from '../src/score/geometry';
import { engraveRow, rowHeaderWidth } from '../src/score/row';
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
