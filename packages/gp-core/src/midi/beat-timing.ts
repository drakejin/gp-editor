// Port of TuxGuitar MidiSequenceParser.checkTripletFeel / getStroke and TGStroke.getIncrementTime (LGPL-2.1).
import { durationTicks, plainDuration } from '../model/defaults';
import { type Beat, type Duration, type NoteValue, QUARTER_TIME, type TripletFeel, type Voice } from '../model/song';
import { roundToMidiTicks } from './midi-ticks';
import { voiceAt } from './note-search';

/** Start and length of a voice's beat, in song ticks. */
export interface BeatTiming {
  readonly start: number;
  readonly duration: number;
}

const FEEL_NOTE_VALUE: Readonly<Record<Exclude<TripletFeel, 'none'>, NoteValue>> = { eighth: 8, sixteenth: 16 };
const STROKE_STEPS = 8;
const STROKE_REFERENCE_VALUE = 4;

function isPlain(duration: Duration, value: NoteValue): boolean {
  const { tuplet } = duration;
  const isInTuplet = tuplet.enters !== tuplet.times || duration.innerTuplet !== undefined;
  return duration.value === value && !duration.dotted && !duration.doubleDotted && !isInTuplet;
}

interface VoiceBeat {
  readonly beat: Beat;
  readonly voice: Voice;
}

/**
 * getNextBeat / getPreviousBeat: the nearest beat of the measure after (+1) or before (-1) `beatIndex` that starts
 * later (earlier) and holds the voice; on equal starts the one TuxGuitar meets first.
 */
function nearestBeat(
  beats: readonly Beat[],
  beatIndex: number,
  voiceIndex: number,
  direction: 1 | -1,
): VoiceBeat | undefined {
  const start = beats[beatIndex]?.start ?? 0;
  const side = direction > 0 ? beats.slice(beatIndex + 1) : beats.slice(0, Math.max(0, beatIndex)).reverse();
  let nearest: VoiceBeat | undefined;
  for (const beat of side) {
    const voice = voiceAt(beat, voiceIndex);
    const distance = (beat.start - start) * direction;
    if (
      voice !== undefined &&
      distance > 0 &&
      (nearest === undefined || distance < (nearest.beat.start - start) * direction)
    ) {
      nearest = { beat, voice };
    }
  }
  return nearest;
}

/**
 * checkTripletFeel: with a triplet feel, a pair of plain eighths (or sixteenths) on the beat plays as a long and a
 * short triplet note.
 */
export function tripletFeelTiming(
  beats: readonly Beat[],
  beatIndex: number,
  voiceIndex: number,
  feel: TripletFeel,
): BeatTiming {
  const beat = beats[beatIndex];
  const voice = beat?.voices[voiceIndex];
  if (beat === undefined || voice === undefined) {
    return { start: beat?.start ?? 0, duration: 0 };
  }
  const plain = { start: beat.start, duration: durationTicks(voice.duration) };
  if (feel === 'none' || !isPlain(voice.duration, FEEL_NOTE_VALUE[feel])) {
    return plain;
  }
  const value = FEEL_NOTE_VALUE[feel];
  const pairLength = (QUARTER_TIME * 8) / value;
  const triplet = durationTicks({ ...plainDuration(value), tuplet: { enters: 3, times: 2 } });
  if (beat.start % pairLength === 0) {
    const next = nearestBeat(beats, beatIndex, voiceIndex, 1);
    const isFirstOfPair =
      next === undefined || next.beat.start > beat.start + plain.duration || isPlain(next.voice.duration, value);
    return isFirstOfPair ? { start: beat.start, duration: triplet * 2 } : plain;
  }
  if (beat.start % (pairLength / 2) === 0) {
    const previous = nearestBeat(beats, beatIndex, voiceIndex, -1);
    const isSecondOfPair =
      previous === undefined ||
      previous.beat.start < beat.start - plain.duration ||
      isPlain(previous.voice.duration, value);
    return isSecondOfPair ? { start: beat.start - plain.duration + triplet * 2, duration: triplet } : plain;
  }
  return plain;
}

/** TGStroke.getIncrementTime: delay between two strings of a stroke. */
function strokeIncrement(beat: Beat): number {
  if (beat.stroke.value <= 0) {
    return 0;
  }
  const lengths = beat.voices
    .filter((voice) => !voice.isEmpty)
    .map((voice) => Math.min(durationTicks(voice.duration), QUARTER_TIME));
  if (lengths.length === 0) {
    return 0;
  }
  const shortest = Math.min(...lengths);
  return roundToMidiTicks(shortest * STROKE_REFERENCE_VALUE, STROKE_STEPS * beat.stroke.value);
}

/**
 * getStroke: delay of each string (index 0 = string 1) for the beat's stroke. A down stroke starts on the lowest
 * string. Strings without a struck note keep 0; TuxGuitar keeps stale values there, which no note reads.
 */
export function strokeOffsets(beat: Beat, stringCount: number): readonly number[] {
  const offsets = Array.from({ length: stringCount }, () => 0);
  if (beat.stroke.direction === 'none') {
    return offsets;
  }
  const struck = new Set(
    beat.voices.flatMap((voice) => voice.notes.filter((note) => !note.isTied).map((note) => note.string)),
  );
  const increment = strokeIncrement(beat);
  const order = offsets.map((_, i) => (beat.stroke.direction === 'down' ? stringCount - 1 - i : i));
  let delay = 0;
  for (const index of order) {
    if (struck.has(index + 1)) {
      offsets[index] = delay;
      delay += increment;
    }
  }
  return offsets;
}
