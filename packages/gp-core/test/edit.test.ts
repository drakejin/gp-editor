import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NO_STROKE, QUARTER, RED } from '../src/model/defaults';
import type { Beat, Note, Song } from '../src/model/song';
import { type StringAddress, deleteNote, findNote, setNoteFret, setNoteString, setNoteVelocity } from '../src/edit/edit-song';
import { DEFAULT_VELOCITY } from '../src/formats/common/velocity';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';

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

/** Beat 0 holds strings 1 (fret 0) and 3 (fret 2); beat 1 holds string 6 (fret 3). */
const AT_STRING_1: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };

describe('findNote', () => {
  it('returns the note on the addressed string', () => {
    expect(findNote(makeSong(), { ...AT_STRING_1, string: 3 })).toMatchObject({ string: 3, fret: 2 });
  });

  it('returns undefined for an empty string or an address outside the song', () => {
    expect(findNote(makeSong(), { ...AT_STRING_1, string: 2 })).toBeUndefined();
    expect(findNote(makeSong(), { ...AT_STRING_1, beatIndex: 9 })).toBeUndefined();
    expect(findNote(makeSong(), { ...AT_STRING_1, trackIndex: -1 })).toBeUndefined();
  });
});

describe('setNoteFret', () => {
  it('returns a new song with the fret changed and leaves the original untouched', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setNoteFret(song, AT_STRING_1, 7);

    // Assert
    expect(findNote(edited, AT_STRING_1)?.fret).toBe(7);
    expect(findNote(song, AT_STRING_1)?.fret).toBe(0);
  });

  it('shares every untouched branch with the original song', () => {
    const song = makeSong();
    const edited = setNoteFret(song, AT_STRING_1, 7);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    expect(edited.tracks[0]?.measures[0]?.beats[1]).toBe(song.tracks[0]?.measures[0]?.beats[1]);
    expect(findNote(edited, { ...AT_STRING_1, string: 3 })).toBe(findNote(song, { ...AT_STRING_1, string: 3 }));
  });

  it('adds a note on an empty string, keeping the notes ordered by string', () => {
    const edited = setNoteFret(makeSong(), { ...AT_STRING_1, string: 2 }, 5);
    const notes = edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes ?? [];
    expect(notes.map((n) => [n.string, n.fret])).toEqual([[1, 0], [2, 5], [3, 2]]);
    expect(notes[1]).toMatchObject({ velocity: DEFAULT_VELOCITY, isTied: false, effect: EMPTY_NOTE_EFFECT });
  });

  it('turns an empty voice into a played beat when a note is added', () => {
    const song = makeSong();
    const beat0 = song.tracks[0]?.measures[0]?.beats[0];
    const withEmptyVoice: Song = {
      ...song,
      tracks: [{ ...song.tracks[0]!, measures: [{ ...song.tracks[0]!.measures[0]!, beats: [{ ...beat0!, voices: [beat0!.voices[0]!, { ...beat0!.voices[0]!, notes: [], isEmpty: true }] }] }] }],
    };
    const voice = setNoteFret(withEmptyVoice, { ...AT_STRING_1, voiceIndex: 1, string: 4 }, 2).tracks[0]?.measures[0]?.beats[0]?.voices[1];
    expect(voice).toMatchObject({ isEmpty: false, notes: [{ string: 4, fret: 2 }] });
  });

  it('clamps the fret to 0…MAX_FRET', () => {
    expect(findNote(setNoteFret(makeSong(), AT_STRING_1, -3), AT_STRING_1)?.fret).toBe(0);
    expect(findNote(setNoteFret(makeSong(), AT_STRING_1, 99), AT_STRING_1)?.fret).toBe(29);
  });

  it('returns the same song for a position that does not exist', () => {
    const song = makeSong();
    expect(setNoteFret(song, { ...AT_STRING_1, string: 7 }, 3)).toBe(song);
    expect(setNoteFret(song, { ...AT_STRING_1, beatIndex: 5 }, 3)).toBe(song);
    expect(setNoteFret(song, AT_STRING_1, 0)).toBe(song);
    expect(setNoteFret(song, { ...AT_STRING_1, string: 2 }, Number.NaN)).toBe(song);
  });
});

describe('setNoteFret on an empty voice', () => {
  const quarters = (): EventSpec[] => [play(4, n(1, 0)), play(4, n(1, 2)), play(4, n(1, 3)), play(4, n(1, 5))];
  const SECOND_VOICE: StringAddress = { ...AT_STRING_1, voiceIndex: 1, string: 4 };

  it('gives the second voice a note as long as the beat, with rests before and after it to the bar lines', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[quarters()]]] }));

    // Act
    const edited = setNoteFret(song, { ...SECOND_VOICE, beatIndex: 1 }, 2);

    // Assert
    expect(voiceLayout(edited, 0, 0, 1)).toEqual(['0:4:r', '960:4:4/2', '1920:2:r']);
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    expect(findNote(edited, { ...SECOND_VOICE, beatIndex: 1 })).toMatchObject({ fret: 2, velocity: DEFAULT_VELOCITY, effect: EMPTY_NOTE_EFFECT });
    assertEditInvariants(edited);
  });

  it('takes the duration of the beat it is typed on', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(8, n(1, 0)), play(8, n(1, 2)), play(4, n(1, 3)), play(2, n(1, 5))]]]] }));
    const edited = setNoteFret(song, { ...SECOND_VOICE, beatIndex: 1 }, 7);
    expect(voiceLayout(edited, 0, 0, 1)).toEqual(['0:8:r', '480:8:4/7', '960:2.:r']);
    assertEditInvariants(edited);
  });

  it('cuts the rest of the second voice the note falls in', () => {
    // Arrange: the second voice holds a half note and a half rest
    const song = deepFreeze(buildSong({ tracks: [[[quarters(), [play(2, n(5, 0)), rest(2)]]]] }));

    // Act
    const edited = setNoteFret(song, { ...SECOND_VOICE, beatIndex: 3 }, 9);

    // Assert
    expect(voiceLayout(edited, 0, 0, 1)).toEqual(['0:2:5/0', '1920:4:r', '2880:4:4/9']);
    assertEditInvariants(edited);
  });

  it('returns the same song inside a note of the same voice', () => {
    const song = deepFreeze(buildSong({ tracks: [[[quarters(), [play(2, n(5, 0)), rest(2)]]]] }));
    expect(setNoteFret(song, { ...SECOND_VOICE, beatIndex: 1 }, 9)).toBe(song);
  });

  it('keeps the note through a GP5 save', () => {
    // Arrange
    const edited = setNoteFret(deepFreeze(buildSong({ tracks: [[[quarters()]]] })), { ...SECOND_VOICE, beatIndex: 2 }, 4);

    // Act
    const saved = readSong(writeSong(edited, 'gp5'));

    // Assert
    expect(voiceLayout(saved, 0, 0, 1)).toEqual(['0:2:r', '1920:4:4/4', '2880:4:r']);
  });
});

describe('setNoteString', () => {
  it('moves a note to another free string', () => {
    const edited = setNoteString(makeSong(), AT_STRING_1, 2);
    expect(findNote(edited, { ...AT_STRING_1, string: 2 })).toMatchObject({ string: 2, fret: 0 });
    expect(findNote(edited, AT_STRING_1)).toBeUndefined();
  });

  it('refuses a string that is taken, does not exist, or an empty position', () => {
    const song = makeSong();
    expect(setNoteString(song, AT_STRING_1, 3)).toBe(song);
    expect(setNoteString(song, AT_STRING_1, 7)).toBe(song);
    expect(setNoteString(song, AT_STRING_1, 0)).toBe(song);
    expect(setNoteString(song, { ...AT_STRING_1, string: 2 }, 1)).toBe(song);
  });
});

describe('deleteNote', () => {
  it('removes the note and keeps the others in order', () => {
    const edited = deleteNote(makeSong(), AT_STRING_1);
    expect(edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.map((n) => n.string)).toEqual([3]);
  });

  it('turns the voice into a rest when its last note is removed', () => {
    const voice = deleteNote(makeSong(), { ...AT_STRING_1, beatIndex: 1, string: 6 }).tracks[0]?.measures[0]?.beats[1]?.voices[0];
    expect(voice?.notes).toEqual([]);
    expect(voice?.isEmpty).toBe(false);
  });

  it('returns the same song when there is no note at the position', () => {
    const song = makeSong();
    expect(deleteNote(song, { ...AT_STRING_1, string: 2 })).toBe(song);
    expect(deleteNote(song, { ...AT_STRING_1, voiceIndex: 3 })).toBe(song);
  });
});

describe('setNoteVelocity', () => {
  it('sets the velocity of the note, rounded', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setNoteVelocity(song, AT_STRING_1, 62.6);

    // Assert
    expect(findNote(edited, AT_STRING_1)?.velocity).toBe(63);
    expect(findNote(song, AT_STRING_1)?.velocity).toBe(95);
    expect(findNote(edited, { ...AT_STRING_1, string: 3 })).toBe(findNote(song, { ...AT_STRING_1, string: 3 }));
  });

  it('keeps the velocity between ppp (15) and fff (127)', () => {
    expect(findNote(setNoteVelocity(makeSong(), AT_STRING_1, 0), AT_STRING_1)?.velocity).toBe(15);
    expect(findNote(setNoteVelocity(makeSong(), AT_STRING_1, 300), AT_STRING_1)?.velocity).toBe(127);
  });

  it('returns the same song for the same velocity, a velocity that is not a number or a missing note', () => {
    const song = makeSong();
    expect(setNoteVelocity(song, AT_STRING_1, 95)).toBe(song);
    expect(setNoteVelocity(song, AT_STRING_1, Number.NaN)).toBe(song);
    expect(setNoteVelocity(song, { ...AT_STRING_1, string: 2 }, 63)).toBe(song);
  });
});
