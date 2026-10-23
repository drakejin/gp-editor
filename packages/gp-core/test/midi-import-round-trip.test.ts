import { describe, expect, it } from 'vitest';
import { readSong, renderMidi, writeSong } from '../src/index';
import { readMidiSong } from '../src/formats/midi/midi-song-reader';
import type { MidiSettings } from '../src/formats/midi/midi-settings';
import type { Song } from '../src/model/song';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { pitchOf } from './helpers/song-notes';

/** The default quantisation grid: a sixteenth. */
const SIXTEENTH = 240;

/** The song as MIDI, measures in written order and every track played (no repeats, no mute). */
function renderWritten(song: Song): Uint8Array {
  return renderMidi(song, { toHeaderIndex: song.measureHeaders.length - 1, trackIndexes: song.tracks.map((_, index) => index) }).bytes;
}

/** Every struck note as "track:tick:pitch", its start moved to the nearest multiple of `grid` from its bar line. */
function struckNotes(song: Song, grid = 1): Set<string> {
  const keys = new Set<string>();
  song.tracks.forEach((track, trackIndex) => {
    for (const measure of track.measures) {
      const start = song.measureHeaders[measure.headerIndex]?.start ?? 0;
      for (const beat of measure.beats) {
        const at = start + Math.round((beat.start - start) / grid) * grid;
        for (const note of beat.voices.flatMap((voice) => voice.notes).filter((candidate) => !candidate.isTied)) {
          keys.add(`${trackIndex}:${at}:${pitchOf(track, note)}`);
        }
      }
    }
  });
  return keys;
}

function headerFacts(song: Song): unknown[] {
  return song.measureHeaders.map((header) => [header.start, header.timeSignature.numerator, header.timeSignature.denominator, header.tempo]);
}

describe('MIDI import: renderMidi output read back', () => {
  it.each<[FixtureFolder, string]>([
    ['guitarpro8', 'orphan-tempo-automation.gp'],
    ['guitarpro8', 'beat-tempo-change.gp'],
    ['guitarpro7', 'drum-tabs.gp'],
    ['guitarpro7', 'track-volume.gp'],
    ['guitarpro7', 'track-balance.gp'],
    ['guitarpro5', 'chords.gp5'],
    ['guitarpro5', 'percussion-all.gp5'],
  ])('%s/%s keeps its measures, meters, tempos, tracks and the pitches struck at each sixteenth', (folder, name) => {
    // Arrange
    const song = readSong(loadFixture(folder, name));

    // Act
    const back = readSong(renderWritten(song));

    // Assert
    assertSongInvariants(back);
    expect(back.source.format).toBe('midi');
    expect(headerFacts(back)).toEqual(headerFacts(song));
    expect(back.tracks.map((track) => [track.name, track.isPercussion])).toEqual(song.tracks.map((track) => [track.name, track.isPercussion]));
    expect(struckNotes(back)).toEqual(struckNotes(song, SIXTEENTH));
  });

  it('keeps quintuplets and triplets exactly when the settings allow them', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'tuplets.gp5'));
    const settings: Partial<MidiSettings> = { maxDivision: 5 };

    // Act
    const back = readMidiSong(renderWritten(song), settings);

    // Assert
    expect(struckNotes(back)).toEqual(struckNotes(song));
    const tuplets = new Set(back.tracks[0]?.measures.flatMap((measure) => measure.beats.map((beat) => beat.voices[0]?.duration.tuplet.enters)));
    expect([...tuplets].sort()).toEqual([1, 3, 5]);
  });

  it('writes an imported song as a GP5 file that reads back with the same notes', () => {
    // Arrange
    const song = readSong(renderWritten(readSong(loadFixture('guitarpro8', 'orphan-tempo-automation.gp'))));

    // Act
    const saved = readSong(writeSong(song, 'gp5'));

    // Assert
    assertSongInvariants(saved);
    expect(headerFacts(saved)).toEqual(headerFacts(song));
    expect(struckNotes(saved)).toEqual(struckNotes(song));
  });
});

const FOLDERS: readonly FixtureFolder[] = ['guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6', 'guitarpro7', 'guitarpro8'];
const FIXTURES = FOLDERS.flatMap((folder) => listFixtures(folder).map((name) => [folder, name] as const));

function readable(folder: FixtureFolder, name: string): Song | undefined {
  try {
    return readSong(loadFixture(folder, name));
  } catch {
    return undefined;
  }
}

describe('MIDI import: fixture sweep', () => {
  it.each(FIXTURES)('reads the MIDI file rendered from %s/%s', (folder, name) => {
    // Arrange
    const song = readable(folder, name);
    const hasNotes = song?.tracks.some((track) => track.measures.some((measure) => measure.beats.some((beat) => beat.voices.some((voice) => voice.notes.length > 0))));
    if (song === undefined || hasNotes !== true) {
      return;
    }

    // Act
    const back = readSong(renderWritten(song));

    // Assert
    assertSongInvariants(back);
    expect(back.measureHeaders.length).toBeGreaterThanOrEqual(song.measureHeaders.length);
    expect(back.tracks.length).toBe(song.tracks.length);
  });
});
