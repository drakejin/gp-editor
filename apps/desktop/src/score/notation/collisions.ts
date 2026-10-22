import type { VoiceEvent } from './events';
import { GLYPH_WIDTH } from './metrics';
import { restPosition } from './rests';

/**
 * Two voices on one beat. Where the notes of the upper voice (stems up) come within a second of the lower voice's,
 * the upper voice moves a notehead to the right; a unison of the same notehead is shared. Rests move clear of the
 * other voice's notes.
 */

/** From a rest's staff position to the nearest note of the other voice it must clear. */
const REST_CLEARANCE = 4;
/** Rests stay within the notation band. */
const REST_RANGE = { lowest: -12, highest: 16 } as const;
const BLACK_HEAD = 4;

function positions(event: VoiceEvent): number[] {
  return event.notes.map(note => note.position);
}

function sameNotehead(a: VoiceEvent, b: VoiceEvent): boolean {
  return (
    a.duration.value === b.duration.value ||
    (a.duration.value >= BLACK_HEAD && b.duration.value >= BLACK_HEAD)
  );
}

function sharesUnison(a: VoiceEvent, b: VoiceEvent): boolean {
  return (
    a.notes.length === 1 &&
    b.notes.length === 1 &&
    a.notes[0]?.position === b.notes[0]?.position &&
    sameNotehead(a, b)
  );
}

function touches(upper: VoiceEvent, others: readonly VoiceEvent[]): boolean {
  const lowest = Math.min(...positions(upper));
  return others.some(
    other =>
      other.notes.length > 0 &&
      !sharesUnison(upper, other) &&
      Math.max(...positions(other)) >= lowest - 1,
  );
}

function clearRest(
  rest: VoiceEvent,
  others: readonly VoiceEvent[],
): number | undefined {
  const notes = others.flatMap(positions);
  if (notes.length === 0) {
    return undefined;
  }
  const usual = restPosition(rest, true);
  if (rest.voiceIndex === 0) {
    const needed = Math.ceil((Math.max(...notes) + REST_CLEARANCE) / 2) * 2;
    return needed > usual ? Math.min(REST_RANGE.highest, needed) : undefined;
  }
  const needed = Math.floor((Math.min(...notes) - REST_CLEARANCE) / 2) * 2;
  return needed < usual ? Math.max(REST_RANGE.lowest, needed) : undefined;
}

export function separateVoices(events: readonly VoiceEvent[]): VoiceEvent[] {
  return events.map(event => {
    const others = events.filter(
      other =>
        other.beatIndex === event.beatIndex &&
        other.voiceIndex !== event.voiceIndex,
    );
    if (others.length === 0) {
      return event;
    }
    if (event.notes.length === 0) {
      const position = clearRest(event, others);
      return position === undefined
        ? event
        : { ...event, restPosition: position };
    }
    return event.voiceIndex === 0 && touches(event, others)
      ? { ...event, x: event.x + GLYPH_WIDTH.noteheadBlack }
      : event;
  });
}
