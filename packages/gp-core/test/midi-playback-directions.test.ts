import { describe, expect, it } from 'vitest';
import { readSong, renderMidi, type MusicalDirection, type Song } from '../src/index';
import { buildPlaybackOrder } from '../src/midi/playback-order';
import { loadFixture } from './helpers/fixtures';
import { type HeaderSpec, makeSong } from './helpers/midi-song';
import { toTux } from './helpers/ticks';

/** A bar with directions (and other header fields). */
const bar = (directions: readonly MusicalDirection[] = [], extra: HeaderSpec = {}): HeaderSpec => ({ ...extra, ...(directions.length === 0 ? {} : { directions }) });

function songOf(...headers: readonly HeaderSpec[]): Song {
  return makeSong({ headers, tracks: [{ measures: [] }] });
}

function order(song: Song, fromHeaderIndex = 0): number[] {
  return buildPlaybackOrder(song.measureHeaders, fromHeaderIndex).map((measure) => measure.headerIndex);
}

/** Where each played measure sounds, in TuxGuitar ticks. */
function sequenceTicks(song: Song): number[] {
  return buildPlaybackOrder(song.measureHeaders, 0).map((measure) => toTux((song.measureHeaders[measure.headerIndex]?.start ?? Number.NaN) + measure.move));
}

describe('buildPlaybackOrder: musical directions', () => {
  it('plays a D.S. al Coda back to the segno, on to the Da Coda, then the coda — each measure right after the one before', () => {
    // Arrange
    const song = songOf(bar(), bar(['segno']), bar(['daCoda']), bar(['daSegnoAlCoda']), bar(['coda']), bar());

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 2, 3, 1, 2, 4, 5]);
    expect(sequenceTicks(song)).toEqual([960, 4800, 8640, 12480, 16320, 20160, 24000, 27840]);
  });

  it('plays a D.C. al Fine from the start to the fine', () => {
    const song = songOf(bar(), bar(['fine']), bar(), bar(['daCapoAlFine']));
    expect(order(song)).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it('plays a plain D.C. from the start to the end, once', () => {
    const song = songOf(bar(), bar(), bar(['daCapo']));
    expect(order(song)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('plays a D.S.S. al Double Coda from the segno segno to the Da Double Coda, then the double coda', () => {
    const song = songOf(bar(), bar(['segnoSegno']), bar(['daDoubleCoda']), bar(['daSegnoSegnoAlDoubleCoda']), bar(['doubleCoda']));
    expect(order(song)).toEqual([0, 1, 2, 3, 1, 2, 4]);
  });

  it('does not take repeats again after a jump', () => {
    const song = songOf(bar([], { repeatOpen: true }), bar([], { repeatClose: 1 }), bar(['daCapo']));
    expect(order(song)).toEqual([0, 1, 0, 1, 2, 0, 1, 2]);
  });

  it('takes the last ending after a jump, skipping the endings that go back', () => {
    // Arrange: |: 1 | [1. 2 :| [2. 3 | 4 D.C.
    const song = songOf(bar([], { repeatOpen: true }), bar([], { repeatAlternative: 1, repeatClose: 1 }), bar([], { repeatAlternative: 2 }), bar(['daCapo']));

    // Act / Assert
    expect(order(song)).toEqual([0, 1, 0, 2, 3, 0, 2, 3]);
    expect(sequenceTicks(song)).toEqual([960, 4800, 8640, 12480, 16320, 20160, 24000, 27840]);
  });

  it('plays the repeats of the coda after the coda jump', () => {
    const song = songOf(bar(['segno']), bar(['daCoda']), bar(['daSegnoAlCoda']), bar(['coda'], { repeatOpen: true }), bar([], { repeatClose: 1 }));
    expect(order(song)).toEqual([0, 1, 2, 0, 1, 3, 4, 3, 4]);
  });

  it('ignores a jump whose target is missing, a Da Coda and a fine played the first time', () => {
    const song = songOf(bar(['fine']), bar(['daCoda']), bar(['daSegno']), bar());
    expect(order(song)).toEqual([0, 1, 2, 3]);
  });

  it('takes a D.C. from a bar after the start of playback back to the first bar', () => {
    const song = songOf(bar(), bar(), bar(['daCapo']));
    expect(order(song, 1)).toEqual([1, 2, 0, 1, 2]);
  });

  it('plays every bar of directions.gp: the D.C. on bar 2 first, then on to the end', () => {
    const song = readSong(loadFixture('guitarpro8', 'directions.gp'));
    expect(order(song)).toEqual([0, 1, 0, 1, 2, 3, 4, 5]);
  });

  it('plays a practice loop as written, without the jumps', () => {
    // Arrange
    const song = songOf(bar(['segno']), bar(), bar(['daSegno']), bar());

    // Act
    const render = renderMidi(song, { fromHeaderIndex: 0, toHeaderIndex: 2 });

    // Assert
    expect(render.timeline.map((entry) => entry.headerIndex)).toEqual([0, 1, 2]);
  });

  it('follows the jumps in the timeline of a whole-song render', () => {
    const song = songOf(bar(['segno']), bar(), bar(['daSegnoAlFine']), bar(['fine']));
    expect(renderMidi(song).timeline.map((entry) => entry.headerIndex)).toEqual([0, 1, 2, 0, 1, 2, 3]);
  });
});
