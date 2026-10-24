// Port of TuxGuitar MidiSequenceParser.addNotes (LGPL-2.1): the MIDI events of one struck note and its effects.
import { artificialHarmonicOffset, artificialHarmonicOffsetAtFret } from '../formats/common/harmonics';
import { durationTicks } from '../model/defaults';
import { type Grace, type Harmonic, type Note, type NoteEffect, QUARTER_TIME } from '../model/song';
import type { BeatTiming } from './beat-timing';
import { fadeEvents } from './fades';
import { type NoteOutput, noteEvents, type SequenceEvent } from './midi-events';
import { MIDI_TICK, fromMidiTicks, truncToMidiTicks } from './midi-ticks';
import { DEAD_NOTE_DURATION, realNoteDuration, staticDuration } from './note-duration';
import { findNextNote, type PlacedNote, type TrackContext } from './note-search';
import { rasgueadoStrikes } from './rasgueado';
import { MAX_VELOCITY, VELOCITY_INCREMENT } from '../formats/common/velocity';
import { realVelocity, softer } from './note-velocity';
import { curveEvents, slideEvents, vibratoEvents } from './pitch-bends';

/** A repeated note (trill, tremolo picking) stops this close to the end of the note. */
const REPEAT_MARGIN = fromMidiTicks(10);
const OCTAVE = 12;
/** Shared by the notes without an effect's events (most of them); never added to. */
const NO_EVENTS: readonly SequenceEvent[] = [];

/** A note's sounding window and MIDI output while its effects are applied. */
interface Sound {
  readonly key: number;
  readonly start: number;
  readonly duration: number;
  readonly velocity: number;
  readonly output: NoteOutput;
}

/** A sound after one effect shaped it, and the events that effect adds. */
interface Shaped {
  readonly sound: Sound;
  readonly events: readonly SequenceEvent[];
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
): Shaped {
  const output: NoteOutput = { ...sound.output, bendMode: !isPercussion(context) };
  const length = graceTicks(grace.duration);
  const graceDuration = grace.isDead ? staticDuration(placed.tempo, DEAD_NOTE_DURATION, length) : length;
  const isOnBeat = grace.onBeat || sound.start - length < context.origin;
  const main = isOnBeat ? { ...sound, start: sound.start + length, duration: sound.duration - length } : sound;
  const key = pitchOf(context, placed.note.string, grace.fret);
  const events = key === undefined ? NO_EVENTS : noteEvents(output, key, main.start - length, graceDuration, grace.velocity);
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

function hasPitchEffect(effect: NoteEffect): boolean {
  return effect.bend !== undefined || effect.tremoloBar !== undefined || effect.slides.length > 0 || effect.vibrato || effect.wideVibrato;
}

/**
 * The first pitch effect of bend, tremolo bar, slide, vibrato (slight or wide: TuxGuitar plays them alike); any of
 * them moves the note to the bend channel.
 */
function pitchEffect(
  context: TrackContext,
  placed: PlacedNote,
  sound: Sound,
): Shaped {
  const { effect } = placed.note;
  if (!hasPitchEffect(effect)) {
    return { sound, events: NO_EVENTS };
  }
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
  return { sound: bent, events: vibratoEvents(bent.output, sound.start, sound.duration) };
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
function applyHarmonic(note: Note, harmonic: Harmonic, sound: Sound): Shaped {
  const { output, start, duration, velocity, key: base } = sound;
  const key = harmonicKey(note, harmonic, base);
  const semi =
    harmonic.type === 'semi' ? noteEvents(output, base, start, duration, softer(velocity, VELOCITY_INCREMENT * 3)) : [];
  const below =
    key - OCTAVE > 0 ? noteEvents(output, key - OCTAVE, start, duration, softer(velocity, VELOCITY_INCREMENT * 4)) : [];
  return { sound: { ...sound, key }, events: [...semi, ...below] };
}

/**
 * The note's audio settings (not in TuxGuitar): its sounding length scaled by its duration percent, its start delayed
 * by its offset (a share of the beat; the end stays), its velocity changed and kept within 1–127.
 */
function applyNoteAudio(placed: PlacedNote, sound: Sound): Sound {
  const { audio } = placed.note;
  if (audio === undefined) {
    return sound;
  }
  const offset = truncToMidiTicks(durationTicks(placed.voice.duration) * audio.offsetPercent, 100);
  const duration = Math.max(MIDI_TICK, truncToMidiTicks(sound.duration * audio.durationPercent, 100));
  return {
    ...sound,
    start: sound.start + offset,
    duration: duration > offset ? duration - offset : duration,
    velocity: Math.min(MAX_VELOCITY, Math.max(1, sound.velocity + audio.velocityOffset)),
  };
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
  if (placed.beat.rasgueado !== undefined) {
    return rasgueadoEvents(context, placed, timing, key);
  }
  const realDuration = realNoteDuration(context, placed, timing.duration);
  const initial = applyNoteAudio(placed, {
    key,
    start: timing.start + placed.move + strokeDelay,
    duration: realDuration > strokeDelay ? realDuration - strokeDelay : realDuration,
    velocity: realVelocity(context, placed),
    output: { channelId: context.channel.id, bendMode: false },
  });
  const fade = fadeEvents(placed.note.effect, { channelId: initial.output.channelId, start: initial.start, duration: initial.duration });
  const events = effectEvents(context, placed, initial);
  return fade.length === 0 ? events : fade.concat(events);
}

/** A rasgueado beat's note, struck once per finger of the pattern (rasgueado.ts); its other effects are not played. */
function rasgueadoEvents(context: TrackContext, placed: PlacedNote, timing: BeatTiming, key: number): SequenceEvent[] {
  const { rasgueado } = placed.beat;
  const output: NoteOutput = { channelId: context.channel.id, bendMode: false };
  const velocity = realVelocity(context, placed);
  const strikes = rasgueado === undefined ? [] : rasgueadoStrikes(rasgueado, placed.beat, placed.note.string, timing.duration);
  return strikes.flatMap((strike) => noteEvents(output, key, timing.start + placed.move + strike.start, strike.duration, velocity));
}

/** The note's effects in TuxGuitar's order (grace, then trill or tremolo picking, or pitch effect and harmonic), then the note. */
function effectEvents(context: TrackContext, placed: PlacedNote, initial: Sound): SequenceEvent[] {
  const { effect } = placed.note;
  const graced = effect.grace === undefined ? { sound: initial, events: NO_EVENTS } : applyGrace(context, placed, initial, effect.grace);
  const sound = graced.sound;
  if (effect.trill !== undefined && !isPercussion(context)) {
    const trillKey = pitchOf(context, placed.note.string, effect.trill.fret) ?? sound.key;
    return graced.events.concat(repeatedEvents(sound, durationTicks(effect.trill.duration), [sound.key, trillKey]));
  }
  if (effect.tremoloPicking !== undefined) {
    return graced.events.concat(repeatedEvents(sound, durationTicks(effect.tremoloPicking.duration), [sound.key]));
  }
  const pitched = isPercussion(context) ? { sound, events: NO_EVENTS } : pitchEffect(context, placed, sound);
  const harmonic =
    effect.harmonic === undefined || isPercussion(context)
      ? { sound: pitched.sound, events: NO_EVENTS }
      : applyHarmonic(placed.note, effect.harmonic, pitched.sound);
  const final = harmonic.sound;
  // concat, not spreads: this runs for every struck note.
  return graced.events.concat(pitched.events, harmonic.events, noteEvents(final.output, final.key, final.start, final.duration, final.velocity));
}
