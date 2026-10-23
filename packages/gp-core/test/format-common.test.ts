import { describe, expect, it } from 'vitest';
import { bendPositionFromGp, bendValueFromGp, tremoloBarValueFromGp } from '../src/formats/common/bend-units';
import { createChannelName, gmPercussionName } from '../src/formats/common/channels';
import {
  artificialHarmonicOffset,
  artificialHarmonicOffsetAtFret,
  harmonicFretOffset,
} from '../src/formats/common/harmonics';
import { DEFAULT_VELOCITY, DYNAMICS, dynamicOf, velocityFromGp } from '../src/formats/common/velocity';
import { dynamicVelocity } from '../src/formats/gpif/gpif-duration';
import { durationFromTicks, NOTE_VALUES, plainDuration } from '../src/model/defaults';
import { dynamicFromVelocity } from '../src/write/gp-units';
import type { Channel } from '../src/model/song';

describe('bend units', () => {
  it('converts GP 1/100 tones to quarter tones, rounding half up', () => {
    // Arrange
    const raws = [100, 50, 12.5, -37.5];

    // Act
    const values = raws.map(bendValueFromGp);

    // Assert
    expect(values).toEqual([4, 2, 1, -1]);
  });

  it('never returns negative zero for small negative values', () => {
    // Arrange
    const raw = -12.5;

    // Act
    const bend = bendValueFromGp(raw);
    const tremolo = tremoloBarValueFromGp(raw);
    const position = bendPositionFromGp(-1, 100);

    // Assert
    expect(Object.is(bend, 0)).toBe(true);
    expect(Object.is(tremolo, 0)).toBe(true);
    expect(Object.is(position, 0)).toBe(true);
  });

  it('clamps tremolo bar values to ±24 quarter tones but not bend values', () => {
    // Arrange
    const raw = 1000;

    // Act
    const tremolo = [tremoloBarValueFromGp(raw), tremoloBarValueFromGp(-raw)];
    const bend = bendValueFromGp(raw);

    // Assert
    expect(tremolo).toEqual([24, -24]);
    expect(bend).toBe(40);
  });

  it('scales GP3–5 (0–60) and GPIF (0–100) positions onto 0–12', () => {
    // Arrange
    const gp5 = [0, 30, 60];
    const gpif = [0, 50, 100];

    // Act
    const fromGp5 = gp5.map((raw) => bendPositionFromGp(raw, 60));
    const fromGpif = gpif.map((raw) => bendPositionFromGp(raw, 100));

    // Assert
    expect(fromGp5).toEqual([0, 6, 12]);
    expect(fromGpif).toEqual([0, 6, 12]);
  });
});

describe('harmonics', () => {
  it('reads TuxGuitar harmonic data indexes as semitone and fret offsets', () => {
    // Arrange
    const indexes = [0, 2, 3, 99];

    // Act
    const semitones = indexes.map(artificialHarmonicOffset);
    const frets = indexes.map(harmonicFretOffset);

    // Assert
    expect(semitones).toEqual([12, 24, 19, 0]);
    expect(frets).toEqual([12, 5, 7, 0]);
  });

  it('looks up the semitone offset of the natural harmonic at a fret', () => {
    // Arrange
    const frets = [12, 7, 5, 4, 6];

    // Act
    const offsets = frets.map(artificialHarmonicOffsetAtFret);

    // Assert
    expect(offsets).toEqual([12, 19, 24, 28, 0]);
  });
});

describe('velocity', () => {
  it('maps GP dynamics 1 (ppp) … 8 (fff) to TGVelocities, kept in 0…127', () => {
    // Arrange
    const dynamics = [0, 1, 6, 8, 9];

    // Act
    const velocities = dynamics.map(velocityFromGp);

    // Assert
    expect(velocities).toEqual([0, 15, 95, 127, 127]);
    expect(DEFAULT_VELOCITY).toBe(95);
  });

  it('maps GPIF dynamic names through the same scale, defaulting to forte', () => {
    // Arrange
    const names = ['PPP', 'MP', 'FFF', undefined, 'XYZ'];

    // Act
    const velocities = names.map(dynamicVelocity);

    // Assert
    expect(velocities).toEqual([15, 63, 127, 95, 95]);
  });
});

describe('dynamics', () => {
  it('names the eight Guitar Pro dynamics with their TGVelocities values, ppp first', () => {
    // Act
    const table = DYNAMICS.map((dynamic) => [dynamic.name, dynamic.velocity]);

    // Assert
    expect(table).toEqual([
      ['ppp', 15],
      ['pp', 31],
      ['p', 47],
      ['mp', 63],
      ['mf', 79],
      ['f', 95],
      ['ff', 111],
      ['fff', 127],
    ]);
  });

  it('names the dynamic nearest to a velocity, the louder one half way between two', () => {
    // Arrange
    const velocities = [15, 95, 127, 70, 72, 23, 0, 200, -5];

    // Act
    const names = velocities.map(dynamicOf);

    // Assert
    expect(names).toEqual(['ppp', 'f', 'fff', 'mp', 'mf', 'pp', 'ppp', 'fff', 'ppp']);
  });

  it('agrees with the dynamic GP5 saves for every velocity', () => {
    // Arrange
    const velocities = Array.from({ length: 128 }, (_, velocity) => velocity).filter((velocity) => velocity >= 15);

    // Act
    const mismatched = velocities.filter((velocity) => DYNAMICS[dynamicFromVelocity(velocity) - 1]?.name !== dynamicOf(velocity));

    // Assert
    expect(mismatched).toEqual([]);
  });

  it('calls a velocity that is not a number forte', () => {
    expect(dynamicOf(Number.NaN)).toBe('f');
  });
});

describe('channel names', () => {
  const channel = (name: string): Channel => ({
    id: 1,
    name,
    program: 0,
    bank: 0,
    volume: 0,
    balance: 0,
    chorus: 0,
    reverb: 0,
    phaser: 0,
    tremolo: 0,
    isPercussion: false,
  });

  it('names a channel after its GM program with the first unused number', () => {
    // Arrange
    const existing = [channel('Steel String Acoustic Guitar 1')];

    // Act
    const name = createChannelName(existing, 25, false);

    // Assert
    expect(name).toBe('Steel String Acoustic Guitar 2');
  });

  it('names percussion and unknown programs with fixed prefixes', () => {
    // Arrange
    const existing: readonly Channel[] = [];

    // Act
    const names = [createChannelName(existing, 25, true), createChannelName(existing, 200, false)];

    // Assert
    expect(names).toEqual(['DrumKit 1', 'Untitled 1']);
  });
});

describe('GM percussion names', () => {
  it('names the General MIDI drum keys 35–81', () => {
    expect([35, 36, 38, 42, 44, 46, 49, 51, 56, 81].map(gmPercussionName)).toEqual([
      'Acoustic Bass Drum',
      'Bass Drum 1',
      'Acoustic Snare',
      'Closed Hi-Hat',
      'Pedal Hi-Hat',
      'Open Hi-Hat',
      'Crash Cymbal 1',
      'Ride Cymbal 1',
      'Cowbell',
      'Open Triangle',
    ]);
  });

  it('names no key outside the GM drum map', () => {
    expect([34, 82, -1, 36.5].map(gmPercussionName)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('durationFromTicks', () => {
  it('returns the longest plain note value that fits', () => {
    // Arrange
    const ticks = [3840 * 2, 960, 959, 60];

    // Act
    const values = ticks.map((t) => durationFromTicks(t));

    // Assert
    expect(values).toEqual([plainDuration(1), plainDuration(4), plainDuration(8), plainDuration(64)]);
  });

  it('returns a 64th in a 7:4 tuplet when nothing fits', () => {
    // Arrange
    const ticks = 1;

    // Act
    const duration = durationFromTicks(ticks);

    // Assert
    expect(duration).toEqual({ value: 64, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } });
  });

  it('lists note values from whole to 64th', () => {
    // Arrange / Act
    const values = [...NOTE_VALUES];

    // Assert
    expect(values).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });
});
