import { describe, expect, it } from 'vitest';
import { toggleDrumNote } from '../src/edit/drum-notes';
import { MAX_DRUM_KEY, setNoteFret } from '../src/edit/edit-song';
import { n, play, rest } from './helpers/edit-songs';
import { songOnStrings } from './helpers/tuning-songs';

const DRUM_STRINGS = [0, 0, 0, 0, 0, 0];
const KICK = 36;
const SNARE = 38;
const CLOSED_HI_HAT = 42;
const at = (string: number) => ({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string });

function drumSong(...events: Parameters<typeof play>[]) {
  return songOnStrings(DRUM_STRINGS, [[events.map((event) => play(...event))]], { isPercussion: true });
}

function firstBeatNotes(song: ReturnType<typeof drumSong>) {
  return song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.map((note) => `${note.string}:${note.fret}`);
}

describe('setNoteFret on a drum track', () => {
  it('keeps a GM percussion key above the guitar frets (the fret of a drum note is its key)', () => {
    const song = drumSong([4, n(1, KICK)]);
    expect(firstBeatNotes(setNoteFret(song, at(1), CLOSED_HI_HAT))).toEqual(['1:42']);
    expect(firstBeatNotes(setNoteFret(song, at(1), 200))).toEqual([`1:${MAX_DRUM_KEY}`]);
  });
});

describe('toggleDrumNote', () => {
  it('adds the drum on the cursor string when it is free', () => {
    // Arrange
    const song = songOnStrings(DRUM_STRINGS, [[[rest(4)]]], { isPercussion: true });

    // Act
    const hit = toggleDrumNote(song, at(2), SNARE);

    // Assert
    expect(firstBeatNotes(hit)).toEqual(['2:38']);
  });

  it('adds a drum to a beat that has others, on the next free string from the cursor', () => {
    const song = drumSong([4, n(1, KICK), n(2, SNARE)]);
    expect(firstBeatNotes(toggleDrumNote(song, at(1), CLOSED_HI_HAT))).toEqual(['1:36', '2:38', '3:42']);
  });

  it('takes the drum out when the beat already plays it (a second click undoes the first)', () => {
    const song = drumSong([4, n(1, KICK), n(3, SNARE)]);
    expect(firstBeatNotes(toggleDrumNote(song, at(1), SNARE))).toEqual(['1:36']);
  });

  it('replaces the cursor string when every string already plays', () => {
    const song = drumSong([4, ...[1, 2, 3, 4, 5, 6].map((string) => n(string, 40 + string))]);
    expect(firstBeatNotes(toggleDrumNote(song, at(2), KICK))).toEqual(['1:41', '2:36', '3:43', '4:44', '5:45', '6:46']);
  });

  it('leaves pitched tracks and keys outside 0–127 alone', () => {
    const pitched = songOnStrings([64, 59, 55, 50, 45, 40], [[[rest(4)]]]);
    expect(toggleDrumNote(pitched, at(1), KICK)).toBe(pitched);
    const song = drumSong([4, n(1, KICK)]);
    expect(toggleDrumNote(song, at(2), 128)).toBe(song);
    expect(toggleDrumNote(song, at(2), 1.5)).toBe(song);
  });
});
