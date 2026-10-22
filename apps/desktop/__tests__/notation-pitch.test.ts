import type { Track } from '@gp-editor/core';
import {
  clefKind,
  drumPlacement,
  measureAccidentals,
  spellPitch,
  staffPosition,
  writtenMidi,
} from '../src/score/notation/pitch';
import { makeSong, note } from '../test-support/songs';

const GUITAR: Track = makeSong([[]]).tracks[0]!;

describe('spellPitch', () => {
  it('spells white keys as naturals and black keys as sharps in C', () => {
    // Arrange
    const middleC = 60;

    // Act
    const natural = spellPitch(middleC, 0);
    const sharp = spellPitch(middleC + 1, 0);

    // Assert
    expect(natural).toEqual({ step: 28, alter: 0 });
    expect(sharp).toEqual({ step: 28, alter: 1 });
  });

  it('spells black keys as flats in flat keys and as sharps in sharp keys', () => {
    expect(spellPitch(61, -1)).toEqual({ step: 29, alter: -1 }); // Db4 in F major
    expect(spellPitch(70, -1)).toEqual({ step: 34, alter: -1 }); // Bb4, in the key
    expect(spellPitch(70, 2)).toEqual({ step: 33, alter: 1 }); // A#4 in D major
    expect(spellPitch(66, 1)).toEqual({ step: 31, alter: 1 }); // F#4, in the key of G
  });

  it('uses the key spelling for E#, B#, Cb and Fb', () => {
    expect(spellPitch(65, 6)).toEqual({ step: 30, alter: 1 }); // E#4 in F# major
    expect(spellPitch(60, 7)).toEqual({ step: 27, alter: 1 }); // B#3 in C# major
    expect(spellPitch(71, -6)).toEqual({ step: 35, alter: -1 }); // Cb5 in Gb major
    expect(spellPitch(64, -7)).toEqual({ step: 31, alter: -1 }); // Fb4 in Cb major
  });

  it('keeps naturals that leave the key and clamps out-of-range keys', () => {
    expect(spellPitch(65, 2)).toEqual({ step: 31, alter: 0 }); // F natural in D major
    expect(spellPitch(61, 12)).toEqual(spellPitch(61, 7));
    expect(spellPitch(61, -12)).toEqual(spellPitch(61, -7));
  });
});

describe('staff positions and clefs', () => {
  it('counts diatonic steps from the bottom line of each clef', () => {
    expect(staffPosition(spellPitch(64, 0).step, 'treble')).toBe(0); // E4 on the bottom line
    expect(staffPosition(spellPitch(77, 0).step, 'treble')).toBe(8); // F5 on the top line
    expect(staffPosition(spellPitch(43, 0).step, 'bass')).toBe(0); // G2
    expect(staffPosition(spellPitch(57, 0).step, 'bass')).toBe(8); // A3
  });

  it('writes guitar an octave above sounding pitch, including the capo', () => {
    expect(writtenMidi(GUITAR, note(6, 0))).toBe(52); // low E sounds E2, written E3
    expect(writtenMidi({ ...GUITAR, offset: 2 }, note(1, 3))).toBe(64 + 2 + 3 + 12);
    expect(writtenMidi(GUITAR, note(9, 0))).toBe(60 + 12); // unknown string falls back to middle C
  });

  it('chooses treble, bass or percussion staves', () => {
    expect(clefKind(GUITAR, 'treble')).toBe('treble');
    expect(clefKind(GUITAR, 'tenor')).toBe('treble');
    expect(clefKind(GUITAR, 'alto')).toBe('treble');
    expect(clefKind(GUITAR, 'bass')).toBe('bass');
    expect(clefKind(GUITAR, 'neutral')).toBe('percussion');
    expect(clefKind({ ...GUITAR, isPercussion: true }, 'treble')).toBe('percussion');
  });

  it('places common drums and falls back to the middle line', () => {
    expect(drumPlacement(36)).toEqual({ position: 1, isCross: false }); // kick
    expect(drumPlacement(38)).toEqual({ position: 5, isCross: false }); // snare
    expect(drumPlacement(42)).toEqual({ position: 9, isCross: true }); // closed hi-hat
    expect(drumPlacement(49)).toEqual({ position: 10, isCross: true }); // crash
    expect(drumPlacement(51)).toEqual({ position: 8, isCross: true }); // ride
    expect(drumPlacement(44)).toEqual({ position: -1, isCross: true }); // pedal hi-hat
    expect(drumPlacement(99)).toEqual({ position: 4, isCross: false });
  });
});

describe('measureAccidentals', () => {
  const pitch = (midi: number, key = 0, isTied = false) => ({ ...spellPitch(midi, key), isTied });

  it('carries an accidental through the measure and cancels it with a natural', () => {
    // Arrange: C#4, C#4, C4
    const events = [[pitch(61)], [pitch(61)], [pitch(60)]];

    // Act
    const marks = measureAccidentals(events, 0);

    // Assert
    expect(marks).toEqual([['sharp'], [undefined], ['natural']]);
  });

  it('only carries accidentals at the same staff position', () => {
    expect(measureAccidentals([[pitch(61)], [pitch(73)]], 0)).toEqual([['sharp'], ['sharp']]);
  });

  it('follows the key signature and cancels it with naturals', () => {
    const key = 1; // G major: F#
    const marks = measureAccidentals([[pitch(66, key)], [pitch(65, key)], [pitch(66, key)]], key);
    expect(marks).toEqual([[undefined], ['natural'], ['sharp']]);
  });

  it('marks flats in flat keys', () => {
    expect(measureAccidentals([[pitch(61, -1), pitch(70, -1)]], -1)).toEqual([['flat', undefined]]);
  });

  it('never marks tied notes and does not let them change the carried accidental', () => {
    const marks = measureAccidentals([[pitch(61, 0, true)], [pitch(61)]], 0);
    expect(marks).toEqual([[undefined], ['sharp']]);
  });
});
