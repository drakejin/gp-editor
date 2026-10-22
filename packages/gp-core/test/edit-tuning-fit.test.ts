import { describe, expect, it } from 'vitest';
import { canPlayOnTuning, countUnplayableNotes, suggestTrackTunings, suggestTunings, trackPitchRange } from '../src/edit/tuning-fit';
import { tuningPresetsFor } from '../src/edit/tuning-presets';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import type { Song, Track } from '../src/model/song';
import { readSong } from '../src/read-song';
import { n, play, rest } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';
import { songOnStrings } from './helpers/tuning-songs';

const DROP_D = [64, 59, 55, 50, 45, 38];
const B_STANDARD = [59, 54, 50, 45, 40, 35];
const SEVEN_STRING = [64, 59, 55, 50, 45, 40, 35];
/** Standard tuning an octave up (a pipe or flute part written on guitar strings). */
const OCTAVE_UP = STANDARD_TUNING.map((open) => open + 12);

function firstTrack(song: Song): Track {
  const track = song.tracks[0];
  if (track === undefined) {
    throw new Error('song without tracks');
  }
  return track;
}

/** D2 on the dropped string and a G4. */
const dropDSong = songOnStrings(DROP_D, [[[play(4, n(6, 0)), rest(4), play(2, n(1, 3))]]]);

describe('canPlayOnTuning and countUnplayableNotes', () => {
  it('plays a low D only on tunings that reach it', () => {
    const track = firstTrack(dropDSong);
    expect(canPlayOnTuning(track, DROP_D)).toBe(true);
    expect(canPlayOnTuning(track, B_STANDARD)).toBe(true);
    expect(canPlayOnTuning(track, STANDARD_TUNING)).toBe(false);
    expect(countUnplayableNotes(track, STANDARD_TUNING)).toBe(1);
  });

  it('needs a string of its own for each note of a beat, across voices', () => {
    // Arrange: E2 on string 6 and F2 on the low B string sound together; standard holds both only on string 6.
    const song = songOnStrings(SEVEN_STRING, [[[play(4, n(6, 0))], [play(4, n(7, 6))]]]);

    // Act
    const onStandard = countUnplayableNotes(firstTrack(song), STANDARD_TUNING);

    // Assert
    expect(onStandard).toBe(1);
    expect(canPlayOnTuning(firstTrack(song), B_STANDARD)).toBe(true);
  });

  it('stops at fret 24 of the neck, counted from the capo', () => {
    const fret24 = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 24))]]]);
    const fret25 = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 25))]]]);
    const capo2Fret22 = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 22))]]], { offset: 2 });
    const capo2Fret23 = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 23))]]], { offset: 2 });
    expect(canPlayOnTuning(firstTrack(fret24), STANDARD_TUNING)).toBe(true);
    expect(canPlayOnTuning(firstTrack(fret25), STANDARD_TUNING)).toBe(false);
    expect(canPlayOnTuning(firstTrack(capo2Fret22), STANDARD_TUNING)).toBe(true);
    expect(canPlayOnTuning(firstTrack(capo2Fret23), STANDARD_TUNING)).toBe(false);
  });

  it('plays a track without notes on any tuning', () => {
    const empty = songOnStrings(SEVEN_STRING, [[[rest(1)]]]);
    expect(countUnplayableNotes(firstTrack(empty), STANDARD_BASS_TUNING)).toBe(0);
  });
});

describe('trackPitchRange', () => {
  it('gives the lowest and highest sounding pitch, capo included', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(6, 0)), play(4, n(1, 3))]]], { offset: 2 });
    expect(trackPitchRange(firstTrack(song))).toEqual({ lowest: 42, highest: 69 });
  });

  it('has no range without notes', () => {
    expect(trackPitchRange(firstTrack(songOnStrings(STANDARD_TUNING, [[[rest(1)]]])))).toBeUndefined();
  });
});

describe('suggestTunings', () => {
  it('needs nothing for a guitar in a preset that plays every note', () => {
    // Act
    const advice = suggestTunings(dropDSong, 0);

    // Assert
    expect(advice).toMatchObject({ instrument: 'guitar', currentUnplayableNotes: 0, needsTuning: false });
    expect(advice?.current?.name).toBe('Drop D');
    expect(advice?.pitchRange).toEqual({ lowest: 38, highest: 67 });
    expect(advice?.presets.map((fit) => fit.preset)).toEqual(tuningPresetsFor('guitar'));
  });

  it('suggests the presets that fit: standard-shaped ones by fewest semitones changed, then open tunings', () => {
    const advice = suggestTunings(dropDSong, 0);
    expect(advice?.presets.find((fit) => fit.preset.name === 'Standard')?.unplayableNotes).toBe(1);
    expect(advice?.suggested.map((preset) => preset.name)).toEqual([
      'Drop D',
      'Drop C♯',
      'D standard',
      'Drop C',
      'Drop B',
      'C standard',
      'B standard',
      'Open G',
      'DADGAD',
      'Open D',
    ]);
    expect(advice?.closest).toBeUndefined();
  });

  it('puts standard first when it fits, and asks for a tuning when the track is not on a preset', () => {
    // Arrange: a 7-string part that never uses the low B string.
    const song = songOnStrings(SEVEN_STRING, [[[play(4, n(1, 0), n(6, 5))]]]);

    // Act
    const advice = suggestTunings(song, 0);

    // Assert
    expect(advice?.current).toBeUndefined();
    expect(advice?.needsTuning).toBe(true);
    expect(advice?.suggested[0]?.name).toBe('Standard');
  });

  it('asks for a tuning when the current preset cannot hold every note on the neck', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 26))]]]);
    const advice = suggestTunings(song, 0);
    expect(advice).toMatchObject({ currentUnplayableNotes: 1, needsTuning: true, suggested: [] });
  });

  it('names the closest preset when none plays every note', () => {
    // Arrange: an octave-up part whose top note (C7) is past fret 24 of every guitar preset.
    const song = songOnStrings(OCTAVE_UP, [[[play(4, n(1, 20)), play(4, n(6, 0))]]]);

    // Act
    const advice = suggestTunings(song, 0);

    // Assert
    expect(advice?.suggested).toEqual([]);
    expect(advice?.closest?.preset.name).toBe('Standard');
    expect(advice?.closest?.unplayableNotes).toBe(1);
  });

  it('offers bass presets to a bass track', () => {
    const song = songOnStrings(STANDARD_BASS_TUNING, [[[play(4, n(4, 0))]]], { program: 33 });
    const advice = suggestTunings(song, 0);
    expect(advice?.instrument).toBe('bass');
    expect(advice?.current?.name).toBe('Standard');
    expect(advice?.presets.map((fit) => fit.preset)).toEqual(tuningPresetsFor('bass'));
  });

  it('offers nothing to a percussion track, and nothing for a missing track', () => {
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36))]]], { isPercussion: true });
    expect(suggestTunings(drums, 0)).toMatchObject({ instrument: 'percussion', presets: [], suggested: [], needsTuning: false });
    expect(suggestTunings(drums, 3)).toBeUndefined();
  });

  it('advises on the tracks of a real file', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const indexOf = (name: string): number => song.tracks.findIndex((track) => track.name === name);

    // Act
    const strings = suggestTunings(song, indexOf('Strings ensemble'));
    const choirs = suggestTunings(song, indexOf('Choirs'));
    const rhythm = suggestTunings(song, indexOf('Emppu(Disto)'));
    const bass = suggestTunings(song, song.tracks.findIndex((track) => track.name === 'Marco' && track.strings.length === 4));

    // Assert
    expect(strings).toMatchObject({ instrument: 'guitar', current: undefined, needsTuning: true, pitchRange: { lowest: 34, highest: 87 } });
    expect(strings?.presets[0]?.unplayableNotes).toBeGreaterThan(0);
    expect(choirs?.needsTuning).toBe(true);
    expect(choirs?.suggested[0]?.name).toBe('Standard');
    expect(rhythm).toMatchObject({ current: { name: 'Drop C' }, needsTuning: false });
    expect(bass).toMatchObject({ instrument: 'bass', current: { name: 'Drop C' }, needsTuning: false });
  });
});

describe('suggestTrackTunings', () => {
  it('gives the same advice as suggestTunings from the track and the channels alone', () => {
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    song.tracks.forEach((track, trackIndex) => {
      expect(suggestTrackTunings(track, song.channels)).toEqual(suggestTunings(song, trackIndex));
    });
  });
});
