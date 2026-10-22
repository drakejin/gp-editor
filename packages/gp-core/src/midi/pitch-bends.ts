// Port of TuxGuitar MidiSequenceParser.addBend / addTremoloBar / addVibrato / addSlide (LGPL-2.1): pitch-wheel curves.
import type { BendPoint } from '../model/song';
import { DEFAULT_BEND, type NoteOutput, type PitchBendEvent, pitchBendEvent } from './midi-events';

/**
 * DEFAULT_BEND_SEMI_TONE: pitch-wheel steps (of 64 per 12 semitones, see the RPN in the conductor track) per quarter
 * tone. TuxGuitar keeps tremolo-bar values in semitones and doubles it; the model keeps both in quarter tones.
 */
const STEPS_PER_QUARTER_TONE = 2.75;
const STEPS_PER_SEMITONE = STEPS_PER_QUARTER_TONE * 2;
/** TGEffectBend.MAX_POSITION_LENGTH: positions run 0 … 12 over the note. */
const BEND_POSITIONS = 12;
const VIBRATO_PERIOD = 160;
const VIBRATO_DEPTH = Math.trunc(STEPS_PER_QUARTER_TONE / 2);
/** A slide moves the wheel every 32nd note (QUARTER_TIME / 8). */
const SLIDE_STEP = 120;

function wheelValue(quarterTones: number): number {
  return DEFAULT_BEND + Math.trunc(quarterTones * STEPS_PER_QUARTER_TONE);
}

function pointTick(start: number, duration: number, point: BendPoint): number {
  return start + Math.trunc((duration * point.position) / BEND_POSITIONS);
}

/** The steps between two points of a curve: one event per wheel step, evenly spaced (whole ticks). */
function rampEvents(output: NoteOutput, fromTick: number, from: number, toTick: number, to: number): PitchBendEvent[] {
  if (to === from) {
    return [];
  }
  const steps = Math.abs(to - from);
  const width = Math.trunc((toTick - fromTick) / steps);
  const direction = to > from ? 1 : -1;
  return Array.from({ length: steps }, (_, i) =>
    pitchBendEvent(output, fromTick + width * (i + 1), from + direction * (i + 1)),
  );
}

/**
 * addBend / addTremoloBar: the curve's points, stepped in between, then back to the centre at the note's end.
 * Bend and tremolo-bar values are both quarter tones in the model, so one function serves both.
 */
export function curveEvents(
  output: NoteOutput,
  start: number,
  duration: number,
  points: readonly BendPoint[],
): PitchBendEvent[] {
  const events = points.flatMap((point, i) => {
    const tick = pointTick(start, duration, point);
    const value = Math.min(127, Math.max(0, wheelValue(point.value)));
    const next = points[i + 1];
    const ramp =
      next === undefined
        ? []
        : rampEvents(output, tick, value, pointTick(start, duration, next), wheelValue(next.value));
    return [pitchBendEvent(output, tick, value), ...ramp];
  });
  return [...events, pitchBendEvent(output, start + duration, DEFAULT_BEND)];
}

/** addVibrato: the wheel alternates between centre and one step up every 160 ticks. */
export function vibratoEvents(output: NoteOutput, start: number, duration: number): PitchBendEvent[] {
  const end = start + duration;
  const events: PitchBendEvent[] = [];
  let tick = start;
  while (tick < end) {
    tick = Math.min(tick + VIBRATO_PERIOD, end);
    events.push(pitchBendEvent(output, tick, DEFAULT_BEND));
    tick = Math.min(tick + VIBRATO_PERIOD, end);
    events.push(pitchBendEvent(output, tick, DEFAULT_BEND + VIBRATO_DEPTH));
  }
  return [...events, pitchBendEvent(output, tick, DEFAULT_BEND)];
}

/**
 * addSlide: glide the wheel from `fromFret` at `fromTick` to `toFret` at `toTick`, then recentre. The maths runs in
 * Java float precision like TuxGuitar's.
 */
export function slideEvents(
  output: NoteOutput,
  fromTick: number,
  fromFret: number,
  toTick: number,
  toFret: number,
): PitchBendEvent[] {
  const distance = toFret - fromFret;
  const length = toTick - fromTick;
  const points = Math.trunc(length / SLIDE_STEP);
  const step = points > 0 ? Math.trunc(length / points) : 0;
  const glide = Array.from({ length: Math.max(0, points) }, (_, i) => {
    const tone = Math.fround(Math.fround(Math.fround(step * (i + 1)) * distance) / length);
    const value = DEFAULT_BEND + Math.trunc(Math.fround(tone * STEPS_PER_SEMITONE));
    return pitchBendEvent(output, fromTick + step * (i + 1), value);
  });
  return [...glide, pitchBendEvent(output, toTick, DEFAULT_BEND)];
}
