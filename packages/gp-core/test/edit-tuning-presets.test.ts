import { describe, expect, it } from 'vitest';
import { TUNING_PRESETS, findTuningPreset, isBassTuning, keepsStandardShapes, resolveInstrument, tuningPresetsFor } from '../src/edit/tuning-presets';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import { readSong } from '../src/read-song';
import { loadFixture } from './helpers/fixtures';
import { songOnStrings } from './helpers/tuning-songs';

const SEVEN_STRING = [64, 59, 55, 50, 45, 40, 35];
const FIVE_STRING_BASS = [43, 38, 33, 28, 23];

function presetTuning(instrument: 'guitar' | 'bass', name: string): readonly number[] | undefined {
  return tuningPresetsFor(instrument).find((preset) => preset.name === name)?.tuning;
}

describe('tuning presets', () => {
  it('lists six-string guitar presets, standard first, each with six strings', () => {
    // Act
    const guitar = tuningPresetsFor('guitar');

    // Assert
    expect(guitar.map((preset) => preset.name)).toEqual([
      'Standard',
      'Drop D',
      'E♭ standard',
      'D standard',
      'Drop C♯',
      'Drop C',
      'C standard',
      'Drop B',
      'B standard',
      'Open G',
      'Open D',
      'DADGAD',
    ]);
    expect(guitar[0]?.tuning).toBe(STANDARD_TUNING);
    expect(guitar.every((preset) => preset.tuning.length === 6)).toBe(true);
  });

  it('lists four-string bass presets, standard E A D G first', () => {
    const bass = tuningPresetsFor('bass');
    expect(bass.map((preset) => preset.name)).toEqual(['Standard', 'Drop D', 'E♭ standard', 'D standard', 'Drop C', 'B E A D']);
    expect(bass[0]?.tuning).toBe(STANDARD_BASS_TUNING);
    expect(STANDARD_BASS_TUNING).toEqual([43, 38, 33, 28]);
    expect(bass.every((preset) => preset.tuning.length === 4)).toBe(true);
  });

  it('spells the tunings string 1 first, as GuitarString.tuning', () => {
    expect(presetTuning('guitar', 'Drop D')).toEqual([64, 59, 55, 50, 45, 38]);
    expect(presetTuning('guitar', 'E♭ standard')).toEqual([63, 58, 54, 49, 44, 39]);
    expect(presetTuning('guitar', 'Drop C')).toEqual([62, 57, 53, 48, 43, 36]);
    expect(presetTuning('guitar', 'B standard')).toEqual([59, 54, 50, 45, 40, 35]);
    expect(presetTuning('guitar', 'Open G')).toEqual([62, 59, 55, 50, 43, 38]);
    expect(presetTuning('guitar', 'DADGAD')).toEqual([62, 57, 55, 50, 45, 38]);
    expect(presetTuning('bass', 'Drop C')).toEqual([41, 36, 31, 24]);
    expect(presetTuning('bass', 'B E A D')).toEqual([38, 33, 28, 23]);
  });

  it('gives every preset a unique id and no presets to percussion', () => {
    expect(new Set(TUNING_PRESETS.map((preset) => preset.id)).size).toBe(TUNING_PRESETS.length);
    expect(tuningPresetsFor('percussion')).toEqual([]);
  });

  it('tells tunings that keep standard chord shapes (lowered, or with a dropped low string) from open tunings', () => {
    const shapes = tuningPresetsFor('guitar').filter(keepsStandardShapes).map((preset) => preset.name);
    expect(shapes).toEqual(['Standard', 'Drop D', 'E♭ standard', 'D standard', 'Drop C♯', 'Drop C', 'C standard', 'Drop B', 'B standard']);
    expect(tuningPresetsFor('bass').every(keepsStandardShapes)).toBe(true);
  });
});

describe('findTuningPreset', () => {
  it('finds the preset of the instrument with exactly that tuning', () => {
    expect(findTuningPreset('guitar', [64, 59, 55, 50, 45, 38])?.name).toBe('Drop D');
    expect(findTuningPreset('bass', [43, 38, 33, 26])?.name).toBe('Drop D');
  });

  it('finds nothing for a custom tuning, another instrument or another string count', () => {
    expect(findTuningPreset('guitar', [64, 59, 55, 52, 45, 40])).toBeUndefined();
    expect(findTuningPreset('guitar', STANDARD_BASS_TUNING)).toBeUndefined();
    expect(findTuningPreset('guitar', SEVEN_STRING)).toBeUndefined();
    expect(findTuningPreset('percussion', STANDARD_TUNING)).toBeUndefined();
  });
});

describe('resolveInstrument', () => {
  it('draws a percussion track as percussion whatever its strings', () => {
    const song = songOnStrings([0, 0, 0, 0, 0, 0], [[[]]], { isPercussion: true });
    expect(resolveInstrument(song, song.tracks[0]!)).toBe('percussion');
  });

  it('calls every GM bass program (32–39) a bass, even on guitar strings', () => {
    for (const program of [32, 33, 39]) {
      const song = songOnStrings(STANDARD_TUNING, [[[]]], { program });
      expect(resolveInstrument(song, song.tracks[0]!)).toBe('bass');
    }
  });

  it('calls a track with few strings tuned low a bass, whatever its program', () => {
    const fourString = songOnStrings(STANDARD_BASS_TUNING, [[[]]], { program: 0 });
    const fiveString = songOnStrings(FIVE_STRING_BASS, [[[]]], { program: 25 });
    expect(resolveInstrument(fourString, fourString.tracks[0]!)).toBe('bass');
    expect(resolveInstrument(fiveString, fiveString.tracks[0]!)).toBe('bass');
  });

  it('draws every other pitched track as a guitar: 7 strings, strings ensemble, a part tuned an octave down', () => {
    const tracks = [
      songOnStrings(SEVEN_STRING, [[[]]], { program: 30 }),
      songOnStrings([64, 59, 55, 50, 45, 40, 33], [[[]]], { program: 49 }),
      songOnStrings([52, 47, 43, 38, 33, 35], [[[]]], { program: 47 }),
      songOnStrings(STANDARD_TUNING, [[[]]], { program: 31 }),
      songOnStrings(STANDARD_TUNING, [[[]]], { program: 40 }),
    ];
    expect(tracks.map((song) => resolveInstrument(song, song.tracks[0]!))).toEqual(['guitar', 'guitar', 'guitar', 'guitar', 'guitar']);
  });

  it('classifies the tracks of a real file', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));

    // Act
    const instruments = song.tracks.map((track) => `${track.name}: ${resolveInstrument(song, track)}`);

    // Assert
    expect(instruments).toContain('Strings ensemble: guitar');
    expect(instruments).toContain('Marco: bass');
    expect(instruments).toContain('Jukka: percussion');
    expect(instruments.filter((entry) => entry.endsWith('bass'))).toEqual(['Marco: bass']);
  });
});

describe('isBassTuning', () => {
  it('needs at most six strings whose highest is C3 or lower', () => {
    expect(isBassTuning(STANDARD_BASS_TUNING)).toBe(true);
    expect(isBassTuning([48, 43, 38, 33, 28, 23])).toBe(true);
    expect(isBassTuning([48, 43, 38, 33, 28, 23, 18])).toBe(false);
    expect(isBassTuning(STANDARD_TUNING)).toBe(false);
    expect(isBassTuning([])).toBe(false);
  });
});
