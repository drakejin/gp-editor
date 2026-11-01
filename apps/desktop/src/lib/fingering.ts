import { type Finger, type Hand, type Song, isKeyboardProgram } from '@gp-editor/core';
import type { FingeringLabel } from '../score/symbols/smufl';
import { trackInstrument } from './instruments';

/** How Guitar Pro writes a finger: the fretting hand T 1 2 3 4, the picking hand p i m a c, a keyboard 1–5. */
const LEFT_HAND: Readonly<Record<Finger, FingeringLabel>> = { thumb: 'T', index: '1', middle: '2', annular: '3', little: '4' };
const RIGHT_HAND: Readonly<Record<Finger, FingeringLabel>> = { thumb: 'p', index: 'i', middle: 'm', annular: 'a', little: 'c' };
const PIANO: Readonly<Record<Finger, FingeringLabel>> = { thumb: '1', index: '2', middle: '3', annular: '4', little: '5' };

export function fingeringLabel(finger: Finger, hand: Hand, isKeyboard: boolean): FingeringLabel {
  if (isKeyboard) {
    return PIANO[finger];
  }
  return hand === 'left' ? LEFT_HAND[finger] : RIGHT_HAND[finger];
}

/** A track whose instrument is a piano or an organ (General MIDI): its fingering is piano fingering. */
export function isKeyboardTrack(song: Song, trackIndex: number): boolean {
  const instrument = trackInstrument(song, trackIndex);
  return instrument !== undefined && !instrument.isPercussion && isKeyboardProgram(instrument.program);
}
