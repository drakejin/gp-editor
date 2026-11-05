import { NO_TUPLETS } from '../model/defaults';
import { restDurations } from './rests';
import { splitAtBarLines } from './tied-pieces';
import { type VoiceEvent, type VoiceEvents, distinctTuplets, eventTicks, gapRests, signedRests } from './timeline';

/**
 * Cutting a voice's events at a bar line (the edits that move music across bar lines one bar at a time): a plain note
 * across the cut becomes tied notes, a rest two rests, and a tuplet group is never cut.
 */

/** A voice's events cut in two: those before the cut, and those from it on. */
export interface EventCut {
  readonly before: VoiceEvents;
  readonly after: VoiceEvents;
  /** The event cut across the cut place, and the pieces it became (before the cut first); none when the cut fell between events. */
  readonly split?: { readonly event: VoiceEvent; readonly pieces: VoiceEvents };
}

/** Where an event starts (ticks from the first event), and whether a cut there keeps every tuplet group whole. */
interface CutPlace {
  readonly offset: number;
  readonly isWhole: boolean;
}

function isTupletEvent(event: VoiceEvent): boolean {
  const { tuplet, innerTuplet } = event.voice.duration;
  return tuplet.enters !== tuplet.times || (innerTuplet !== undefined && innerTuplet.enters !== innerTuplet.times);
}

/** True for time plain durations can write, without a tuplet. */
function isPlainTime(ticks: number): boolean {
  return ticks === 0 || restDurations(ticks, undefined, NO_TUPLETS) !== undefined;
}

/**
 * Each event's start, then the end: whole outside a run of tuplet events, and inside one where the run's time so far is
 * plain time (a group closes there — three triplet eighths make a quarter).
 */
function cutPlaces(events: VoiceEvents): readonly CutPlace[] {
  const places: CutPlace[] = [];
  let offset = 0;
  let runStart: number | undefined;
  for (const event of events) {
    places.push({ offset, isWhole: runStart === undefined || isPlainTime(offset - runStart) });
    runStart = isTupletEvent(event) ? (runStart ?? offset) : undefined;
    offset += eventTicks(event);
  }
  places.push({ offset, isWhole: runStart === undefined || isPlainTime(offset - runStart) });
  return places;
}

/**
 * The events cut `at` ticks from their start: between two events, or across a plain event (notes become tied notes,
 * see splitAtBarLines). Undefined when the cut would split a tuplet group or a piece cannot be written; every event
 * before the cut when they end by it.
 */
export function cutEventsAt(events: VoiceEvents, at: number): EventCut | undefined {
  const places = cutPlaces(events);
  for (let index = 0; index < events.length; index++) {
    const event = events[index] as VoiceEvent;
    const place = places[index] as CutPlace;
    const end = place.offset + eventTicks(event);
    if (end > at) {
      return place.offset >= at ? cutBefore(events, index, place) : cutAcross(events, index, place, at - place.offset);
    }
  }
  return { before: events, after: [] };
}

function cutBefore(events: VoiceEvents, index: number, place: CutPlace): EventCut | undefined {
  return place.isWhole ? { before: events.slice(0, index), after: events.slice(index) } : undefined;
}

function cutAcross(events: VoiceEvents, index: number, place: CutPlace, ticks: number): EventCut | undefined {
  const event = events[index] as VoiceEvent;
  const pieces = place.isWhole && !isTupletEvent(event) ? splitAtBarLines(event, [ticks, eventTicks(event) - ticks]) : undefined;
  if (pieces === undefined) {
    return undefined;
  }
  const [head = [], tail = []] = pieces;
  return { before: [...events.slice(0, index), ...head], after: [...tail, ...events.slice(index + 1)], split: { event, pieces: [...head, ...tail] } };
}

/** The last event (not the first) starting before `length` where a cut keeps the tuplet groups whole; -1 when none. */
function lastWholeStartBefore(places: readonly CutPlace[], eventCount: number, length: number): number {
  for (let index = eventCount - 1; index > 0; index--) {
    const place = places[index];
    if (place !== undefined && place.isWhole && place.offset < length) {
      return index;
    }
  }
  return -1;
}

/**
 * The events cut at the bar line `length`: there (cutEventsAt), else before the tuplet group or the note it cannot cut,
 * which goes on whole, the time it leaves before the bar line written as rests (under the octave sign before them).
 * Undefined when nothing but the bar's start keeps the group whole, or the rests cannot be written.
 */
export function cutAtBarLine(events: VoiceEvents, length: number): EventCut | undefined {
  const exact = cutEventsAt(events, length);
  if (exact !== undefined) {
    return exact;
  }
  const places = cutPlaces(events);
  const index = lastWholeStartBefore(places, events.length, length);
  const offset = places[index]?.offset;
  const gap = offset === undefined ? undefined : gapRests(length - offset, distinctTuplets(events.map((event) => event.voice.duration)));
  if (index < 0 || gap === undefined) {
    return undefined;
  }
  return { before: [...events.slice(0, index), ...signedRests(gap, events[index - 1])], after: events.slice(index) };
}
