// Port of TuxGuitar MidiSequenceParser.addNotes (LGPL-2.1): the MIDI events of one struck note and its effects.
import { artificialHarmonicOffset, artificialHarmonicOffsetAtFret } from '../formats/common/harmonics';
import { durationTicks } from '../model/defaults';
import { type Grace, type Harmonic, type Note, QUARTER_TIME } from '../model/song';
import type { BeatTiming } from './beat-timing';
import { CONTROLLER, controlChangeEvent, type NoteOutput, noteEvents, type SequenceEvent } from './midi-events';
import { MIDI_TICK, fromMidiTicks, truncToMidiTicks } from './midi-ticks';
import { DEAD_NOTE_DURATION, realNoteDuration, staticDuration } from './note-duration';
import { findNextNote, type PlacedNote, type TrackContext } from './note-search';
import { VELOCITY_INCREMENT } from '../formats/common/velocity';
import { realVelocity, softer } from './note-velocity';
import { curveEvents, slideEvents, vibratoEvents } from './pitch-bends';

const FADE_IN_START = 31;
const FADE_IN_END = 127;
/** A repeated note (trill, tremolo picking) stops this close to the end of the note. */
const REPEAT_MARGIN = fromMidiTicks(10);
const OCTAVE = 12;

/** A note's sounding window and MIDI output while its effects are applied. */
interface Sound {
  readonly key: number;
  readonly start: number;
  readonly duration: number;
  readonly velocity: number;
  readonly output: NoteOutput;
}

function isPercussion(context: TrackContext): boolean {
  return context.channel.isPercussion;
}

/** MIDI key of `fret` on `string`: tuning + capo + fret; percussion tracks play the fret as the drum key. */
function pitchOf(context: TrackContext, string: number, fret: number): number | undefined {
  if (context.track.isPercussion || isPercussion(context)) {
    return fret;
  }
  const tuning = context.track.strings[string - 1]?.tuning;
  return tuning === undefined ? undefined : context.track.offset + fret + tuning;
}

/** addFadeIn: the expression controller climbs from 31 to 127 over the note. */
function fadeInEvents(sound: Sound): SequenceEvent[] {
  const { channelId } = sound.output;
  const step = truncToMidiTicks(sound.duration, FADE_IN_END - FADE_IN_START);
  const end = sound.start + sound.duration;
  const ramp: SequenceEvent[] = [];
  for (let tick = sound.start, value = FADE_IN_START; tick < end && value < FADE_IN_END; tick += step, value++) {
    ramp.push(controlChangeEvent(channelId, tick, CONTROLLER.EXPRESSION, value));
  }
  return [...ramp, controlChangeEvent(channelId, end, CONTROLLER.EXPRESSION, FADE_IN_END)];
}

/** TGEffectGrace.getDurationTime: 3 = 16th, 2 = 32nd, anything else a 64th. */
function graceTicks(duration: Grace['duration']): number {
  if (duration === 3) {
    return QUARTER_TIME / 4;
  }
  return duration === 2 ? QUARTER_TIME / 8 : QUARTER_TIME / 16;
}

/** The grace note before (or, on the beat, at the start of) the main note, which then starts later. */
function applyGrace(
  context: TrackContext,
  placed: PlacedNote,
  sound: Sound,
  grace: Grace,
): { sound: Sound; events: SequenceEvent[] } {
  const output: NoteOutput = { ...sound.output, bendMode: !isPercussion(context) };
  const length = graceTicks(grace.duration);
  const graceDuration = grace.isDead ? staticDuration(placed.tempo, DEAD_NOTE_DURATION, length) : length;
  const isOnBeat = grace.onBeat || sound.start - length < context.origin;
  const main = isOnBeat ? { ...sound, start: sound.start + length, duration: sound.duration - length } : sound;
  const key = pitchOf(context, placed.note.string, grace.fret);
  const events = key === undefined ? [] : noteEvents(output, key, main.start - length, graceDuration, grace.velocity);
  return { sound: { ...main, output }, events };
}

/** Trill and tremolo picking: the note (or the note and the trill key, alternately) repeated over its length. */
function repeatedEvents(sound: Sound, length: number, keys: readonly number[]): SequenceEvent[] {
  const end = sound.start + sound.duration;
  const step = Math.max(MIDI_TICK, length);
  const events: SequenceEvent[] = [];
  for (let tick = sound.start, i = 0; tick + REPEAT_MARGIN < end; i++) {
    const noteLength = tick + step >= end ? end - tick - MIDI_TICK : step;
    events.push(...noteEvents(sound.output, keys[i % keys.length] ?? sound.key, tick, noteLength, sound.velocity));
    tick += noteLength;
  }
  return events;
}

/**
 * The first pitch effect of bend, tremolo bar, slide, vibrato (slight or wide: TuxGuitar plays them alike); any of
 * them moves the note to the bend channel.
 */
function pitchEffect(
  context: TrackContext,
  placed: PlacedNote,
  sound: Sound,
): { sound: Sound; events: SequenceEvent[] } {
  const { effect } = placed.note;
  const bent = { ...sound, output: { ...sound.output, bendMode: true } };
  if (effect.bend !== undefined) {
    return { sound: bent, events: curveEvents(bent.output, sound.start, sound.duration, effect.bend.points) };
  }
  if (effect.tremoloBar !== undefined) {
    return { sound: bent, events: curveEvents(bent.output, sound.start, sound.duration, effect.tremoloBar.points) };
  }
  if (effect.slides.length > 0) {
    const next = findNextNote(context, placed);
    const fromTick = placed.beat.start + placed.move;
    const events =
      next === undefined
        ? []
        : slideEvents(bent.output, fromTick, placed.note.fret, next.beat.start + next.move, next.note.fret);
    return { sound: bent, events };
  }
  if (effect.vibrato || effect.wideVibrato) {
    return { sound: bent, events: vibratoEvents(bent.output, sound.start, sound.duration) };
  }
  return { sound, events: [] };
}

/** Semitones a non-natural harmonic sounds above the fretted note (TuxGuitar's data index 0 = 12 when unknown). */
function harmonicOffset(harmonic: Harmonic, fret: number): number {
  const fallback = artificialHarmonicOffset(0);
  switch (harmonic.type) {
    case 'artificial':
      return harmonic.data > 0 ? harmonic.data : fallback;
    case 'tapped':
      return artificialHarmonicOffsetAtFret(harmonic.data - fret) || fallback;
    default:
      return fallback;
  }
}

/** The key a harmonic sounds at; a natural harmonic depends on the fret it is played at (12, 9, 5, 7, 4 or 3). */
function harmonicKey(note: Note, harmonic: Harmonic, base: number): number {
  if (harmonic.type !== 'natural') {
    return base + harmonicOffset(harmonic, note.fret);
  }
  const fretInOctave = note.fret % OCTAVE === 0 ? OCTAVE : note.fret % OCTAVE;
  const offset = artificialHarmonicOffsetAtFret(fretInOctave);
  return offset === 0 ? base : base + offset - note.fret;
}

/** Harmonic: the key moves to the harmonic, with a soft note an octave below (and the fretted note for semi). */
function applyHarmonic(note: Note, harmonic: Harmonic, sound: Sound): { sound: Sound; events: SequenceEvent[] } {
  const { output, start, duration, velocity, key: base } = sound;
  const key = harmonicKey(note, harmonic, base);
  const semi =
    harmonic.type === 'semi' ? noteEvents(output, base, start, duration, softer(velocity, VELOCITY_INCREMENT * 3)) : [];
  const below =
    key - OCTAVE > 0 ? noteEvents(output, key - OCTAVE, start, duration, softer(velocity, VELOCITY_INCREMENT * 4)) : [];
  return { sound: { ...sound, key }, events: [...semi, ...below] };
}

/** Everything one struck (not tied) note plays: the effects, then the note itself. */
export function buildNoteEvents(
  context: TrackContext,
  placed: PlacedNote,
  timing: BeatTiming,
  strokeDelay: number,
): SequenceEvent[] {
  const key = pitchOf(context, placed.note.string, placed.note.fret);
  if (key === undefined) {
    return [];
  }
  const realDuration = realNoteDuration(context, placed, timing.duration);
  const initial: Sound = {
    key,
    start: timing.start + placed.move + strokeDelay,
    duration: realDuration > strokeDelay ? realDuration - strokeDelay : realDuration,
    velocity: realVelocity(context, placed),
    output: { channelId: context.channel.id, bendMode: false },
  };
  return [...(placed.note.effect.fadeIn ? fadeInEvents(initial) : []), ...effectEvents(context, placed, initial)];
}

function effectEvents(context: TrackContext, placed: PlacedNote, initial: Sound): SequenceEvent[] {
  const { effect } = placed.note;
  const graced =
    effect.grace === undefined ? { sound: initial, events: [] } : applyGrace(context, placed, initial, effect.grace);
  const sound = graced.sound;
  if (effect.trill !== undefined && !isPercussion(context)) {
    const trillKey = pitchOf(context, placed.note.string, effect.trill.fret) ?? sound.key;
    return [...graced.events, ...repeatedEvents(sound, durationTicks(effect.trill.duration), [sound.key, trillKey])];
  }
  if (effect.tremoloPicking !== undefined) {
    return [...graced.events, ...repeatedEvents(sound, durationTicks(effect.tremoloPicking.duration), [sound.key])];
  }
  const pitched = isPercussion(context) ? { sound, events: [] } : pitchEffect(context, placed, sound);
  const harmonic =
    effect.harmonic === undefined || isPercussion(context)
      ? { sound: pitched.sound, events: [] }
      : applyHarmonic(placed.note, effect.harmonic, pitched.sound);
  const final = harmonic.sound;
  return [
    ...graced.events,
    ...pitched.events,
    ...harmonic.events,
    ...noteEvents(final.output, final.key, final.start, final.duration, final.velocity),
  ];
}
