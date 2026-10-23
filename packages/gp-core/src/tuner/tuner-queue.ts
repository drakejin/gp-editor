// Port of TuxGuitar's TGTunerQueue: the last few frequencies vote, so a lone jump (a pick noise, a harmonic) does not
// move the needle. Each reading scores 2 for every reading within ±5 % of it (itself included) and 1 for every reading
// at half or double it; the best score wins, the newest on a tie. Unlike TuxGuitar, the queue is an immutable list in
// time order, and the winner's value is the mean of the readings within ±5 % of it, which steadies the needle.

/** QUEUE_SIZE in TGTunerQueue: about half a second of frames. */
export const TUNER_QUEUE_SIZE = 5;

const UPPER_TOLERANCE = 1.05;
const LOWER_TOLERANCE = 0.95;

/** A frame's frequency, or undefined when the frame held no tone. */
export type QueuedFrequency = number | undefined;

/** The queue with `frequency` added as the newest entry, the oldest dropped past TUNER_QUEUE_SIZE. */
export function pushFrequency(queue: readonly QueuedFrequency[], frequency: QueuedFrequency): readonly QueuedFrequency[] {
  return [...queue, frequency].slice(-TUNER_QUEUE_SIZE);
}

function isNear(frequency: number, other: number): boolean {
  return frequency > other * LOWER_TOLERANCE && frequency < other * UPPER_TOLERANCE;
}

function score(frequency: number, readings: readonly number[]): number {
  return readings.reduce((sum, other) => sum + (isNear(frequency, other) ? 2 : 0) + (isNear(frequency / 2, other) ? 1 : 0) + (isNear(frequency * 2, other) ? 1 : 0), 0);
}

/** The frequency the queue agrees on; undefined when it holds no reading. */
export function stableFrequency(queue: readonly QueuedFrequency[]): number | undefined {
  const readings = queue.filter((frequency): frequency is number => frequency !== undefined);
  const best = readings.reduce<{ frequency: number; score: number } | undefined>((winner, frequency) => {
    const candidate = { frequency, score: score(frequency, readings) };
    return winner === undefined || candidate.score >= winner.score ? candidate : winner;
  }, undefined);
  if (best === undefined) {
    return undefined;
  }
  const agreeing = readings.filter((frequency) => isNear(frequency, best.frequency));
  return agreeing.reduce((sum, frequency) => sum + frequency, 0) / agreeing.length;
}
