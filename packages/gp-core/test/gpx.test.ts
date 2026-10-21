import { describe, expect, it } from 'vitest';
import { type Beat, GpFormatError, type Song, readSong } from '../src/index';
import { assertSongInvariants } from './helpers/invariants';
import { listFixtures, loadFixture } from './helpers/fixtures';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} (length ${items.length})`);
  }
  return item;
}

function beatAt(song: Song, measure: number, beat: number, track = 0): Beat {
  return at(at(at(song.tracks, track).measures, measure).beats, beat);
}

function read(name: string): Song {
  return readSong(loadFixture('guitarpro6', name));
}

describe('Guitar Pro 6 (.gpx) fixture sweep', () => {
  const names = listFixtures('guitarpro6');

  it('has fixtures', () => {
    expect(names.length).toBe(35);
  });

  it.each(names)('%s parses and passes the song invariants', (name) => {
    // Act
    const song = read(name);

    // Assert
    expect(song.source.format).toBe('gpx');
    assertSongInvariants(song);
  });
});

describe('Guitar Pro 6 (.gpx) values', () => {
  it('reports the GPIF revision as the version', () => {
    expect(read('notes.gpx').source).toEqual({ format: 'gpx', version: 'r11686' });
  });

  it('bends: TuxGuitar points in quarter tones over 12 positions', () => {
    // Act
    const song = read('bends.gpx');

    // Assert
    const bendOf = (measure: number, beat: number) =>
      at(at(beatAt(song, measure, beat).voices, 0).notes, 0).effect.bend?.points;
    const full = [
      { position: 0, value: 0 },
      { position: 12, value: 4 },
    ];
    expect(bendOf(0, 0)).toEqual(full);
    expect(bendOf(0, 1)).toEqual(full);
    expect(bendOf(1, 0)).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: 12 },
      { position: 6, value: 12 },
      { position: 12, value: 6 },
    ]);
  });

  it('tremolo: whammy bar points in quarter tones, as TuxGuitar places them', () => {
    // Act
    const song = read('tremolo.gpx');

    // Assert
    const whammyOf = (measure: number) =>
      at(at(beatAt(song, measure, 0).voices, 0).notes, 0).effect.tremoloBar?.points.map((p) => [p.position, p.value]);
    expect(whammyOf(0)).toEqual([[0, 0], [6, -4], [6, -4], [12, 0]]);
    expect(whammyOf(1)).toEqual([[0, -4], [12, 0]]);
    expect(whammyOf(2)).toEqual([[0, 0], [6, -4], [6, -4], [12, -4]]);
    expect(whammyOf(3)).toEqual([[0, -4], [3, -12], [6, -12], [9, 0], [12, 0]]);
  });

  it('score-info: channels from GeneralMidi, first lyrics line, start at one quarter', () => {
    // Act
    const song = read('score-info.gpx');

    // Assert
    expect(song.channels.map((c) => [c.id, c.program, c.bank, c.isPercussion])).toEqual([
      [1, 25, 0, false],
      [2, 25, 0, false],
    ]);
    expect(song.tracks.map((t) => t.channelId)).toEqual([1, 2]);
    expect(at(song.tracks, 0).lyrics).toEqual({ from: 1, text: 'Line1' });
    expect(at(song.tracks, 1).lyrics).toBeUndefined();
    expect(at(song.measureHeaders, 0).start).toBe(960);
    expect(at(song.measureHeaders, 0).tempo).toBe(120);
  });

  it('strings: standard tuning listed from the highest string', () => {
    const track = at(read('strings.gpx').tracks, 0);
    expect(track.strings.map((s) => [s.number, s.tuning])).toEqual([
      [1, 64],
      [2, 59],
      [3, 55],
      [4, 50],
      [5, 45],
      [6, 40],
    ]);
  });

  it('rejects a gpx container without score.gpif', () => {
    // Arrange: a BCFS image whose only entry is not called score.gpif.
    const image = new Uint8Array(4 + 3 * 0x1000);
    image.set([0x42, 0x43, 0x46, 0x53]);
    const view = new DataView(image.buffer);
    view.setInt32(4 + 0x1000, 2, true);
    image.set([0x61], 4 + 0x1000 + 4);
    view.setInt32(4 + 0x1000 + 0x8c, 1, true);
    view.setInt32(4 + 0x1000 + 0x94, 2, true);

    // Act / Assert
    expect(() => readSong(image)).toThrow(GpFormatError);
    expect(() => readSong(image)).toThrow(/score\.gpif/);
  });

  it('rejects a truncated gpx file', () => {
    const bytes = loadFixture('guitarpro6', 'notes.gpx').subarray(0, 200);
    expect(() => readSong(bytes)).toThrow(GpFormatError);
  });
});
