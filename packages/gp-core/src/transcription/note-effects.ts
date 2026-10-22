import { BEND_PRESETS } from '../edit/effects';
import { lookupName } from '../formats/gpif/xml';
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { NoteEffect } from '../model/song';
import type { TranscribedEffect } from './types';

/**
 * What each transcribed effect sets on a note. Sheet music does not say how far a bend goes, so a bend is a half-tone
 * bend (BEND_PRESETS.half); a slide is a shift slide to the next note; a harmonic is a natural one.
 */
const EFFECT_CHANGES: Readonly<Record<TranscribedEffect, Partial<NoteEffect>>> = {
  hammer: { hammer: true },
  slide: { slides: ['shift'] },
  bend: { bend: BEND_PRESETS.half },
  vibrato: { vibrato: true },
  palmMute: { palmMute: true },
  letRing: { letRing: true },
  deadNote: { deadNote: true },
  ghostNote: { ghostNote: true },
  accent: { accentuatedNote: true },
  harmonic: { harmonic: { type: 'natural', data: 0 } },
};

export const TRANSCRIBED_EFFECTS = Object.keys(EFFECT_CHANGES) as readonly TranscribedEffect[];

export function isTranscribedEffect(name: unknown): name is TranscribedEffect {
  return typeof name === 'string' && lookupName(EFFECT_CHANGES, name) !== undefined;
}

/** The note effect for a transcribed note's effects; EMPTY_NOTE_EFFECT itself when it has none. */
export function toNoteEffect(effects: readonly TranscribedEffect[] | undefined): NoteEffect {
  return (effects ?? []).reduce<NoteEffect>((effect, name) => ({ ...effect, ...EFFECT_CHANGES[name] }), EMPTY_NOTE_EFFECT);
}
