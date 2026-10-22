import { describe, expect, it } from 'vitest';
import { readSong, type Song } from '../src/index';
import { buildPlaybackOrder } from '../src/midi/playback-order';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { makeSong } from './helpers/midi-song';

function read(folder: FixtureFolder, name: string): Song {
  return readSong(loadFixture(folder, name));
}

function order(song: Song, fromHeaderIndex = 0): number[] {
  return buildPlaybackOrder(song.measureHeaders, fromHeaderIndex).map((measure) => measure.headerIndex);
}

/** Sequence tick (header start + repeat move) of every played measure. */
function sequenceTicks(song: Song, fromHeaderIndex = 0): number[] {
  return buildPlaybackOrder(song.measureHeaders, fromHeaderIndex).map(
    (measure) => (song.measureHeaders[measure.headerIndex]?.start ?? Number.NaN) + measure.move,
  );
}

describe('buildPlaybackOrder (MidiRepeatController)', () => {
  it('plays a song without repeats once, in order, without moves', () => {
    // Arrange
    const song = makeSong({ headers: [{}, {}, {}], tracks: [{ measures: [] }] });

    // Act
    const played = buildPlaybackOrder(song.measureHeaders, 0);

    // Assert
    expect(played).toEqual([
      { headerIndex: 0, move: 0 },
      { headerIndex: 1, move: 0 },
      { headerIndex: 2, move: 0 },
    ]);
  });

  it('repeats repeat-close.gp5 once (|: 1 2 :| 3)', () => {
    // Arrange
    const song = read('guitarpro5', 'repeat-close.gp5');

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 0, 1, 2]);
    expect(sequenceTicks(song)).toEqual([960, 4800, 8640, 12480, 16320]);
  });

  it('repeats repeat-close-multi.gp5 three more times', () => {
    // Arrange
    const song = read('guitarpro5', 'repeat-close-multi.gp5');

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 2]);
  });

  it('treats the first measure as an open repeat when the file has none', () => {
    // Arrange
    const song = read('guitarpro5', 'repeat-close-without-start-at-beginning.gp5');

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 0, 1]);
  });

  it.each([
    ['guitarpro5', 'repeat-close-alternate-endings.gp5'],
    ['guitarpro6', 'repeat-close-alternate-endings.gpx'],
    ['guitarpro7', 'repeat-close-alternate-endings.gp'],
  ] as const)('follows TuxGuitar through the alternate endings of %s/%s', (folder, name) => {
    // Arrange: endings 1+3 on measure 2, ending 2 on measure 3, repeat close x3 on measure 4.
    const song = read(folder, name);

    // Act / Assert: TuxGuitar keeps an alternative open until the next repeat close.
    expect(order(song)).toEqual([0, 1, 2, 3, 0, 4]);
    expect(sequenceTicks(song)).toEqual([960, 1920, 2880, 3840, 4800, 5760]);
  });

  it('plays first and second endings of a classic volta', () => {
    // Arrange
    const song = makeSong({
      headers: [{ repeatOpen: true }, { repeatAlternative: 1, repeatClose: 1 }, { repeatAlternative: 2 }, {}],
      tracks: [{ measures: [] }],
    });

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 0, 2, 3]);
    expect(sequenceTicks(song)).toEqual([960, 4800, 8640, 12480, 16320]);
  });

  it('ignores a repeat close once its repeat has been played out, until a new repeat opens', () => {
    // Arrange
    const song = makeSong({
      headers: [{ repeatClose: 1 }, { repeatClose: 1 }, { repeatOpen: true }, { repeatClose: 1 }],
      tracks: [{ measures: [] }],
    });

    // Act / Assert
    expect(order(song)).toEqual([0, 0, 1, 2, 3, 2, 3]);
  });

  it('skips the measures before fromHeaderIndex and starts their moves from zero', () => {
    // Arrange
    const song = makeSong({ headers: [{ repeatOpen: true }, { repeatClose: 1 }, {}, {}], tracks: [{ measures: [] }] });

    // Act
    const played = buildPlaybackOrder(song.measureHeaders, 2);

    // Assert
    expect(played).toEqual([
      { headerIndex: 2, move: 0 },
      { headerIndex: 3, move: 0 },
    ]);
  });

  it('opens a repeat at fromHeaderIndex when starting inside a repeated section', () => {
    // Arrange
    const song = read('guitarpro5', 'repeat-close.gp5');

    // Act / Assert
    expect(order(song, 1)).toEqual([1, 1, 2]);
    expect(sequenceTicks(song, 1)).toEqual([4800, 8640, 12480]);
  });

  it('returns nothing for a song without measures', () => {
    // Act / Assert
    expect(buildPlaybackOrder([], 0)).toEqual([]);
  });
});
