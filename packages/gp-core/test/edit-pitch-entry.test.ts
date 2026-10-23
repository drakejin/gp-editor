import { describe, expect, it } from 'vitest';
import { enterPlayedNotes, handFretBefore } from '../src/edit/pitch-entry';
import { STANDARD_TUNING } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { n, play, rest } from './helpers/edit-songs';
import { songOnStrings } from './helpers/tuning-songs';

const C4 = 60;
const E4 = 64;
const G4 = 67;
const at = (beatIndex: number, measureIndex = 0) => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0 });

function beatNotes(song: Song, beatIndex: number, measureIndex = 0): string[] {
  return song.tracks[0]?.measures[measureIndex]?.beats[beatIndex]?.voices[0]?.notes.map((note) => `${note.string}:${note.fret}@${note.velocity}`) ?? [];
}

describe('enterPlayedNotes', () => {
  it('turns a rest into the played chord, each pitch on its own string near the nut', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[rest(4), rest(4), rest(2)]]]);

    // Act
    const entry = enterPlayedNotes(song, at(0), [{ pitch: C4 }, { pitch: E4 }, { pitch: G4 }]);

    // Assert
    expect(beatNotes(entry.song, 0)).toEqual(['1:3@95', '2:5@95', '3:5@95']);
    expect(entry.entered).toBe(3);
    expect(entry.skipped).toEqual([]);
  });

  it('replaces the notes the beat had, and keeps its duration', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(8, n(6, 3), n(5, 2)), rest(8), rest(2), rest(4)]]]);
    const entry = enterPlayedNotes(song, at(0), [{ pitch: E4, velocity: 110 }]);
    expect(beatNotes(entry.song, 0)).toEqual(['1:0@110']);
    expect(entry.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration.value).toBe(8);
  });

  it('plays near the hand of the last fretted beat before', () => {
    // The beat before is fretted at the 7th position, so E4 goes to the G string's 9th fret.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 7)), rest(4), rest(2)]]]);
    expect(handFretBefore(song, at(1))).toBe(7);
    expect(beatNotes(enterPlayedNotes(song, at(1), [{ pitch: E4 }]).song, 1)).toEqual(['3:9@95']);
  });

  it('starts in the first position when nothing fretted comes before, looking back across bar lines', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(2, 5))]], [[play(4, n(1, 0)), rest(4), rest(2)]]]);
    expect(handFretBefore(song, at(0))).toBe(1);
    expect(handFretBefore(song, at(1, 1))).toBe(5);
  });

  it('keeps a MIDI guitar note on the string it was played on (one channel per string)', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(1)]]]);
    const entry = enterPlayedNotes(song, at(0), [{ pitch: E4, string: 2 }, { pitch: C4, string: 3 }]);
    expect(beatNotes(entry.song, 0)).toEqual(['2:5@95', '3:5@95']);
  });

  it('places a MIDI guitar note whose string cannot play it like any other note', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(1)]]]);
    expect(beatNotes(enterPlayedNotes(song, at(0), [{ pitch: 40, string: 1 }]).song, 0)).toEqual(['6:0@95']);
  });

  it('counts frets from the capo', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(1)]]], { offset: 2 });
    expect(beatNotes(enterPlayedNotes(song, at(0), [{ pitch: E4 + 2 }]).song, 0)).toEqual(['1:0@95']);
  });

  it('skips pitches the neck cannot play and duplicates, and changes nothing when no pitch fits', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(1)]]]);
    const entry = enterPlayedNotes(song, at(0), [{ pitch: 20 }, { pitch: E4 }, { pitch: E4 }]);
    expect(beatNotes(entry.song, 0)).toEqual(['1:0@95']);
    expect(entry.skipped).toEqual([20]);
    const none = enterPlayedNotes(song, at(0), [{ pitch: 20 }]);
    expect(none.song).toBe(song);
    expect(none.entered).toBe(0);
  });

  it('enters drum pads on a drum track as their GM keys, one string each', () => {
    const song = songOnStrings([0, 0, 0, 0, 0, 0], [[[rest(1)]]], { isPercussion: true });
    expect(beatNotes(enterPlayedNotes(song, at(0), [{ pitch: 36 }, { pitch: 42 }]).song, 0)).toEqual(['1:36@95', '2:42@95']);
  });

  it('puts the banjo drone on its own string, stored from its peg', () => {
    const song = songOnStrings([62, 59, 55, 50, 67], [[[rest(1)]]], { program: 105 });
    expect(beatNotes(enterPlayedNotes(song, at(0), [{ pitch: G4 }]).song, 0)).toEqual(['5:0@95']);
  });

  it('fills an empty second voice to the bar lines', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(4), rest(4), rest(2)], []]]);
    const second = { ...at(1), voiceIndex: 1 };
    const entry = enterPlayedNotes(song, second, [{ pitch: E4 }]);
    expect(entry.song.tracks[0]?.measures[0]?.beats[1]?.voices[1]?.notes.map((note) => note.fret)).toEqual([0]);
  });

  it('changes nothing at a missing position', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[rest(1)]]]);
    expect(enterPlayedNotes(song, at(4), [{ pitch: E4 }]).song).toBe(song);
  });
});
