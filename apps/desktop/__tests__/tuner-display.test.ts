import { DEFAULT_GATE_DB, STANDARD_BASS_TUNING, STANDARD_TUNING, toTunerReading } from '@gp-editor/core';
import {
  IN_TUNE_CENTS,
  centsText,
  frequencyText,
  isInTune,
  levelFraction,
  needleFraction,
  noteParts,
  stringButtons,
  tunerStatusText,
  tunerStrings,
} from '../src/lib/tuner-display';
import { makeSong, onStrings } from '../test-support/songs';

describe('needleFraction and isInTune', () => {
  it('places -50 … +50 cents across the strip and stops at its ends', () => {
    expect(needleFraction(0)).toBe(0.5);
    expect(needleFraction(-50)).toBe(0);
    expect(needleFraction(25)).toBe(0.75);
    expect(needleFraction(-180)).toBe(0);
    expect(needleFraction(320)).toBe(1);
  });

  it('calls a note in tune within 5 cents', () => {
    expect(IN_TUNE_CENTS).toBe(5);
    expect(isInTune(4.9)).toBe(true);
    expect(isInTune(-5)).toBe(true);
    expect(isInTune(5.1)).toBe(false);
  });
});

describe('texts', () => {
  it('writes cents with their sign and frequencies to a tenth of a hertz', () => {
    expect(centsText(12.4)).toBe('+12 ¢');
    expect(centsText(-7.6)).toBe('−8 ¢');
    expect(centsText(0.3)).toBe('0 ¢');
    expect(frequencyText(110)).toBe('110.0 Hz');
    expect(frequencyText(329.6284)).toBe('329.6 Hz');
  });

  it('splits a note into its name and octave', () => {
    expect(noteParts(45)).toEqual({ name: 'A', octave: 2 });
    expect(noteParts(61)).toEqual({ name: 'C#', octave: 4 });
  });
});

describe('levelFraction', () => {
  it('maps -60 … 0 dBFS onto the meter', () => {
    expect(levelFraction(-120)).toBe(0);
    expect(levelFraction(-30)).toBe(0.5);
    expect(levelFraction(3)).toBe(1);
    expect(levelFraction(DEFAULT_GATE_DB)).toBeCloseTo(5 / 60, 6);
  });
});

describe('tunerStrings', () => {
  it('takes the open track’s strings and names the track', () => {
    // Arrange
    const song = onStrings(makeSong([[]]), STANDARD_BASS_TUNING);
    const track = { ...song.tracks[0]!, name: 'Bass' };

    // Act
    const strings = tunerStrings(track);

    // Assert
    expect(strings.tuning).toEqual(STANDARD_BASS_TUNING);
    expect(strings.caption).toBe('Bass · E A D G');
  });

  it('falls back to standard guitar tuning with no score open or on a drum track', () => {
    const drums = onStrings(makeSong([[]]), STANDARD_TUNING, { isPercussion: true }).tracks[0];
    expect(tunerStrings(undefined)).toEqual({ tuning: STANDARD_TUNING, caption: 'Standard guitar tuning' });
    expect(tunerStrings(drums).tuning).toEqual(STANDARD_TUNING);
  });
});

describe('stringButtons', () => {
  it('lists the strings from the lowest, the nearest one lit with its cents', () => {
    // Arrange: 112 Hz, 31 cents sharp of the A string.
    const reading = toTunerReading(112, STANDARD_TUNING);

    // Act
    const buttons = stringButtons(STANDARD_TUNING, reading);

    // Assert
    expect(buttons.map((button) => button.label)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(buttons.map((button) => button.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(buttons.filter((button) => button.isNearest).map((button) => button.number)).toEqual([5]);
    expect(buttons[1]?.cents).toBeCloseTo(31.2, 1);
  });

  it('lights no string without a reading', () => {
    expect(stringButtons(STANDARD_TUNING, undefined).some((button) => button.isNearest)).toBe(false);
  });

  it('lights a string only within a semitone and a half of it, as TuxGuitar’s fine tuner reaches', () => {
    // Arrange: E1 is an octave under the low E string; C3 is two semitones under D3 and three over A2; 140 ¢ over the
    // A string is a slack A string still to tune up.
    const octaveDown = toTunerReading(41.2, STANDARD_TUNING);
    const between = toTunerReading(130.81, STANDARD_TUNING);
    const nearA = toTunerReading(110 * 2 ** (140 / 1200), STANDARD_TUNING);

    // Act
    const lit = (reading: ReturnType<typeof toTunerReading>) => stringButtons(STANDARD_TUNING, reading).filter((button) => button.isNearest);

    // Assert
    expect(lit(octaveDown)).toEqual([]);
    expect(lit(between)).toEqual([]);
    expect(lit(nearA).map((button) => button.number)).toEqual([5]);
  });
});

describe('tunerStatusText', () => {
  it('says what the tuner is doing, and how to allow the microphone when access is off', () => {
    expect(tunerStatusText({ kind: 'starting' }, false)).toBe('Starting the microphone…');
    expect(tunerStatusText({ kind: 'listening' }, false)).toBe('Play one string at a time.');
    expect(tunerStatusText({ kind: 'listening' }, true)).toBe('Listening.');
    expect(tunerStatusText({ kind: 'denied' }, false)).toBe(
      'Microphone access is off. Allow GP Editor in System Settings ▸ Privacy & Security ▸ Microphone, then open the tuner again.',
    );
    expect(tunerStatusText({ kind: 'failed', message: 'No microphone was found.' }, false)).toBe('No microphone was found.');
  });
});
