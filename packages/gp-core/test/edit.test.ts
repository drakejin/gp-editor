import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NO_STROKE, QUARTER, RED } from '../src/model/defaults';
import type { Beat, Note, Song } from '../src/model/song';
import { type NoteAddress, deleteNote, findNote, setNoteFret, setNoteString } from '../src/edit/edit-song';

function note(string: number, fret: number): Note {
  return { string, fret, velocity: 95, isTied: false, effect: EMPTY_NOTE_EFFECT };
}

function beat(start: number, notes: Note[]): Beat {
  return {
    start,
    voices: [{ duration: QUARTER, notes, isEmpty: false, direction: 'none' }],
    stroke: NO_STROKE,
    pickStroke: 'none',
  };
}

function makeSong(): Song {
  return {
    source: { format: 'gp5', version: 'test' },
    info: EMPTY_SONG_INFO,
    channels: [],
    measureHeaders: [
      {
        number: 1,
        start: 960,
        timeSignature: { numerator: 4, denominator: 4 },
        tempo: 120,
        repeatOpen: false,
        repeatClose: 0,
        repeatAlternative: 0,
        tripletFeel: 'none',
      },
    ],
    tracks: [
      {
        number: 1,
        name: 'Guitar',
        channelId: 1,
        strings: [1, 2, 3, 4, 5, 6].map((number, i) => ({ number, tuning: [64, 59, 55, 50, 45, 40][i] ?? 0 })),
        color: RED,
        offset: 0,
        isPercussion: false,
        solo: false,
        mute: false,
        measures: [
          {
            headerIndex: 0,
            clef: 'treble',
            keySignature: 0,
            beats: [beat(960, [note(1, 0), note(3, 2)]), beat(1920, [note(6, 3)])],
          },
        ],
      },
    ],
  };
}

const FIRST_NOTE: NoteAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, noteIndex: 0 };

describe('findNote', () => {
  it('returns the note at an address', () => {
    expect(findNote(makeSong(), { ...FIRST_NOTE, noteIndex: 1 })).toMatchObject({ string: 3, fret: 2 });
  });

  it('returns undefined for an address outside the song', () => {
    expect(findNote(makeSong(), { ...FIRST_NOTE, beatIndex: 9 })).toBeUndefined();
    expect(findNote(makeSong(), { ...FIRST_NOTE, trackIndex: -1 })).toBeUndefined();
  });
});

describe('setNoteFret', () => {
  it('returns a new song with the fret changed and leaves the original untouched', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setNoteFret(song, FIRST_NOTE, 7);

    // Assert
    expect(findNote(edited, FIRST_NOTE)?.fret).toBe(7);
    expect(findNote(song, FIRST_NOTE)?.fret).toBe(0);
  });

  it('shares every untouched branch with the original song', () => {
    const song = makeSong();
    const edited = setNoteFret(song, FIRST_NOTE, 7);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    expect(edited.tracks[0]?.measures[0]?.beats[1]).toBe(song.tracks[0]?.measures[0]?.beats[1]);
    expect(edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[1]).toBe(
      song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[1],
    );
  });

  it('clamps the fret to 0…MAX_FRET', () => {
    expect(findNote(setNoteFret(makeSong(), FIRST_NOTE, -3), FIRST_NOTE)?.fret).toBe(0);
    expect(findNote(setNoteFret(makeSong(), FIRST_NOTE, 99), FIRST_NOTE)?.fret).toBe(29);
  });

  it('returns the same song for an address that does not exist', () => {
    const song = makeSong();
    expect(setNoteFret(song, { ...FIRST_NOTE, noteIndex: 5 }, 3)).toBe(song);
  });
});

describe('setNoteString', () => {
  it('moves a note to another free string', () => {
    const edited = setNoteString(makeSong(), FIRST_NOTE, 2);
    expect(findNote(edited, FIRST_NOTE)).toMatchObject({ string: 2, fret: 0 });
  });

  it('refuses a string that is taken in the same beat or does not exist', () => {
    const song = makeSong();
    expect(setNoteString(song, FIRST_NOTE, 3)).toBe(song);
    expect(setNoteString(song, FIRST_NOTE, 7)).toBe(song);
    expect(setNoteString(song, FIRST_NOTE, 0)).toBe(song);
  });
});

describe('deleteNote', () => {
  it('removes the note and keeps the others in order', () => {
    const edited = deleteNote(makeSong(), FIRST_NOTE);
    expect(edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.map((n) => n.string)).toEqual([3]);
  });

  it('turns the voice into a rest when its last note is removed', () => {
    const address = { ...FIRST_NOTE, beatIndex: 1 };
    const voice = deleteNote(makeSong(), address).tracks[0]?.measures[0]?.beats[1]?.voices[0];
    expect(voice?.notes).toEqual([]);
    expect(voice?.isEmpty).toBe(false);
  });

  it('returns the same song for an address that does not exist', () => {
    const song = makeSong();
    expect(deleteNote(song, { ...FIRST_NOTE, voiceIndex: 3 })).toBe(song);
  });
});
