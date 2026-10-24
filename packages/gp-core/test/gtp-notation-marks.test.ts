/**
 * Fingering and beaming in GP3–GP5 files: the fixtures, and round trips through the GP3/GP4/GP5 writers.
 */
import { describe, expect, it } from 'vitest';
import { plainDuration } from '../src/model/defaults';
import type { BeamLink, Finger, Song, Voice } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp34, expectedAfterGp5 } from './helpers/write-expected';
import { buildNote, buildSong, buildVoice, restVoice } from './helpers/write-song-builder';

const FINGERS: readonly Finger[] = ['thumb', 'index', 'middle', 'annular', 'little'];
const EIGHTH = plainDuration(8);

function read(folder: FixtureFolder, name: string): Song {
  const song = readSong(loadFixture(folder, name));
  assertSongInvariants(song);
  return song;
}

function firstVoices(song: Song, measureIndex = 0): readonly Voice[] {
  return song.tracks[0]?.measures[measureIndex]?.beats.map((beat) => beat.voices[0] ?? restVoice()) ?? [];
}

function roundTrip(song: Song, format: 'gp3' | 'gp4' | 'gp5'): Song {
  const again = readSong(writeSong(song, format));
  assertSongInvariants(again);
  return again;
}

/** Eighths with these beams to the next beat, then a rest filling the bar. */
function beamedSong(links: readonly (BeamLink | undefined)[]): Song {
  const beats = links.map((link) => ({ voice: { ...buildVoice([buildNote(1, 3)], EIGHTH), ...(link === undefined ? {} : { beamToNext: link }) } }));
  return buildSong({ tracks: [{ measures: [[...beats, { voice: restVoice(plainDuration(2)) }]] }] });
}

describe('GP4 / GP5 fingering', () => {
  it.each([
    ['guitarpro4', 'fingering.gp4'],
    ['guitarpro5', 'fingering.gp5'],
  ] as const)('%s/%s: fingers 0 … 4 are thumb … little, left hand then right hand', (folder, name) => {
    // Act
    const notes = firstVoices(read(folder, name)).flatMap((voice) => voice.notes);

    // Assert
    expect(notes.map((note) => note.leftFinger)).toEqual([...FINGERS, ...FINGERS.map(() => undefined)]);
    expect(notes.map((note) => note.rightFinger)).toEqual([...FINGERS.map(() => undefined), ...FINGERS]);
  });

  it.each(['gp3', 'gp4', 'gp5'] as const)('round-trips both hands’ fingers through %s', (format) => {
    // Arrange
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0, { leftFinger: 'little', rightFinger: 'thumb' }), buildNote(3, 2, { rightFinger: 'middle' })]) }]] }],
    });

    // Act
    const again = roundTrip(song, format);

    // Assert
    const notes = firstVoices(again)[0]?.notes ?? [];
    expect(notes.map((note) => [note.leftFinger, note.rightFinger])).toEqual([['little', 'thumb'], [undefined, 'middle']]);
    const expected = format === 'gp5' ? expectedAfterGp5(song, again) : expectedAfterGp34(song, again);
    expect(songDifference(expected, again)).toBeUndefined();
  });
});

describe('GP5 beaming', () => {
  it('beaming-mode.gp5: a flag on a beat sets the beam from the beat before', () => {
    // Act
    const song = read('guitarpro5', 'beaming-mode.gp5');

    // Assert
    expect(firstVoices(song, 0).map((voice) => voice.beamToNext)).toEqual([undefined, undefined]);
    expect(firstVoices(song, 1).map((voice) => voice.beamToNext)).toEqual([undefined, 'join', undefined, undefined]);
    expect(firstVoices(song, 2).map((voice) => voice.beamToNext)).toEqual(['break', undefined, 'break', undefined]);
    expect(firstVoices(song, 3).map((voice) => voice.beamToNext)).toEqual(['breakSecondary', undefined, undefined]);
    expect(song.measureHeaders.map((header) => header.beamGrouping)).toEqual(song.measureHeaders.map(() => undefined));
  });

  it('round-trips every beam to the next beat', () => {
    // Arrange
    const song = beamedSong(['join', 'break', 'breakSecondary', undefined]);

    // Act
    const again = roundTrip(song, 'gp5');

    // Assert
    expect(firstVoices(again).map((voice) => voice.beamToNext)).toEqual(['join', 'break', 'breakSecondary', undefined, undefined]);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('drops the beam of the last beat of a voice: GP5 keeps it on the next beat', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)], plainDuration(1)) }].map((beat) => ({ voice: { ...beat.voice, beamToNext: 'join' as const } }))] }] });

    // Act
    const again = roundTrip(song, 'gp5');

    // Assert
    expect(firstVoices(again)[0]?.beamToNext).toBeUndefined();
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('round-trips a bar’s beam groups and starts writing them again after it', () => {
    // Arrange
    const song = buildSong({
      headers: [{}, { beamGrouping: { unit: 8, groups: [3, 3, 2] } }, {}, { beamGrouping: { unit: 16, groups: [8, 8] } }],
      tracks: [{ measures: [0, 1, 2, 3].map(() => [{ voice: buildVoice([buildNote(1, 0)], plainDuration(1)) }]) }],
    });

    // Act
    const again = roundTrip(song, 'gp5');

    // Assert
    expect(again.measureHeaders.map((header) => header.beamGrouping)).toEqual([undefined, { unit: 8, groups: [3, 3, 2] }, undefined, { unit: 8, groups: [4, 4] }]);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('keeps the time signature’s grouping for groups GP5 cannot hold (more than four, or not in whole eighths)', () => {
    // Arrange
    const song = buildSong({
      headers: [{ beamGrouping: { unit: 8, groups: [1, 1, 1, 1, 4] } }, { beamGrouping: { unit: 16, groups: [3, 13] } }],
      tracks: [{ measures: [0, 1].map(() => [{ voice: buildVoice([buildNote(1, 0)], plainDuration(1)) }]) }],
    });

    // Act
    const again = roundTrip(song, 'gp5');

    // Assert
    expect(again.measureHeaders.map((header) => header.beamGrouping)).toEqual([undefined, undefined]);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });
});

describe('GP3–GP5 losses', () => {
  it.each(['gp3', 'gp4', 'gp5'] as const)('%s drops slashes, the track’s slash notation and shown accidentals', (format) => {
    // Arrange
    const note = buildNote(2, 1, { accidentalDisplay: 'forced' });
    const song = buildSong({ tracks: [{ hasSlashNotation: true, measures: [[{ voice: { ...buildVoice([note]), isSlashed: true } }]] }] });

    // Act
    const again = roundTrip(song, format);

    // Assert
    expect(again.tracks[0]).not.toHaveProperty('hasSlashNotation');
    expect(firstVoices(again)[0]).not.toHaveProperty('isSlashed');
    expect(firstVoices(again)[0]?.notes[0]).not.toHaveProperty('accidentalDisplay');
    const expected = format === 'gp5' ? expectedAfterGp5(song, again) : expectedAfterGp34(song, again);
    expect(songDifference(expected, again)).toBeUndefined();
  });

  it.each(['gp3', 'gp4'] as const)('%s drops beams and beam groups (GP3 and GP4 have none)', (format) => {
    // Arrange
    const beamed = beamedSong(['break', 'join']);
    const song = { ...beamed, measureHeaders: beamed.measureHeaders.map((header) => ({ ...header, beamGrouping: { unit: 8, groups: [4, 4] } as const })) };

    // Act
    const again = roundTrip(song, format);

    // Assert
    expect(firstVoices(again).map((voice) => voice.beamToNext)).toEqual([undefined, undefined, undefined]);
    expect(again.measureHeaders[0]).not.toHaveProperty('beamGrouping');
    expect(songDifference(expectedAfterGp34(song, again), again)).toBeUndefined();
  });
});
