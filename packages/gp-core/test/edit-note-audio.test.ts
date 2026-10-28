import { describe, expect, it } from 'vitest';
import type { StringAddress } from '../src/edit/addresses';
import { parseNoteAudio, setNoteAudio } from '../src/edit/note-audio';
import { parseBeatFragment, serializeBeatFragment } from '../src/edit/fragment-json';
import { DEFAULT_NOTE_AUDIO, NOTE_AUDIO_LIMITS, NO_STROKE, toNoteAudio } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { buildSong, deepFreeze, dur, n, play } from './helpers/edit-songs';

const AT: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };

function makeSong(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0), n(2, 3)), play(2, n(1, 1))]]]] }));
}

function noteAt(song: Song, string = 2): Note | undefined {
  return song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.find((note) => note.string === string);
}

describe('toNoteAudio', () => {
  it('rounds and clamps each setting to its range', () => {
    expect(toNoteAudio({ durationPercent: 250.4, offsetPercent: -3, velocityOffset: 300 })).toEqual({
      durationPercent: NOTE_AUDIO_LIMITS.maxDurationPercent,
      offsetPercent: 0,
      velocityOffset: 127,
    });
    expect(toNoteAudio({ durationPercent: 0, offsetPercent: 120.6, velocityOffset: -300 })).toEqual({
      durationPercent: 1,
      offsetPercent: NOTE_AUDIO_LIMITS.maxOffsetPercent,
      velocityOffset: -127,
    });
  });

  it('is undefined for the defaults (the note plays as written) and for values that are not numbers', () => {
    expect(toNoteAudio(DEFAULT_NOTE_AUDIO)).toBeUndefined();
    expect(toNoteAudio({ ...DEFAULT_NOTE_AUDIO, durationPercent: Number.NaN })).toBeUndefined();
  });
});

describe('setNoteAudio', () => {
  it('sets a note’s play duration, start offset and velocity change, leaving the other notes alone', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setNoteAudio(song, AT, { durationPercent: 50, offsetPercent: 25, velocityOffset: -10 });

    // Assert
    expect(noteAt(edited)?.audio).toEqual({ durationPercent: 50, offsetPercent: 25, velocityOffset: -10 });
    expect(noteAt(edited, 1)).toBe(noteAt(song, 1));
    expect(noteAt(song)?.audio).toBeUndefined();
  });

  it('removes the settings when they are back to the defaults', () => {
    // Arrange
    const edited = setNoteAudio(makeSong(), AT, { durationPercent: 80, offsetPercent: 0, velocityOffset: 0 });

    // Act
    const reset = setNoteAudio(edited, AT, DEFAULT_NOTE_AUDIO);

    // Assert
    expect(noteAt(reset)).not.toHaveProperty('audio');
  });

  it('returns the same song when nothing changes or no note is there', () => {
    const song = makeSong();
    const edited = setNoteAudio(song, AT, { durationPercent: 80, offsetPercent: 0, velocityOffset: 0 });
    expect(setNoteAudio(song, AT, DEFAULT_NOTE_AUDIO)).toBe(song);
    expect(setNoteAudio(edited, AT, { durationPercent: 80, offsetPercent: 0, velocityOffset: 0 })).toBe(edited);
    expect(setNoteAudio(song, { ...AT, string: 5 }, { durationPercent: 50, offsetPercent: 0, velocityOffset: 0 })).toBe(song);
  });
});

describe('parseNoteAudio', () => {
  it('accepts settings within range and refuses anything else', () => {
    expect(parseNoteAudio({ durationPercent: 50, offsetPercent: 10, velocityOffset: -5 })).toEqual({ durationPercent: 50, offsetPercent: 10, velocityOffset: -5 });
    expect(parseNoteAudio({ durationPercent: 0, offsetPercent: 10, velocityOffset: 0 })).toBeUndefined();
    expect(parseNoteAudio({ durationPercent: 50, offsetPercent: 100, velocityOffset: 0 })).toBeUndefined();
    expect(parseNoteAudio({ durationPercent: 50, offsetPercent: 0, velocityOffset: 1.5 })).toBeUndefined();
    expect(parseNoteAudio('loud')).toBeUndefined();
  });

  it('travels with a copied note through the clipboard JSON, and a bad one refuses the fragment', () => {
    // Arrange
    const audio = { durationPercent: 60, offsetPercent: 5, velocityOffset: 12 };
    const fragment = { isPercussion: false, items: [{ duration: dur(4), notes: [{ ...n(1, 5), audio }], stroke: NO_STROKE, pickStroke: 'none' as const }] };
    const json = JSON.parse(serializeBeatFragment(fragment)) as { items: { notes: { audio: unknown }[] }[] };

    // Act
    const parsed = parseBeatFragment(json);
    const firstNote = json.items[0]?.notes[0];
    if (firstNote !== undefined) {
      firstNote.audio = { durationPercent: 500, offsetPercent: 0, velocityOffset: 0 };
    }

    // Assert
    expect(parsed?.items[0]?.notes[0]?.audio).toEqual(audio);
    expect(parseBeatFragment(json)).toBeUndefined();
  });
});
