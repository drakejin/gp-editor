// Port of TuxGuitar MidiSequenceParser.addFadeIn (LGPL-2.1), with the fade out and volume swell Guitar Pro plays as
// the same expression (CC 11) envelope run backwards, or up then down.
import type { NoteEffect } from '../model/song';
import { CONTROLLER, controlChangeEvent, type SequenceEvent } from './midi-events';
import { truncToMidiTicks } from './midi-ticks';

const QUIET = 31;
const FULL = 127;

/** Where a note sounds on which channel: the expression envelope spans it. */
export interface FadeSpan {
  readonly channelId: number;
  readonly start: number;
  readonly duration: number;
}

/** The expression stepping by one from `from` towards `to` (not reaching it) over `duration`, evenly on the MIDI grid. */
function ramp(channelId: number, start: number, duration: number, from: number, to: number): SequenceEvent[] {
  const step = truncToMidiTicks(duration, Math.abs(to - from));
  const direction = Math.sign(to - from);
  const end = start + duration;
  const events: SequenceEvent[] = [];
  for (let tick = start, value = from; tick < end && value !== to; tick += step, value += direction) {
    events.push(controlChangeEvent(channelId, tick, CONTROLLER.EXPRESSION, value));
  }
  return events;
}

/**
 * The note's fade as expression changes: fade in climbs from 31 to 127 over the note (addFadeIn), fade out falls from
 * 127 to 31, a volume swell climbs over the first half and falls over the second; the expression is back at 127 when
 * the note ends. None for a note without a fade.
 */
export function fadeEvents(effect: NoteEffect, span: FadeSpan): SequenceEvent[] {
  const { channelId, start, duration } = span;
  const end = controlChangeEvent(channelId, start + duration, CONTROLLER.EXPRESSION, FULL);
  if (effect.fadeIn) {
    return [...ramp(channelId, start, duration, QUIET, FULL), end];
  }
  if (effect.fadeOut === true) {
    return [...ramp(channelId, start, duration, FULL, QUIET), end];
  }
  if (effect.volumeSwell === true) {
    const half = duration / 2;
    return [...ramp(channelId, start, half, QUIET, FULL), ...ramp(channelId, start + half, half, FULL, QUIET), end];
  }
  return [];
}
