import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { pasteBeats } from '../src/edit/beat-paste';
import { copyBeats } from '../src/edit/beat-ranges';
import { fitFragment } from '../src/edit/paste-fit';
import { EMPTY_NOTE_EFFECT, NO_STROKE, PERCUSSION_TUNING } from '../src/model/defaults';
import type { Note, Song, Track } from '../src/model/song';
import { assertEditInvariants, buildSong, deepFreeze, dur, n, play, voiceLayout } from './helpers/edit-songs';

const STANDARD = [64, 59, 55, 50, 45, 40];
const DROP_D = [64, 59, 55, 50, 45, 38];
const BASS = [43, 38, 33, 28];
const SEVEN = [64, 59, 55, 50, 45, 40, 35];

function trackOf(tuning: readonly number[], extra: Partial<Track> = {}): Track {
  const song = buildSong({ tracks: [[[[]]]] });
  const track = song.tracks[0] as Track;
  return { ...track, strings: tuning.map((open, i) => ({ number: i + 1, tuning: open })), ...extra };
}

const DRUMS = trackOf(PERCUSSION_TUNING, { isPercussion: true });

function item(...notes: Note[]): BeatFragmentItem {
  return { duration: dur(4), notes, stroke: NO_STROKE, pickStroke: 'none' };
}

function pitched(tuning: readonly number[], capo: number, ...items: BeatFragmentItem[]): BeatFragment {
  return { isPercussion: false, tuning, capo, items };
}

function drums(...items: BeatFragmentItem[]): BeatFragment {
  return { isPercussion: true, items };
}

/** Sounding MIDI pitches of an item's notes on a track, low to high. */
function pitches(fitted: BeatFragmentItem | undefined, track: Track): number[] {
  return (fitted?.notes ?? []).map((note) => (track.isPercussion ? note.fret : track.offset + (track.strings[note.string - 1]?.tuning ?? 0) + note.fret)).sort((a, b) => a - b);
}

describe('fitFragment: pitched beats onto a pitched track, pitch for pitch', () => {
  it('leaves the beats as they were onto the same tuning and capo', () => {
    const fragment = pitched(STANDARD, 0, item(n(6, 3), n(1, 0)));
    const fitted = fitFragment(fragment, trackOf(STANDARD));
    expect(fitted).toEqual({ items: fragment.items, mapping: 'asCopied', octaveShifted: 0, leftOut: 0 });
  });

  it('moves a low E string note two frets up onto drop D, the other strings as they were', () => {
    // Act
    const fitted = fitFragment(pitched(STANDARD, 0, item(n(1, 3), n(6, 5))), trackOf(DROP_D));

    // Assert
    expect(fitted.mapping).toBe('byPitch');
    expect(fitted.items[0]?.notes.map((note) => [note.string, note.fret])).toEqual([
      [1, 3],
      [6, 7],
    ]);
  });

  it('keeps every pitch from a capo onto a track without one, and onto a 7-string guitar’s low B string', () => {
    const fromCapo = fitFragment(pitched(STANDARD, 2, item(n(1, 3))), trackOf(STANDARD));
    expect(pitches(fromCapo.items[0], trackOf(STANDARD))).toEqual([69]);
    const lowB = fitFragment(pitched(SEVEN, 0, item(n(7, 2))), trackOf(STANDARD));
    expect(pitches(lowB.items[0], trackOf(STANDARD))).toEqual([49]);
  });

  it('puts a guitar’s notes on a 4-string bass by pitch: one too high for the neck an octave down, a chord’s extra notes left out', () => {
    // Arrange: E5, above the bass's 24th fret on G; a six-note E chord
    const bass = trackOf(BASS);
    const fragment = pitched(STANDARD, 0, item(n(1, 12)), item(n(1, 0), n(2, 0), n(3, 1), n(4, 2), n(5, 2), n(6, 0)));

    // Act
    const fitted = fitFragment(fragment, bass);

    // Assert
    expect(pitches(fitted.items[0], bass)).toEqual([64]);
    expect(fitted.items[1]?.notes).toHaveLength(4);
    expect(fitted.items[1]?.notes.every((note) => note.string <= 4)).toBe(true);
    expect(fitted).toMatchObject({ mapping: 'byPitch', octaveShifted: 1, leftOut: 2 });
  });

  it('keeps a tie on the string of the note it continues', () => {
    const fitted = fitFragment(pitched(STANDARD, 0, item(n(6, 5)), item({ ...n(6, 5), isTied: true })), trackOf(DROP_D));
    expect(fitted.items[1]?.notes[0]).toMatchObject({ string: 6, fret: 7, isTied: true });
  });

  it('keeps frets and strings from a clipboard without a tuning (an earlier version), leaving out notes on strings the track lacks', () => {
    const fitted = fitFragment({ isPercussion: false, items: [item(n(1, 3), n(6, 5))] }, trackOf(BASS));
    expect(fitted).toMatchObject({ mapping: 'asCopied', leftOut: 1 });
    expect(fitted.items[0]?.notes.map((note) => note.string)).toEqual([1]);
  });
});

describe('fitFragment: between drums and pitched tracks, by MIDI number', () => {
  it('makes each pitched note the drum of its MIDI pitch, its bend and slide left behind', () => {
    // Arrange: E4 bent on string 1, A2 on string 5
    const bent: Note = { ...n(1, 0), effect: { ...EMPTY_NOTE_EFFECT, bend: { points: [{ position: 0, value: 0 }, { position: 12, value: 4 }] }, slides: ['shift'], accentuatedNote: true } };

    // Act
    const fitted = fitFragment(pitched(STANDARD, 0, item(bent, n(5, 0))), DRUMS);

    // Assert
    expect(fitted.mapping).toBe('pitchedToDrums');
    expect(pitches(fitted.items[0], DRUMS)).toEqual([45, 64]);
    const e4 = fitted.items[0]?.notes.find((note) => note.fret === 64);
    expect(e4?.effect).toMatchObject({ slides: [], accentuatedNote: true });
    expect(e4?.effect.bend).toBeUndefined();
  });

  it('places each drum’s key as a pitch on a guitar’s strings, below the neck an octave up', () => {
    // Arrange: kick 36, snare 38, closed hi-hat 42
    const guitar = trackOf(STANDARD);

    // Act
    const fitted = fitFragment(drums(item(n(1, 36), n(2, 38), n(3, 42))), guitar);

    // Assert
    expect(fitted).toMatchObject({ mapping: 'drumsToPitched', octaveShifted: 2, leftOut: 0 });
    expect(pitches(fitted.items[0], guitar)).toEqual([42, 48, 50]);
  });

  it('brings a pitch outside the drum keys 0–127 into them by octaves', () => {
    const high = fitFragment(pitched([120], 0, item(n(1, 20))), DRUMS);
    const low = fitFragment(pitched([3], -10, item(n(1, 2))), DRUMS);
    expect(pitches(high.items[0], DRUMS)).toEqual([128 - 12]);
    expect(pitches(low.items[0], DRUMS)).toEqual([-5 + 12]);
  });

  it('keeps only the rhythm onto drums from a clipboard without a tuning, every note counted out', () => {
    const fitted = fitFragment({ isPercussion: false, items: [item(n(1, 3), n(2, 1)), item(n(1, 0))] }, DRUMS);
    expect(fitted).toMatchObject({ mapping: 'rhythmOnly', leftOut: 3 });
    expect(fitted.items.every((each) => each.notes.length === 0)).toBe(true);
  });

  it('moves drum notes on strings a smaller kit lacks onto its free strings', () => {
    const fitted = fitFragment(drums(item(n(1, 36), n(7, 42))), trackOf([0, 0, 0, 0, 0], { isPercussion: true }));
    expect(fitted.items[0]?.notes.map((note) => [note.string, note.fret])).toEqual([
      [1, 36],
      [2, 42],
    ]);
  });
});

function at(measureIndex: number, beatIndex: number, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex: 0 };
}

/** A guitar (track 1), a drop-D guitar (track 2) and drums (track 3), two bars each. */
function threeTracks(): Song {
  const song = buildSong({ tracks: [0, 1, 2].map(() => [[[play(4, n(6, 5)), play(4, n(1, 3)), play(2, n(2, 1))]], [[play(1, n(3, 2))]]]) });
  const tracks = song.tracks.map((track, index) => {
    if (index === 1) {
      return { ...track, strings: DROP_D.map((open, i) => ({ number: i + 1, tuning: open })) };
    }
    return index === 2 ? { ...track, isPercussion: true, strings: PERCUSSION_TUNING.map((open, i) => ({ number: i + 1, tuning: open })) } : track;
  });
  return deepFreeze({ ...song, tracks });
}

describe('pasteBeats into another track', () => {
  it('copies the track’s tuning and capo with the beats', () => {
    const song = threeTracks();
    expect(copyBeats(song, at(0, 0), at(0, 1))).toMatchObject({ isPercussion: false, tuning: STANDARD, capo: 0 });
    expect(copyBeats(song, at(0, 0, 2), at(0, 1, 2)).tuning).toBeUndefined();
  });

  it('writes a guitar’s beats over a drop-D guitar by pitch, and says so', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const pasted = pasteBeats(song, at(0, 0, 1), copyBeats(song, at(0, 0), at(0, 2)));

    // Assert
    expect(voiceLayout(pasted.song, 1, 0, 0)).toEqual(['0:4:6/7', '960:4:1/3', '1920:2:2/1']);
    expect(pasted).toMatchObject({ isPasted: true, mapping: 'byPitch', octaveShifted: 0, leftOut: 0 });
    assertEditInvariants(pasted.song);
  });

  it('writes a guitar’s beats into a drum track as the drums of their pitches, and drums into a guitar by key', () => {
    const song = threeTracks();
    const intoDrums = pasteBeats(song, at(0, 0, 2), copyBeats(song, at(0, 0), at(0, 2)));
    expect(voiceLayout(intoDrums.song, 2, 0, 0)).toEqual(['0:4:1/45', '960:4:1/67', '1920:2:1/60']);
    expect(intoDrums.mapping).toBe('pitchedToDrums');
    const intoGuitar = pasteBeats(intoDrums.song, at(1, 0), copyBeats(intoDrums.song, at(0, 0, 2), at(0, 2, 2)));
    expect(intoGuitar.mapping).toBe('drumsToPitched');
    expect(copyBeats(intoGuitar.song, at(1, 0), at(1, 2)).items.map((each) => pitches(each, song.tracks[0] as Track))).toEqual([[45], [67], [60]]);
    assertEditInvariants(intoGuitar.song);
  });
});
