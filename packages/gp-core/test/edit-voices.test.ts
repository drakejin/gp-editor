import { describe, expect, it } from 'vitest';
import { MAX_VOICES } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { findVoice } from '../src/edit/addresses';
import { copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from '../src/edit/beat-ranges';
import { deleteBeat, insertBeat, setBeatDuration } from '../src/edit/beats';
import { toggleDrumNote } from '../src/edit/drum-notes';
import { type StringAddress, findNote, setNoteFret } from '../src/edit/edit-song';
import { toggleNoteEffect } from '../src/edit/effects';
import { enterPlayedNotes } from '../src/edit/pitch-entry';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, dur, n, play, voiceLayout } from './helpers/edit-songs';

/** Voice 1 plays four quarters; the beats hold two voice slots, as a GP3–GP5 file's do. */
const quarters = (): EventSpec[] => [play(4, n(1, 0)), play(4, n(1, 2)), play(4, n(1, 3)), play(4, n(1, 5))];
const twoBars = (): Song => deepFreeze(buildSong({ tracks: [[[quarters()], [quarters()]]] }));

const VOICE_3: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 2, string: 3 };
const VOICE_4: StringAddress = { ...VOICE_3, voiceIndex: 3, string: 5 };

function slotCounts(song: Song, measureIndex: number): number[] {
  return song.tracks[0]?.measures[measureIndex]?.beats.map((beat) => beat.voices.length) ?? [];
}

describe('voice slots', () => {
  it('has four voices a beat can hold', () => {
    expect(MAX_VOICES).toBe(4);
  });

  it('reads a slot a two-voice beat lacks as an empty voice, up to the fourth voice', () => {
    // Arrange
    const song = twoBars();

    // Act / Assert
    expect(findVoice(song, VOICE_3)).toMatchObject({ isEmpty: true, notes: [] });
    expect(findVoice(song, VOICE_4)).toMatchObject({ isEmpty: true, notes: [] });
    expect(findVoice(song, { ...VOICE_3, voiceIndex: 4 })).toBeUndefined();
    expect(findVoice(song, { ...VOICE_3, voiceIndex: -1 })).toBeUndefined();
  });
});

describe('editing voices 3 and 4 of a two-voice bar', () => {
  it('enters a note in voice 3, with rests to the bar lines, the other voices untouched', () => {
    // Arrange
    const song = twoBars();

    // Act
    const edited = setNoteFret(song, { ...VOICE_3, beatIndex: 1 }, 5);

    // Assert
    expect(voiceLayout(edited, 0, 0, 2)).toEqual(['0:4:r', '960:4:3/5', '1920:2:r']);
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    expect(slotCounts(edited, 0)).toEqual([3, 3, 3, 3]);
    expect(edited.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    assertEditInvariants(edited);
  });

  it('enters notes in voice 4 beside voice 3', () => {
    // Arrange
    const withVoice3 = setNoteFret(twoBars(), VOICE_3, 5);

    // Act
    const edited = setNoteFret(withVoice3, { ...VOICE_4, beatIndex: 2 }, 3);

    // Assert
    expect(voiceLayout(edited, 0, 0, 2)).toEqual(['0:4:3/5', '960:2.:r']);
    expect(voiceLayout(edited, 0, 0, 3)).toEqual(['0:2:r', '1920:4:5/3', '2880:4:r']);
    expect(slotCounts(edited, 0)).toEqual([4, 4, 4, 4]);
    assertEditInvariants(edited);
  });

  it('refuses a voice past the fourth', () => {
    const song = twoBars();
    expect(setNoteFret(song, { ...VOICE_3, voiceIndex: MAX_VOICES }, 5)).toBe(song);
  });

  it('changes a voice 4 beat’s duration without moving the other voices', () => {
    // Arrange
    const song = setNoteFret(twoBars(), VOICE_4, 7);

    // Act
    const edited = setBeatDuration(song, VOICE_4, dur(2));

    // Assert
    expect(voiceLayout(edited, 0, 0, 3)).toEqual(['0:2:5/7', '1920:2:r']);
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    assertEditInvariants(edited);
  });

  it('inserts and deletes beats in voice 3', () => {
    // Arrange
    const song = setNoteFret(twoBars(), VOICE_3, 5);

    // Act
    const inserted = insertBeat(song, VOICE_3, 'after');
    const deleted = deleteBeat(inserted, VOICE_3);

    // Assert
    expect(voiceLayout(inserted, 0, 0, 2)).toEqual(['0:4:3/5', '960:4:r', '1920:2:r']);
    expect(voiceLayout(deleted, 0, 0, 2).every((event) => event.endsWith(':r'))).toBe(true);
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    assertEditInvariants(deleted);
  });

  it('toggles an effect on a voice 3 note only', () => {
    // Arrange
    const song = setNoteFret(twoBars(), VOICE_3, 5);

    // Act
    const edited = toggleNoteEffect(song, VOICE_3, 'palmMute');

    // Assert
    expect(findNote(edited, VOICE_3)?.effect.palmMute).toBe(true);
    expect(findNote(edited, { ...VOICE_3, voiceIndex: 0, string: 1 })?.effect.palmMute).toBe(false);
  });

  it('copies voice 3 beats and pastes them into voice 4 of the next bar', () => {
    // Arrange: voice 3 holds a quarter, then a note typed into the dotted half rest after it
    const song = setNoteFret(setNoteFret(twoBars(), VOICE_3, 5), { ...VOICE_3, beatIndex: 1, string: 2 }, 8);
    const fragment = copyBeats(song, VOICE_3, { ...VOICE_3, beatIndex: 1 });

    // Act
    const pasted = insertBeatsFlowing(song, { ...VOICE_4, measureIndex: 1 }, fragment);

    // Assert
    expect(fragment.items.map((item) => item.notes.map((note) => `${note.string}/${note.fret}`))).toEqual([['3/5'], ['2/8']]);
    expect(voiceLayout(pasted, 0, 1, 3)).toEqual(['0:4:3/5', '960:2.:2/8']);
    expect(voiceLayout(pasted, 0, 1, 0)).toEqual(voiceLayout(song, 0, 1, 0));
    assertEditInvariants(pasted);
  });

  it('cuts voice 4 beats, the other voices staying where they are', () => {
    // Arrange
    const song = setNoteFret(twoBars(), VOICE_4, 7);

    // Act
    const cut = deleteBeatsFlowing(song, VOICE_4, VOICE_4);

    // Assert
    expect(voiceLayout(cut, 0, 0, 3).every((event) => event.endsWith(':r'))).toBe(true);
    expect(voiceLayout(cut, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    assertEditInvariants(cut);
  });

  it('enters played notes (MIDI step entry) in voice 3', () => {
    // Arrange
    const song = twoBars();

    // Act
    const entry = enterPlayedNotes(song, { ...VOICE_3, beatIndex: 2 }, [{ pitch: 57 }]);

    // Assert
    expect(entry.entered).toBe(1);
    expect(voiceLayout(entry.song, 0, 0, 2)).toEqual(['0:2:r', '1920:4:3/2', '2880:4:r']);
  });

  it('enters a played chord on one beat of an empty voice, also where the rests before it add beats', () => {
    // Arrange: voice 1 = half, dotted quarter, eighth; the cursor on the eighth (at 3360), voice 4
    const song = deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0)), play(dur(4, { dotted: true }), n(1, 2)), play(8, n(1, 3))]]]] }));

    // Act: E4 and B3 played together
    const entry = enterPlayedNotes(song, { ...VOICE_4, beatIndex: 2 }, [{ pitch: 64 }, { pitch: 59 }]);

    // Assert: both notes on the eighth at 3360
    const layout = voiceLayout(entry.song, 0, 0, 3);
    expect(layout[layout.length - 1]).toMatch(/^3360:8:\d\/\d+,\d\/\d+$/);
    expect(layout.filter((event) => !event.endsWith(':r'))).toHaveLength(1);
    assertEditInvariants(entry.song);
  });

  it('puts a drum hit in voice 4 of a drum track', () => {
    // Arrange
    const song = twoBars();
    const drums: Song = { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) };

    // Act
    const edited = toggleDrumNote(drums, VOICE_4, 36);

    // Assert
    expect(findNote(edited, VOICE_4)?.fret).toBe(36);
  });
});
