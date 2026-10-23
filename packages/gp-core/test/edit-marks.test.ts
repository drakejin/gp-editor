import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { insertBeat, setBeatDuration } from '../src/edit/beats';
import { toggleNoteEffect } from '../src/edit/effects';
import { setBeatRasgueado, toggleBeatPedal, toggleDirection, toggleHairpin } from '../src/edit/marks';
import { measureTicks } from '../src/model/defaults';
import type { Hairpin, Song } from '../src/model/song';
import { buildSong, deepFreeze, dur, n, play, rest } from './helpers/edit-songs';

const BAR = measureTicks(4, 4);
const QUARTER_TICKS = BAR / 4;

/** Two bars of four quarter notes on string 1 (voice 2 empty). */
function makeSong(): Song {
  const bar = [[play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), rest(4)]];
  return deepFreeze(buildSong({ tracks: [[bar, bar]] }));
}

const at = (measureIndex: number, beatIndex: number, voiceIndex = 0): BeatAddress => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex });
const beatsOf = (song: Song, measureIndex = 0) => song.tracks[0]?.measures[measureIndex]?.beats ?? [];
const hairpins = (song: Song, measureIndex = 0): readonly (Hairpin | undefined)[] => beatsOf(song, measureIndex).map((beat) => beat.hairpin);

describe('toggleDirection', () => {
  it('adds directions in Guitar Pro 5 order and removes them again, leaving no empty list', () => {
    // Arrange
    const song = makeSong();

    // Act
    const added = toggleDirection(toggleDirection(toggleDirection(song, 1, 'daSegnoAlCoda'), 1, 'segno'), 1, 'coda');
    const removed = toggleDirection(toggleDirection(toggleDirection(added, 1, 'segno'), 1, 'coda'), 1, 'daSegnoAlCoda');

    // Assert
    expect(added.measureHeaders[1]?.directions).toEqual(['coda', 'segno', 'daSegnoAlCoda']);
    expect(added.measureHeaders[0]).toBe(song.measureHeaders[0]);
    expect(removed.measureHeaders[1]).not.toHaveProperty('directions');
  });

  it('returns the same song for a bar that does not exist or a direction it does not know', () => {
    const song = makeSong();
    expect(toggleDirection(song, 5, 'segno')).toBe(song);
    expect(toggleDirection(song, 0, 'alFine' as never)).toBe(song);
  });
});

describe('toggleHairpin', () => {
  it('puts a crescendo on every beat from one beat to another, in either order', () => {
    // Act
    const song = toggleHairpin(makeSong(), at(1, 1), at(0, 2), 'crescendo');

    // Assert
    expect(hairpins(song, 0)).toEqual([undefined, undefined, 'crescendo', 'crescendo']);
    expect(hairpins(song, 1)).toEqual(['crescendo', 'crescendo', undefined, undefined]);
  });

  it('removes the hairpin when every beat of the range has it, and replaces another kind', () => {
    // Arrange
    const crescendo = toggleHairpin(makeSong(), at(0, 0), at(0, 1), 'crescendo');

    // Act
    const decrescendo = toggleHairpin(crescendo, at(0, 1), at(0, 2), 'decrescendo');
    const removed = toggleHairpin(crescendo, at(0, 0), at(0, 1), 'crescendo');

    // Assert
    expect(hairpins(decrescendo)).toEqual(['crescendo', 'decrescendo', 'decrescendo', undefined]);
    expect(hairpins(removed)).toEqual([undefined, undefined, undefined, undefined]);
    expect(beatsOf(removed)[0]).not.toHaveProperty('hairpin');
  });

  it('works on one beat and returns the same song for a beat that does not exist', () => {
    const song = makeSong();
    expect(hairpins(toggleHairpin(song, at(0, 3), at(0, 3), 'decrescendo'))).toEqual([undefined, undefined, undefined, 'decrescendo']);
    expect(toggleHairpin(song, at(4, 0), at(4, 0), 'crescendo')).toBe(song);
  });
});

describe('setBeatRasgueado', () => {
  it('sets a pattern, replaces it and removes it', () => {
    // Arrange
    const song = makeSong();

    // Act
    const ami = setBeatRasgueado(song, at(0, 0), 'amiTriplet');
    const peami = setBeatRasgueado(ami, at(0, 0), 'peami');
    const none = setBeatRasgueado(peami, at(0, 0), undefined);

    // Assert
    expect(beatsOf(ami)[0]?.rasgueado).toBe('amiTriplet');
    expect(beatsOf(peami)[0]?.rasgueado).toBe('peami');
    expect(beatsOf(none)[0]).not.toHaveProperty('rasgueado');
    expect(setBeatRasgueado(ami, at(0, 0), 'amiTriplet')).toBe(ami);
  });

  it('returns the same song for an unknown pattern', () => {
    const song = makeSong();
    expect(setBeatRasgueado(song, at(0, 0), 'xyz' as never)).toBe(song);
  });
});

describe('toggleBeatPedal', () => {
  it('presses the pedal where the beat starts and releases it where the beat ends', () => {
    // Act
    const song = toggleBeatPedal(toggleBeatPedal(makeSong(), at(0, 1), 'down'), at(0, 3), 'up');

    // Assert
    expect(song.tracks[0]?.measures[0]?.pedals).toEqual([
      { offset: QUARTER_TICKS, action: 'down' },
      { offset: BAR, action: 'up' },
    ]);
  });

  it('keeps a release before a press at the same place, and removes a mark pressed again', () => {
    // Arrange
    const pressed = toggleBeatPedal(makeSong(), at(0, 1), 'down');

    // Act
    const changed = toggleBeatPedal(pressed, at(0, 0), 'up');
    const removed = toggleBeatPedal(toggleBeatPedal(changed, at(0, 1), 'down'), at(0, 0), 'up');

    // Assert
    expect(changed.tracks[0]?.measures[0]?.pedals).toEqual([
      { offset: QUARTER_TICKS, action: 'up' },
      { offset: QUARTER_TICKS, action: 'down' },
    ]);
    expect(removed.tracks[0]?.measures[0]).not.toHaveProperty('pedals');
  });

  it('returns the same song for an empty voice or a beat that does not exist', () => {
    const song = makeSong();
    expect(toggleBeatPedal(song, at(0, 0, 1), 'down')).toBe(song);
    expect(toggleBeatPedal(song, at(0, 9), 'down')).toBe(song);
  });
});

describe('fade toggles', () => {
  const note = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };
  const effectOf = (song: Song) => beatsOf(song)[0]?.voices[0]?.notes[0]?.effect;

  it('turns fade out and volume swell on and off, one fade at a time', () => {
    // Act
    const fadeIn = toggleNoteEffect(makeSong(), note, 'fadeIn');
    const fadeOut = toggleNoteEffect(fadeIn, note, 'fadeOut');
    const swell = toggleNoteEffect(fadeOut, note, 'volumeSwell');
    const off = toggleNoteEffect(swell, note, 'volumeSwell');

    // Assert
    expect([effectOf(fadeOut)?.fadeIn, effectOf(fadeOut)?.fadeOut, effectOf(fadeOut)?.volumeSwell]).toEqual([false, true, undefined]);
    expect([effectOf(swell)?.fadeIn, effectOf(swell)?.fadeOut, effectOf(swell)?.volumeSwell]).toEqual([false, undefined, true]);
    expect(effectOf(off)).not.toHaveProperty('volumeSwell');
    expect(effectOf(toggleNoteEffect(swell, note, 'fadeIn'))).toMatchObject({ fadeIn: true });
    expect(effectOf(toggleNoteEffect(swell, note, 'fadeIn'))).not.toHaveProperty('volumeSwell');
  });
});

describe('beat edits keep the marks', () => {
  it('keeps a beat’s hairpin and rasgueado when its duration changes or a beat goes in before it', () => {
    // Arrange
    const marked = setBeatRasgueado(toggleHairpin(makeSong(), at(0, 1), at(0, 1), 'crescendo'), at(0, 1), 'mi');

    // Act
    const shorter = setBeatDuration(marked, at(0, 1), dur(8));
    const inserted = insertBeat(marked, at(0, 0), 'after');

    // Assert
    expect(beatsOf(shorter)[1]).toMatchObject({ hairpin: 'crescendo', rasgueado: 'mi' });
    expect(beatsOf(inserted).find((beat) => beat.rasgueado !== undefined)).toMatchObject({ hairpin: 'crescendo', rasgueado: 'mi' });
  });
});
