import type { VoiceEvent } from './events';
import { GLYPH_WIDTH } from './metrics';
import { restPosition } from './rests';
import { isUpperVoice } from '../voices';

/**
 * Several voices on one beat. Where the notes of an upper voice (1 or 3, stems up) come within a second of a lower
 * voice's (2 or 4), the upper voice moves a notehead to the right; voice 3 (4) moves a further notehead right of
 * voice 1 (2) when their notes come within a second; a unison of the same notehead is shared. Rests move clear of the
 * other voices' notes, and the rest of voice 3 (4) clear of voice 1's (2's) on the same beat.
 */

/** From a rest's staff position to the nearest note of the other voice it must clear. */
const REST_CLEARANCE = 4;
/** Between two rests on the same side of the staff (a quarter rest is three spaces tall). */
const REST_STACK = 6;
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

/** An upper voice's lowest note within a second of (or under) a lower voice's highest. */
function touchesBelow(
  upper: VoiceEvent,
  others: readonly VoiceEvent[],
): boolean {
  const lowest = Math.min(...positions(upper));
  return others.some(
    other =>
      other.notes.length > 0 &&
      !isUpperVoice(other.voiceIndex) &&
      !sharesUnison(upper, other) &&
      Math.max(...positions(other)) >= lowest - 1,
  );
}

/** Voice 3 (4) against voice 1 (2), stems the same way: some notes a second apart or less. */
function touchesSameSide(
  event: VoiceEvent,
  others: readonly VoiceEvent[],
): boolean {
  return others.some(
    other =>
      other.voiceIndex < event.voiceIndex &&
      isUpperVoice(other.voiceIndex) === isUpperVoice(event.voiceIndex) &&
      other.notes.length > 0 &&
      !sharesUnison(event, other) &&
      positions(event).some(a =>
        positions(other).some(b => Math.abs(a - b) <= 1),
      ),
  );
}

/** Noteheads the event moves right: past a lower voice it touches (upper voices), past a same-side voice before it. */
function headShift(event: VoiceEvent, others: readonly VoiceEvent[]): number {
  const pastLower =
    isUpperVoice(event.voiceIndex) && touchesBelow(event, others) ? 1 : 0;
  return pastLower + (touchesSameSide(event, others) ? 1 : 0);
}

/** Rest positions already moved, by event: a later voice's rest stacks beyond where an earlier one went. */
type MovedRests = ReadonlyMap<VoiceEvent, number>;

/** The staff positions a rest must clear: other voices' notes, and the rests of same-side voices before it (stacked). */
function restObstacles(
  rest: VoiceEvent,
  others: readonly VoiceEvent[],
  moved: MovedRests,
): number[] {
  const isUp = isUpperVoice(rest.voiceIndex);
  const notes = others.flatMap(positions);
  const rests = others
    .filter(
      other =>
        other.notes.length === 0 &&
        other.voiceIndex < rest.voiceIndex &&
        isUpperVoice(other.voiceIndex) === isUp,
    )
    .map(
      other =>
        (moved.get(other) ?? restPosition(other, true)) +
        (isUp ? REST_STACK - REST_CLEARANCE : REST_CLEARANCE - REST_STACK),
    );
  return [...notes, ...rests];
}

function clearRest(
  rest: VoiceEvent,
  others: readonly VoiceEvent[],
  moved: MovedRests,
): number | undefined {
  const obstacles = restObstacles(rest, others, moved);
  if (obstacles.length === 0) {
    return undefined;
  }
  const usual = restPosition(rest, true);
  if (isUpperVoice(rest.voiceIndex)) {
    const needed = Math.ceil((Math.max(...obstacles) + REST_CLEARANCE) / 2) * 2;
    return needed > usual ? Math.min(REST_RANGE.highest, needed) : undefined;
  }
  const needed = Math.floor((Math.min(...obstacles) - REST_CLEARANCE) / 2) * 2;
  return needed < usual ? Math.max(REST_RANGE.lowest, needed) : undefined;
}

function othersOnBeat(
  events: readonly VoiceEvent[],
  event: VoiceEvent,
): VoiceEvent[] {
  return events.filter(
    other =>
      other.beatIndex === event.beatIndex &&
      other.voiceIndex !== event.voiceIndex,
  );
}

/** Where each rest moves, placed in voice order (voice 3's beyond voice 1's as moved). */
function movedRests(events: readonly VoiceEvent[]): MovedRests {
  const rests = events
    .filter(event => event.notes.length === 0)
    .sort((a, b) => a.voiceIndex - b.voiceIndex);
  return rests.reduce<Map<VoiceEvent, number>>((moved, rest) => {
    const position = clearRest(rest, othersOnBeat(events, rest), moved);
    return position === undefined ? moved : new Map([...moved, [rest, position]]);
  }, new Map());
}

export function separateVoices(events: readonly VoiceEvent[]): VoiceEvent[] {
  const rests = movedRests(events);
  return events.map(event => {
    const others = othersOnBeat(events, event);
    if (others.length === 0) {
      return event;
    }
    if (event.notes.length === 0) {
      const position = rests.get(event);
      return position === undefined
        ? event
        : { ...event, restPosition: position };
    }
    const shift = headShift(event, others);
    return shift === 0
      ? event
      : { ...event, x: event.x + shift * GLYPH_WIDTH.noteheadBlack };
  });
}
