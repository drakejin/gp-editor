import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { setBeatChord, setBeatChordNotes } from '../src/edit/beat-chord';
import { buildNewSong } from '../src/edit/new-song';
import type { Chord, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';
import { assertSongInvariants } from './helpers/invariants';

const AT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };
const C_MAJOR: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };

/** A note on beat 0, a rest on beat 1; the second voice is a whole rest. */
function makeSong(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(2, n(2, 5)), rest(2)], [rest(1)]]]] }));
}

const beatOf = (song: Song, beatIndex = 0) => song.tracks[0]?.measures[0]?.beats[beatIndex];

describe('setBeatChord', () => {
  it('sets, replaces and removes the chord of the beat', () => {
    // Arrange
    const song = makeSong();

    // Act
    const set = setBeatChord(song, AT, C_MAJOR);
    const replaced = setBeatChord(set, AT, { ...C_MAJOR, name: 'C/E', frets: [0, 1, 0, 2, 3, 0] });
    const removed = setBeatChord(replaced, AT, undefined);

    // Assert
    expect(beatOf(set)?.chord).toEqual(C_MAJOR);
    expect(beatOf(replaced)?.chord?.name).toBe('C/E');
    expect(beatOf(removed)).not.toHaveProperty('chord');
    expect(beatOf(set, 1)).toBe(beatOf(song, 1));
    expect(beatOf(set)?.voices).toBe(beatOf(song)?.voices);
    assertSongInvariants(set);
  });

  it('fits the frets to the track’s strings and the name and first fret to what a file holds', () => {
    // Act
    const edited = setBeatChord(makeSong(), AT, { name: '  Am  ', firstFret: 0, frets: [0, 1, 2, 2, 0, -1, 3, 99, Number.NaN] });
    const short = setBeatChord(makeSong(), AT, { name: 'E5', firstFret: 40, frets: [2.4, -7] });

    // Assert
    expect(beatOf(edited)?.chord).toEqual({ name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] });
    expect(beatOf(short)?.chord).toEqual({ name: 'E5', firstFret: 29, frets: [2, -1, -1, -1, -1, -1] });
  });

  it('returns the same song for the same chord, no chord to remove, or a missing beat', () => {
    const song = makeSong();
    const set = setBeatChord(song, AT, C_MAJOR);
    expect(setBeatChord(set, AT, { ...C_MAJOR, frets: [...C_MAJOR.frets] })).toBe(set);
    expect(setBeatChord(song, AT, undefined)).toBe(song);
    expect(setBeatChord(song, { ...AT, beatIndex: 9 }, C_MAJOR)).toBe(song);
    expect(setBeatChord(song, { ...AT, trackIndex: 2 }, C_MAJOR)).toBe(song);
  });

  it.each(['gp5', 'gp4', 'gp3'] as const)('keeps a chord set on a new sheet through a %s save', (format) => {
    // Arrange
    const song = setBeatChord(buildNewSong(), { ...AT, measureIndex: 1 }, { name: 'Bm7b5', firstFret: 1, frets: [-1, 3, 2, 3, 2, -1] });

    // Act
    const again = readSong(writeSong(song, format));

    // Assert
    expect(again.tracks[0]?.measures[1]?.beats[0]?.chord).toEqual({ name: 'Bm7b5', firstFret: 1, frets: [-1, 3, 2, 3, 2, -1] });
  });

  it('removes a chord with neither a name nor a played string', () => {
    const set = setBeatChord(makeSong(), AT, C_MAJOR);
    expect(beatOf(setBeatChord(set, AT, { name: ' ', firstFret: 1, frets: [-1, -1] }))).not.toHaveProperty('chord');
  });
});

describe('setBeatChordNotes', () => {
  it('replaces the voice’s notes with the chord’s, string by string', () => {
    // Act
    const edited = setBeatChordNotes(makeSong(), AT, C_MAJOR);

    // Assert
    const notes = beatOf(edited)?.voices[0]?.notes ?? [];
    expect(notes.map((note) => [note.string, note.fret])).toEqual([[1, 0], [2, 1], [3, 0], [4, 2], [5, 3]]);
    assertSongInvariants(edited);
  });

  it('keeps the velocity of a note the chord plays on the same string', () => {
    const notes = beatOf(setBeatChordNotes(makeSong(), AT, C_MAJOR))?.voices[0]?.notes ?? [];
    expect(notes.find((note) => note.string === 2)?.velocity).toBe(95);
  });

  it('turns a rest into the chord', () => {
    const edited = setBeatChordNotes(makeSong(), { ...AT, beatIndex: 1 }, C_MAJOR);
    expect(beatOf(edited, 1)?.voices[0]?.notes).toHaveLength(5);
    assertSongInvariants(edited);
  });

  it('fills an empty voice with the chord, and rests to the bar lines', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 0)), play(2, n(1, 0))]]]] }));

    // Act
    const edited = setBeatChordNotes(song, { ...AT, beatIndex: 1, voiceIndex: 1 }, C_MAJOR);

    // Assert
    const voice = beatOf(edited, 1)?.voices[1];
    expect(voice?.isEmpty).toBe(false);
    expect(voice?.notes).toHaveLength(5);
    assertSongInvariants(edited);
  });

  it('returns the same song for a chord without played strings or a missing beat', () => {
    const song = makeSong();
    expect(setBeatChordNotes(song, AT, { name: 'N.C.', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] })).toBe(song);
    expect(setBeatChordNotes(song, { ...AT, measureIndex: 4 }, C_MAJOR)).toBe(song);
  });
});
