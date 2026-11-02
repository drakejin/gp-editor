import { describe, expect, it } from 'vitest';
import { readSong, repeatPlays, type Song, writeSong } from '../src/index';
import { buildPlaybackOrder } from '../src/midi/playback-order';
import { encodeMusicXml } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { makeSong } from './helpers/midi-song';

function read(folder: FixtureFolder, name: string): Song {
  return readSong(loadFixture(folder, name));
}

/** How many times bar `headerIndex` is played. */
function timesPlayed(song: Song, headerIndex: number): number {
  return buildPlaybackOrder(song.measureHeaders, 0).filter((measure) => measure.headerIndex === headerIndex).length;
}

describe('repeatPlays: a repeat close counted as Guitar Pro counts it, the passes played', () => {
  it('is 0 without a repeat close and one more than the repetitions with one', () => {
    expect([0, 1, 3].map((repeatClose) => repeatPlays({ repeatClose }))).toEqual([0, 2, 4]);
  });

  // Guitar Pro's own files: a plain repeat plays twice (GPIF count="2", GP5 byte 2), "multi" four times; MusicXML times="5".
  it.each<[FixtureFolder, string, number]>([
    ['guitarpro5', 'repeat-close.gp5', 2],
    ['guitarpro6', 'repeat-close.gpx', 2],
    ['guitarpro7', 'repeat-close.gp', 2],
    ['guitarpro5', 'repeat-close-multi.gp5', 4],
    ['guitarpro6', 'repeat-close-multi.gpx', 4],
    ['guitarpro7', 'repeat-close-multi.gp', 4],
    ['musicxml', '45a-SimpleRepeat.xml', 5],
  ])('reads %s/%s as %d passes, and playback plays them', (folder, name, plays) => {
    // Arrange
    const song = read(folder, name);
    const closeIndex = song.measureHeaders.findIndex((header) => header.repeatClose > 0);

    // Act / Assert
    expect(repeatPlays(song.measureHeaders[closeIndex]!)).toBe(plays);
    expect(timesPlayed(song, closeIndex)).toBe(plays);
  });

  it.each(['gp', 'gp5', 'gp4', 'gp3', 'musicxml'] as const)('keeps three passes through a %s file', (format) => {
    // Arrange: |: bar 1 bar 2 :| x3, bar 3
    const song = makeSong({ headers: [{ repeatOpen: true }, { repeatClose: 2 }, {}], tracks: [{ measures: [[], [], []] }] });

    // Act
    const bytes = format === 'musicxml' ? encodeMusicXml(writeMusicXml(song)) : writeSong(song, format);
    const back = readSong(bytes);

    // Assert
    expect(repeatPlays(back.measureHeaders[1]!)).toBe(3);
    expect(timesPlayed(back, 1)).toBe(3);
  });
});
