import { isSameRow, type ScoreRowProps } from '../src/components/ScoreRow';
import { layoutMeasure } from '../src/lib/layout';
import { rowGeometry } from '../src/score/geometry';
import { beat, header, makeSong, note } from '../test-support/songs';
import { PALETTE } from '../test-support/score-helpers';

function rowProps(): ScoreRowProps {
  const song = makeSong([[beat(960, [note(1, 3, { palmMute: true })])]]);
  return {
    song, trackIndex: 0, row: { measures: [layoutMeasure(song, 0, 0)] }, width: 800, headerWidth: 40,
    mode: 'notationAndTab', geometry: rowGeometry('notationAndTab', 6), palette: PALETTE,
    markLanes: ['palmMute'], zoom: 1, onPress: () => undefined,
  };
}

describe('isSameRow', () => {
  it('keeps a row when the mark lanes are rebuilt with the same kinds after an edit elsewhere', () => {
    // Arrange
    const before = rowProps();

    // Act
    const after: ScoreRowProps = { ...before, markLanes: [...(before.markLanes ?? [])] };

    // Assert
    expect(isSameRow(before, after)).toBe(true);
  });

  it('redraws a row when the zoom changes', () => {
    const before = rowProps();
    expect(isSameRow(before, { ...before, zoom: 1.25 })).toBe(false);
  });

  it('redraws a row when the mark lanes change', () => {
    const before = rowProps();
    expect(isSameRow(before, { ...before, markLanes: ['palmMute', 'letRing'] })).toBe(false);
    expect(isSameRow(before, { ...before, markLanes: [] })).toBe(false);
  });

  it('redraws a row when the dynamic it starts in changes several bars before it', () => {
    // Arrange: bar 1 at p, bars 2 and 3 empty, the row holds bar 4 (at f, so it shows "f" after the p)
    const quiet = { ...note(1, 3), velocity: 47 };
    const song = makeSong([[beat(960, [quiet])], [], [], [beat(header(4).start, [note(1, 3)])]]);
    const before: ScoreRowProps = {
      ...rowProps(), song, row: { measures: [layoutMeasure(song, 0, 3)] }, geometry: rowGeometry('notationAndTab', 6, { hasDynamics: true }),
    };
    const track = song.tracks[0]!;
    const louder = { ...song, tracks: [{ ...track, measures: [{ ...track.measures[0]!, beats: [beat(960, [note(1, 3)])] }, ...track.measures.slice(1)] }] };

    // Act
    const same = isSameRow(before, { ...before, song: louder });

    // Assert
    expect(same).toBe(false);
  });

  it('keeps a row whose dynamic before it is unchanged by an edit elsewhere', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3)])], [], [beat(header(3).start, [note(1, 5)])]]);
    const before: ScoreRowProps = {
      ...rowProps(), song, row: { measures: [layoutMeasure(song, 0, 2)] }, geometry: rowGeometry('notationAndTab', 6, { hasDynamics: true }),
    };
    const track = song.tracks[0]!;
    const refretted = { ...song, tracks: [{ ...track, measures: [{ ...track.measures[0]!, beats: [beat(960, [note(1, 7)])] }, ...track.measures.slice(1)] }] };

    // Act
    const same = isSameRow(before, { ...before, song: refretted });

    // Assert
    expect(same).toBe(true);
  });

  it('redraws a row when its selected beats change, and keeps it for the same beats', () => {
    // Arrange
    const before: ScoreRowProps = { ...rowProps(), selection: { first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 1 } } };

    // Act
    const grown: ScoreRowProps = { ...before, selection: { first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 2 } } };
    const same: ScoreRowProps = { ...before, selection: { first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 1 } } };

    // Assert
    expect(isSameRow(before, grown)).toBe(false);
    expect(isSameRow(before, { ...before, selection: undefined })).toBe(false);
    expect(isSameRow(before, same)).toBe(true);
  });
});
