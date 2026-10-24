import { type DurationTuplets, EMPTY_VOICE, MAX_VOICES, NO_STROKE, NO_TUPLETS, durationTicks, hasSameTuplets } from '../model/defaults';
import type { Beat, Chord, Duration, Hairpin, Measure, Ottava, RasgueadoPattern, Stroke, StrokeDirection, Voice } from '../model/song';
import { restDurations } from './rests';

/** The beat-level attributes an event keeps when it is the event that owns its beat. */
export interface BeatAttributes {
  readonly stroke: Stroke;
  readonly pickStroke: StrokeDirection;
  readonly chord?: Chord;
  readonly text?: string;
  readonly hairpin?: Hairpin;
  readonly rasgueado?: RasgueadoPattern;
  /** Kept with the beat, but no mark of its own: a rest under an octave sign is still free time. */
  readonly ottava?: Ottava;
}

/** One event of a voice — notes or a rest — laid out after the previous event of the same voice. */
export interface VoiceEvent {
  readonly voice: Voice;
  /** Index of the beat the event was read from; undefined for rests an edit adds. */
  readonly beatIndex?: number;
  readonly attributes?: BeatAttributes;
}

export type VoiceEvents = readonly VoiceEvent[];

/** A measure seen voice by voice (TuxGuitar's per-voice view of a TGMeasure). */
export interface MeasureVoices {
  /** Voice slots every rebuilt beat gets. */
  readonly voiceCount: number;
  readonly voices: readonly VoiceEvents[];
}

export function eventTicks(event: VoiceEvent): number {
  return durationTicks(event.voice.duration);
}

export function eventsTicks(events: VoiceEvents): number {
  return events.reduce((total, event) => total + eventTicks(event), 0);
}

/** True when the attributes mark the beat with something (text, chord, stroke, pick stroke). */
function hasBeatMarks(attributes: BeatAttributes | undefined): boolean {
  return (
    attributes !== undefined &&
    (attributes.text !== undefined ||
      attributes.chord !== undefined ||
      attributes.stroke.direction !== 'none' ||
      attributes.pickStroke !== 'none' ||
      attributes.hairpin !== undefined ||
      attributes.rasgueado !== undefined)
  );
}

/** A rest that marks its beat with nothing: free time an edit may take or give back (TuxGuitar skips text beats too). */
export function isFreeRest(event: VoiceEvent): boolean {
  return event.voice.notes.length === 0 && !hasBeatMarks(event.attributes);
}

export function restEvent(duration: Duration): VoiceEvent {
  return { voice: { duration, notes: [], isEmpty: false, direction: 'none' } };
}

/**
 * Rests an edit adds after `before` (or in its place), under its octave sign when it has one: the sign's line runs on
 * over them instead of breaking at the rest.
 */
export function signedRests(rests: VoiceEvents, before: VoiceEvent | undefined): VoiceEvents {
  const ottava = before?.attributes?.ottava;
  return ottava === undefined ? rests : rests.map((rest) => ({ ...rest, attributes: { stroke: NO_STROKE, pickStroke: 'none', ottava } }));
}

/** Rest events filling exactly `ticks` (see restDurations); undefined when that is impossible. */
export function restEvents(ticks: number, preferred?: Duration, tuplets?: DurationTuplets): VoiceEvents | undefined {
  return restDurations(ticks, preferred, tuplets)?.map(restEvent);
}

/** Of the voices playing in a beat, the one whose event carries the beat attributes: preferably one that stays put. */
function attributeOwner(beat: Beat, movingVoiceIndex: number | undefined): number | undefined {
  const played = beat.voices.flatMap((voice, index) => (voice.isEmpty ? [] : [index]));
  return played.find((index) => index !== movingVoiceIndex) ?? played[0];
}

function attributesOf(beat: Beat): BeatAttributes {
  return {
    stroke: beat.stroke,
    pickStroke: beat.pickStroke,
    ...(beat.chord === undefined ? {} : { chord: beat.chord }),
    ...(beat.text === undefined ? {} : { text: beat.text }),
    ...(beat.hairpin === undefined ? {} : { hairpin: beat.hairpin }),
    ...(beat.rasgueado === undefined ? {} : { rasgueado: beat.rasgueado }),
    ...(beat.ottava === undefined ? {} : { ottava: beat.ottava }),
  };
}

/** The tuplets (and tuplets inside them) of `durations`, each once, after no tuplet. */
export function distinctTuplets(durations: readonly DurationTuplets[]): readonly DurationTuplets[] {
  const tuplets: DurationTuplets[] = [NO_TUPLETS];
  for (const duration of durations) {
    if (!tuplets.some((known) => hasSameTuplets(known, duration))) {
      tuplets.push(duration);
    }
  }
  return tuplets;
}

/** The tuplets a measure's events use: time another voice leaves unused is made of these. */
function measureTuplets(measure: Measure): readonly DurationTuplets[] {
  return distinctTuplets(measure.beats.flatMap((beat) => beat.voices.filter((voice) => !voice.isEmpty).map((voice) => voice.duration)));
}

/** Rests for `ticks` of unused time, plain or in one of `tuplets`; undefined when none can write it. */
export function gapRests(ticks: number, tuplets: readonly DurationTuplets[]): VoiceEvents | undefined {
  if (ticks <= 0) {
    return [];
  }
  for (const tuplet of tuplets) {
    const rests = restEvents(ticks, undefined, tuplet);
    if (rests !== undefined) {
      return rests;
    }
  }
  return undefined;
}

/** Rests for `ticks` of time a voice of `measure` leaves unused, plain or in a tuplet the measure uses; undefined when none can write it. */
export function measureGapRests(measure: Measure, ticks: number): VoiceEvents | undefined {
  return gapRests(ticks, measureTuplets(measure));
}

/** Event lists under construction, with each voice's end so far. */
interface Split {
  readonly voices: VoiceEvent[][];
  readonly ends: number[];
  readonly tuplets: readonly DurationTuplets[];
}

/** Appends an event read at `beatStart` to its voice, after rests for time the voice left unused; false when they cannot be written. */
function appendEvent(split: Split, voiceIndex: number, beatStart: number, event: VoiceEvent): boolean {
  const events = split.voices[voiceIndex];
  const end = split.ends[voiceIndex];
  const gap = end === undefined ? undefined : gapRests(beatStart - end, split.tuplets);
  if (events === undefined || end === undefined || gap === undefined) {
    return false;
  }
  events.push(...gap, event);
  split.ends[voiceIndex] = end + eventsTicks(gap) + eventTicks(event);
  return true;
}

/**
 * Splits a measure laid out from `start` into its voices' event lists. Time a voice leaves unused before an event is
 * filled with rests, so the event keeps its place (autoCompleteSilences, e.g. a pickup at the end of an anacrusis);
 * undefined when such a gap cannot be written as rests. The beat attributes (stroke, pick stroke, chord, text) go
 * with one event per beat: a voice other than `movingVoiceIndex` when one plays there (the beat stays), else the
 * moving one.
 */
export function toMeasureVoices(measure: Measure, start: number, movingVoiceIndex?: number): MeasureVoices | undefined {
  // A voice the beats have no slot for yet (voice 3 or 4 of a bar read from a GP3–GP5 file) gets one.
  const movingSlots = movingVoiceIndex === undefined || movingVoiceIndex >= MAX_VOICES ? 0 : movingVoiceIndex + 1;
  const voiceCount = Math.max(1, movingSlots, ...measure.beats.map((beat) => beat.voices.length));
  const split: Split = {
    voices: Array.from({ length: voiceCount }, () => []),
    ends: Array.from({ length: voiceCount }, () => start),
    tuplets: measureTuplets(measure),
  };
  for (const [beatIndex, beat] of measure.beats.entries()) {
    const owner = attributeOwner(beat, movingVoiceIndex);
    for (const [voiceIndex, voice] of beat.voices.entries()) {
      const event: VoiceEvent = voiceIndex === owner ? { voice, beatIndex, attributes: attributesOf(beat) } : { voice, beatIndex };
      if (!voice.isEmpty && !appendEvent(split, voiceIndex, beat.start, event)) {
        return undefined;
      }
    }
  }
  return { voiceCount, voices: split.voices };
}

/** Index of the event read from beat `beatIndex`; undefined when that beat has no event in the voice. */
export function eventIndexOfBeat(events: VoiceEvents, beatIndex: number): number | undefined {
  const index = events.findIndex((event) => event.beatIndex === beatIndex);
  return index < 0 ? undefined : index;
}

/** Attributes of the events meeting in one beat, field by field from the lowest voice that has the field. */
function mergeAttributes(events: readonly (VoiceEvent | undefined)[]): BeatAttributes {
  const all = events.flatMap((event) => (event?.attributes === undefined ? [] : [event.attributes]));
  const stroke = all.find((attributes) => attributes.stroke.direction !== 'none')?.stroke ?? all[0]?.stroke ?? NO_STROKE;
  const pickStroke = all.find((attributes) => attributes.pickStroke !== 'none')?.pickStroke ?? 'none';
  const chord = all.find((attributes) => attributes.chord !== undefined)?.chord;
  const text = all.find((attributes) => attributes.text !== undefined)?.text;
  const hairpin = all.find((attributes) => attributes.hairpin !== undefined)?.hairpin;
  const rasgueado = all.find((attributes) => attributes.rasgueado !== undefined)?.rasgueado;
  const ottava = all.find((attributes) => attributes.ottava !== undefined)?.ottava;
  return {
    stroke,
    pickStroke,
    ...(chord === undefined ? {} : { chord }),
    ...(text === undefined ? {} : { text }),
    ...(hairpin === undefined ? {} : { hairpin }),
    ...(rasgueado === undefined ? {} : { rasgueado }),
    ...(ottava === undefined ? {} : { ottava }),
  };
}

function isSameBeat(beat: Beat, voices: readonly Voice[], attributes: BeatAttributes): boolean {
  return (
    beat.voices.length === voices.length &&
    beat.voices.every((voice, i) => voice === voices[i]) &&
    beat.stroke.direction === attributes.stroke.direction &&
    beat.stroke.value === attributes.stroke.value &&
    beat.pickStroke === attributes.pickStroke &&
    beat.chord === attributes.chord &&
    beat.text === attributes.text &&
    beat.hairpin === attributes.hairpin &&
    beat.rasgueado === attributes.rasgueado &&
    beat.ottava === attributes.ottava
  );
}

function buildBeat(start: number, events: readonly (VoiceEvent | undefined)[], previous: Beat | undefined): Beat {
  const voices = events.map((event, index) => {
    const before = previous?.voices[index];
    return event?.voice ?? (before?.isEmpty === true ? before : EMPTY_VOICE);
  });
  const attributes = mergeAttributes(events);
  if (previous !== undefined && isSameBeat(previous, voices, attributes)) {
    return previous;
  }
  return { start, voices, ...attributes };
}

/**
 * Beats of a measure starting at `start`: every voice's events laid end to end, merged by start (GTPVoiceJoiner-style).
 * A beat equal to one of `previous` (same start, voices and attributes) is reused.
 */
export function toBeats(start: number, measureVoices: MeasureVoices, previous: readonly Beat[]): readonly Beat[] {
  const slots = new Map<number, (VoiceEvent | undefined)[]>();
  measureVoices.voices.forEach((events, voiceIndex) => {
    let position = start;
    for (const event of events) {
      const atPosition = slots.get(position) ?? Array.from({ length: measureVoices.voiceCount }, () => undefined);
      atPosition[voiceIndex] = event;
      slots.set(position, atPosition);
      position += eventTicks(event);
    }
  });
  const previousByStart = new Map(previous.map((beat) => [beat.start, beat]));
  return [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([beatStart, events]) => buildBeat(beatStart, events, previousByStart.get(beatStart)));
}

/** True when two event lists hold the same events (free rests compare by duration). */
export function hasSameEvents(a: VoiceEvents, b: VoiceEvents): boolean {
  return a.length === b.length && a.every((event, i) => {
    const other = b[i];
    return other !== undefined && (event === other || (isFreeRest(event) && isFreeRest(other) && isSameRest(event.voice, other.voice)));
  });
}

function isSameRest(a: Voice, b: Voice): boolean {
  return a.direction === b.direction && isSameDuration(a.duration, b.duration);
}

export function isSameDuration(a: Duration, b: Duration): boolean {
  return a.value === b.value && a.dotted === b.dotted && a.doubleDotted === b.doubleDotted && hasSameTuplets(a, b);
}
