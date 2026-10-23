// Port of TuxGuitar app.tuxguitar.io.tef3.TESongParser.addNoteEffects and addGraceNoteMetadata (LGPL-2.1).
import { EMPTY_NOTE_EFFECT, QUARTER } from '../../model/defaults';
import type { Bend, Grace, GraceTransition, Harmonic, NoteEffect } from '../../model/song';
import { artificialHarmonicOffset } from '../common/harmonics';
import { DEFAULT_VELOCITY } from '../common/velocity';
import type { TeGraceNoteMetadata, TeNote } from './tef-model';
import { velocityFromDynamic } from './tef-durations';

/** TEComponentNoteDynamics.PPP: TablEdit marks a tied note with it. */
export const TE_TIE_DYNAMIC = 7;

const SHIFT_SLIDE = ['shift'] as const;
const NATURAL_HARMONIC: Harmonic = { type: 'natural', data: 0 };
/** TuxGuitar stores harmonic data 0, an index into NATURAL_FREQUENCIES. */
const ARTIFICIAL_HARMONIC: Harmonic = { type: 'artificial', data: artificialHarmonicOffset(0) };
/** A half-tone bend (TESongParser: points 0, 6 and 12, value 2). */
const BEND: Bend = { points: [{ position: 0, value: 0 }, { position: 6, value: 2 }, { position: 12, value: 2 }] };
const BEND_RELEASE: Bend = {
  points: [
    { position: 0, value: 0 },
    { position: 3, value: 2 },
    { position: 6, value: 2 },
    { position: 9, value: 0 },
    { position: 12, value: 0 },
  ],
};

/** TEComponentNoteEffect1: hammer-on, pull-off, slide … dead note. Choke, brush and roll have no place in the model. */
const EFFECT1: ReadonlyMap<number, Partial<NoteEffect>> = new Map<number, Partial<NoteEffect>>([
  [1, { hammer: true }],
  [2, { hammer: true }],
  [3, { slides: SHIFT_SLIDE }],
  [6, { harmonic: NATURAL_HARMONIC }],
  [7, { harmonic: ARTIFICIAL_HARMONIC }],
  [8, { palmMute: true }],
  [9, { tapping: true }],
  [10, { vibrato: true }],
  // No duration in the file: TGEffectTremoloPicking's default.
  [11, { tremoloPicking: { duration: QUARTER } }],
  [12, { bend: BEND }],
  [13, { bend: BEND_RELEASE }],
  [15, { deadNote: true }],
]);

/** TEComponentNoteEffect2: let ring, slap, ghost note, staccato, fade in (rasgueado, tremolo bar dives, fade out: none). */
const EFFECT2: ReadonlyMap<number, Partial<NoteEffect>> = new Map<number, Partial<NoteEffect>>([
  [1, { letRing: true }],
  [2, { slapping: true }],
  [4, { ghostNote: true }],
  [7, { staccato: true }],
  [8, { fadeIn: true }],
]);

/** TEComponentNoteEffect3: a second effect slot. */
const EFFECT3: ReadonlyMap<number, Partial<NoteEffect>> = new Map<number, Partial<NoteEffect>>([
  [1, { hammer: true }],
  [2, { hammer: true }],
  [6, { harmonic: NATURAL_HARMONIC }],
  [7, { harmonic: ARTIFICIAL_HARMONIC }],
  [8, { letRing: true }],
  [9, { ghostNote: true }],
  [10, { deadNote: true }],
]);

/** TEComponentNoteGraceNoteEffect: hammer-on, slide, bend-release; mordents, doubles, gruppettos and trills: none. */
const GRACE_TRANSITIONS: ReadonlyMap<number, GraceTransition> = new Map<number, GraceTransition>([
  [1, 'hammer'],
  [2, 'slide'],
  [3, 'bend'],
]);

/** TGEffectGrace.DURATION_*: a metadata duration of 2 is a 32nd, 3 and longer a 16th (the longest grace there is). */
const GRACE_THIRTY_SECOND = 2;
const GRACE_SIXTEENTH = 3;
const GRACE_LONGEST_CODE = 6;

/** addNoteEffects: the grace note and the three effect slots (later slots win where they overlap). */
export function noteEffectOf(note: TeNote): NoteEffect {
  return {
    ...EMPTY_NOTE_EFFECT,
    ...(note.isGraceNote ? { grace: graceOf(note) } : {}),
    ...EFFECT1.get(note.effect1),
    ...EFFECT2.get(note.effect2),
    ...EFFECT3.get(note.effect3),
  };
}

function graceOf(note: TeNote): Grace {
  return {
    fret: note.graceNoteFret,
    duration: 1,
    velocity: velocityFromDynamic(note.dynamics),
    transition: GRACE_TRANSITIONS.get(note.graceNoteEffect) ?? 'none',
    onBeat: false,
    isDead: false,
  };
}

/** addGraceNoteMetadata: a fret too high for the note's five bits, and the grace note's length. */
export function withGraceMetadata(effect: NoteEffect, metadata: TeGraceNoteMetadata): NoteEffect {
  const grace: Grace = effect.grace ?? { fret: 0, duration: 1, velocity: DEFAULT_VELOCITY, transition: 'none', onBeat: false, isDead: false };
  const fret = metadata.doubleNoteOne > 0 ? metadata.doubleNoteOne : grace.fret;
  const duration = graceDuration(metadata.duration) ?? grace.duration;
  return { ...effect, grace: { ...grace, fret, duration } };
}

function graceDuration(code: number): number | undefined {
  if (code === GRACE_THIRTY_SECOND) {
    return GRACE_THIRTY_SECOND;
  }
  return code >= GRACE_SIXTEENTH && code <= GRACE_LONGEST_CODE ? GRACE_SIXTEENTH : undefined;
}
