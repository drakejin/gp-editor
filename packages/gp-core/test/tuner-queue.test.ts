import { describe, expect, it } from 'vitest';
import { TUNER_QUEUE_SIZE, pushFrequency, stableFrequency } from '../src/tuner/tuner-queue';

function queueOf(frequencies: readonly (number | undefined)[]): readonly (number | undefined)[] {
  return frequencies.reduce<readonly (number | undefined)[]>((queue, frequency) => pushFrequency(queue, frequency), []);
}

describe('pushFrequency', () => {
  it('keeps the last five frequencies, newest last, without changing the queue it was given', () => {
    // Arrange
    const full = queueOf([100, 101, 102, 103, 104]);

    // Act
    const next = pushFrequency(full, 105);

    // Assert
    expect(TUNER_QUEUE_SIZE).toBe(5);
    expect(full).toEqual([100, 101, 102, 103, 104]);
    expect(next).toEqual([101, 102, 103, 104, 105]);
  });
});

describe('stableFrequency (TGTunerQueue.getFreqApproximation)', () => {
  it('reads nothing from an empty or silent queue', () => {
    expect(stableFrequency([])).toBeUndefined();
    expect(stableFrequency(queueOf([undefined, undefined, undefined]))).toBeUndefined();
  });

  it('outvotes a lone jump to another note', () => {
    // Arrange: four readings around 110 Hz and one stray 147 Hz.
    const queue = queueOf([110.1, 109.9, 147, 110.2, 110]);

    // Act
    const frequency = stableFrequency(queue);

    // Assert: the mean of the readings that agree with the winner.
    expect(frequency).toBeCloseTo(110.05, 6);
  });

  it('counts a reading an octave away as half a vote, and gives a tie to the newest reading', () => {
    // Arrange: 150 twice scores as much as 220 once with 110 and 440 around it; 220 is newer.
    const queue = queueOf([150, 150, 110, 220, 440]);

    // Act
    const frequency = stableFrequency(queue);

    // Assert
    expect(frequency).toBe(220);
    expect(stableFrequency(queueOf([150, 110, 220, 440, 150]))).toBe(150);
  });

  it('holds the last reading for a moment when the sound stops', () => {
    // Arrange
    const queue = queueOf([110, 110.4, undefined, undefined, undefined]);

    // Act
    const frequency = stableFrequency(queue);

    // Assert
    expect(frequency).toBeCloseTo(110.2, 6);
  });
});
