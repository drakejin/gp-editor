import type { DurationTuplets } from '../model/defaults';
import type { Duration } from '../model/song';
import { type VoiceEvent, type VoiceEvents, eventTicks, eventsTicks, isFreeRest, restEvents, signedRests } from './timeline';

/**
 * How a voice may sit in its measure after a time-signature change, which refuses to push notes out of the measure
 * (TuxGuitar outside free-edition mode); free rests are what it takes room from or gives time to.
 */
export interface FitLimits {
  /** Events other than free rests that start at or after the measure end. */
  readonly eventsOutside: number;
  /** Ticks the voice runs past the measure end. */
  readonly overhang: number;
}

export function fitLimits(events: VoiceEvents, length: number): FitLimits {
  let position = 0;
  let eventsOutside = 0;
  for (const event of events) {
    if (position >= length && !isFreeRest(event)) {
      eventsOutside += 1;
    }
    position += eventTicks(event);
  }
  return { eventsOutside, overhang: Math.max(0, position - length) };
}

function lastFixedIndex(events: VoiceEvents): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && !isFreeRest(event)) {
      return i;
    }
  }
  return -1;
}

/** A free rest cut down to `ticks` (rests in `tuplets` allowed); it keeps its attributes on the first piece. */
function cutRest(event: VoiceEvent, ticks: number, tuplets: DurationTuplets | undefined): VoiceEvents {
  const [first, ...others] = restEvents(ticks, undefined, tuplets) ?? [];
  if (first === undefined) {
    return [];
  }
  return [event.attributes === undefined ? first : { ...first, attributes: event.attributes }, ...signedRests(others, event)];
}

/** The events with the free rests after the last other event trimmed to end by `length` (removeVoicesOutOfTime). */
export function trimTrailingRests(events: VoiceEvents, length: number, tuplets?: DurationTuplets): VoiceEvents {
  const fixedCount = lastFixedIndex(events) + 1;
  const kept: VoiceEvent[] = events.slice(0, fixedCount);
  let position = eventsTicks(kept);
  for (const event of events.slice(fixedCount)) {
    if (position >= length) {
      break;
    }
    const end = position + eventTicks(event);
    if (end > length) {
      kept.push(...cutRest(event, length - position, tuplets));
      break;
    }
    kept.push(event);
    position = end;
  }
  return kept;
}

/**
 * The voice after an edit, trailing rests trimmed to the measure (a cut rest may use `tuplets`); undefined when it
 * sticks out of the measure further than `limits` allow (more events starting outside it, or a longer overhang).
 */
export function settleVoice(events: VoiceEvents, length: number, limits: FitLimits, tuplets?: DurationTuplets): VoiceEvents | undefined {
  const trimmed = trimTrailingRests(events, length, tuplets);
  const after = fitLimits(trimmed, length);
  return after.eventsOutside <= limits.eventsOutside && after.overhang <= limits.overhang ? trimmed : undefined;
}

/**
 * Makes room for `ticks` more after the event at `index` by taking free rests that follow it (validateDuration with
 * moveNextBeats): each rest taken is removed whole and what it held beyond the need goes back as rests in its place,
 * so the events after it keep their position; events before it move right. Undefined when the excess cannot be
 * written as rests.
 */
export function takeRestsAfter(events: VoiceEvents, index: number, ticks: number, preferred: Duration): VoiceEvents | undefined {
  const kept: VoiceEvent[] = events.slice(0, index + 1);
  let needed = ticks;
  for (const event of events.slice(index + 1)) {
    if (needed <= 0 || !isFreeRest(event)) {
      kept.push(event);
      continue;
    }
    needed -= eventTicks(event);
    if (needed < 0) {
      const refill = restEvents(-needed, preferred);
      if (refill === undefined) {
        return undefined;
      }
      kept.push(...signedRests(refill, event));
      needed = 0;
    }
  }
  return kept;
}
