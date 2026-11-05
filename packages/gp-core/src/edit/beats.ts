// Beat edits after TuxGuitar's TGMeasureManager (changeDuration, insert rest, removeVoice with moveNextVoices,
// cleanVoiceNotes), LGPL-2.1.
import { type DurationTuplets, NORMAL_TUPLET, durationTicks, isNoteValue, measureTicks } from '../model/defaults';
import type { Duration, Measure, MeasureHeader, Song, Tuplet } from '../model/song';
import { type BeatAddress, locateVoice } from './addresses';
import type { VoiceFlow } from './bar-flow';
import { type BeatChange, flowVoiceOn, pullVoiceBack } from './bar-ripple';
import { replaceAt, updateMeasure, updateVoice } from './song-paths';
import {
  type MeasureVoices,
  type VoiceEvents,
  eventIndexOfBeat,
  eventTicks,
  eventsTicks,
  isFreeRest,
  restEvent,
  restEvents,
  signedRests,
  isSameDuration,
  hasSameEvents,
  toBeats,
  toMeasureVoices,
} from './timeline';
import { restDurations } from './rests';
import { takeRestsAfter, trimTrailingRests } from './voice-fit';

export type { BeatAddress } from './addresses';
export type { BarFlow, BeatChange } from './bar-ripple';

/** One voice of a measure, as a beat edit sees it. */
interface VoiceContext {
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly measureVoices: MeasureVoices;
  /** The addressed voice's events. */
  readonly events: VoiceEvents;
  /** Index of the addressed event in `events`. */
  readonly index: number;
  /** Measure length in ticks. */
  readonly length: number;
}

/** A voice's new events, and the tuplets of the edited event (a rest cut at the measure end may use them). */
interface VoiceChange {
  readonly events: VoiceEvents;
  readonly tuplets: DurationTuplets;
  /** Events kept whatever the rests at the end are trimmed to: through the edited (or inserted) one. */
  readonly keptCount?: number;
}

function voiceContext(song: Song, at: BeatAddress): VoiceContext | undefined {
  const location = locateVoice(song, at);
  if (location === undefined || location.voice.isEmpty) {
    return undefined;
  }
  const { header, measure } = location;
  const measureVoices = toMeasureVoices(measure, header.start, at.voiceIndex);
  const events = measureVoices?.voices[at.voiceIndex];
  const index = events === undefined ? undefined : eventIndexOfBeat(events, at.beatIndex);
  if (measureVoices === undefined || events === undefined || index === undefined) {
    return undefined;
  }
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  return { header, measure, measureVoices, events, index, length };
}

/** The flowing voice of an edit at `at`, from its bar. */
function flowAt(at: BeatAddress): VoiceFlow {
  return { trackIndex: at.trackIndex, voiceIndex: at.voiceIndex, firstMeasureIndex: at.measureIndex };
}

/** True when the edit made the voice run past the bar line, longer than it was: the excess flows on. */
function isOverflowing(settled: VoiceEvents, context: VoiceContext): boolean {
  const ticks = eventsTicks(settled);
  return ticks > context.length && ticks > eventsTicks(context.events);
}

/**
 * Applies `change` to the addressed voice's events, trims the free rests left past the measure end and rebuilds the
 * measure's beats. Notes are never dropped: an edit that needs more time than the measure has passes what runs past
 * its end on into the next bars (flowVoiceOn), or — where a tuplet group would cross the bar line — lets the voice
 * run past the end (an over-full measure, which the score marks). Other voices never move.
 */
function editVoiceEvents(song: Song, at: BeatAddress, change: (context: VoiceContext) => VoiceChange | undefined): BeatChange {
  const context = voiceContext(song, at);
  const proposed = context === undefined ? undefined : change(context);
  if (context === undefined || proposed === undefined) {
    return { song };
  }
  const settled = trimTrailingRests(proposed.events, context.length, proposed.tuplets, proposed.keptCount);
  if (hasSameEvents(settled, context.events)) {
    return { song };
  }
  if (isOverflowing(settled, context)) {
    return flowVoiceOn(song, flowAt(at), settled);
  }
  const voices = replaceAt(context.measureVoices.voices, at.voiceIndex, settled);
  const beats = toBeats(context.header.start, { ...context.measureVoices, voices }, context.measure.beats);
  return { song: updateMeasure(song, at.trackIndex, at.measureIndex, (measure) => ({ ...measure, beats })) };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isTupletShape(tuplet: Tuplet): boolean {
  return isPositiveInteger(tuplet.enters) && isPositiveInteger(tuplet.times);
}

/** The inner tuplet a duration keeps: one that is a tuplet, inside an outer one that is too. */
function keptInnerTuplet(duration: Duration): { readonly innerTuplet?: Tuplet } {
  const { tuplet, innerTuplet } = duration;
  const isKept = innerTuplet !== undefined && tuplet.enters !== tuplet.times && innerTuplet.enters !== innerTuplet.times;
  return isKept ? { innerTuplet: { enters: innerTuplet.enters, times: innerTuplet.times } } : {};
}

/** A duration the model can hold, or undefined. Dotted wins over double dotted, as in durationTicks. */
function normalizeDuration(duration: Duration): Duration | undefined {
  const { enters, times } = duration.tuplet;
  const isInnerValid = duration.innerTuplet === undefined || isTupletShape(duration.innerTuplet);
  if (!isNoteValue(duration.value) || !isTupletShape(duration.tuplet) || !isInnerValid) {
    return undefined;
  }
  const normalized: Duration = {
    value: duration.value,
    dotted: duration.dotted,
    doubleDotted: duration.doubleDotted && !duration.dotted,
    tuplet: enters === 1 && times === 1 ? NORMAL_TUPLET : { enters, times },
    ...keptInnerTuplet(duration),
  };
  return durationTicks(normalized) > 0 ? normalized : undefined;
}

/**
 * New song with the addressed event's duration changed (value, dots, tuplet and the tuplet inside it). A shorter event
 * leaves rests of the new duration behind it, or gives the time to the rest after it when the two make one rest on its
 * beat; a longer one takes the time from the free rests that follow (later notes move right only as far as needed),
 * and what then runs past the bar line flows on into the next bars (flowVoiceOn; the event itself becomes tied notes
 * when it crosses the bar line). Same song when the duration is the same or invalid, or the voice is empty there.
 */
export function setBeatDuration(song: Song, at: BeatAddress, duration: Duration): Song {
  return setBeatDurationWithFlow(song, at, duration).song;
}

/** setBeatDuration, with what it moved across bar lines. */
export function setBeatDurationWithFlow(song: Song, at: BeatAddress, duration: Duration): BeatChange {
  const next = normalizeDuration(duration);
  if (next === undefined) {
    return { song };
  }
  return editVoiceEvents(song, at, ({ events, index }) => {
    const event = events[index];
    if (event === undefined || isSameDuration(event.voice.duration, next)) {
      return undefined;
    }
    const replaced = replaceAt(events, index, { ...event, voice: { ...event.voice, duration: next } });
    const delta = durationTicks(next) - eventTicks(event);
    const resized = delta > 0 ? takeRestsAfter(replaced, index, delta, next) : restAfter(replaced, index, -delta, next);
    return resized === undefined ? undefined : { events: resized, tuplets: next, keptCount: index + 1 };
  });
}

/**
 * The events with `ticks` freed after `index` given to the free rest right after it, when the two make one plain rest
 * that starts on a multiple of its own length (a dot taken off gives its time back to the rest it came from); undefined
 * otherwise.
 */
function mergedRestAfter(events: VoiceEvents, index: number, ticks: number): VoiceEvents | undefined {
  const next = events[index + 1];
  if (next === undefined || !isFreeRest(next)) {
    return undefined;
  }
  const [single, ...more] = restDurations(ticks + eventTicks(next), undefined, next.voice.duration) ?? [];
  const offset = eventsTicks(events.slice(0, index + 1));
  if (single === undefined || more.length > 0 || single.dotted || offset % durationTicks(single) !== 0) {
    return undefined;
  }
  return replaceAt(events, index + 1, { ...next, voice: { ...next.voice, duration: single } });
}

/**
 * The events with rests of `ticks` (preferably `preferred`) put right after `index` — joined with the free rest that
 * follows when they make one rest on its beat (mergedRestAfter); undefined when they cannot be written.
 */
function restAfter(events: VoiceEvents, index: number, ticks: number, preferred: Duration): VoiceEvents | undefined {
  const merged = mergedRestAfter(events, index, ticks);
  if (merged !== undefined) {
    return merged;
  }
  const fill = restEvents(ticks, preferred);
  return fill === undefined ? undefined : [...events.slice(0, index + 1), ...signedRests(fill, events[index]), ...events.slice(index + 1)];
}

/**
 * New song where the addressed voice becomes a rest of the same duration (TGMeasureManager.cleanVoiceNotes); the
 * beat and the other voices stay. Same song for a rest, an empty voice or a missing beat.
 */
export function deleteBeatNotes(song: Song, at: BeatAddress): Song {
  return updateVoice(song, at, (voice) => (voice.isEmpty || voice.notes.length === 0 ? voice : { ...voice, notes: [] }));
}

/**
 * New song with a rest as long as the addressed event inserted before or after it in that voice. The events after it
 * move right: free rests pushed past the measure end are dropped, and what else runs past it flows on into the next
 * bars (flowVoiceOn) — the inserted rest too, after a full bar's last beat.
 */
export function insertBeat(song: Song, at: BeatAddress, position: 'before' | 'after'): Song {
  return insertBeatWithFlow(song, at, position).song;
}

/** insertBeat, with what it moved across bar lines. */
export function insertBeatWithFlow(song: Song, at: BeatAddress, position: 'before' | 'after'): BeatChange {
  return editVoiceEvents(song, at, ({ events, index }) => {
    const event = events[index];
    if (event === undefined) {
      return undefined;
    }
    const insertIndex = position === 'before' ? index : index + 1;
    const inserted = [...events.slice(0, insertIndex), ...signedRests([restEvent(event.voice.duration)], event), ...events.slice(insertIndex)];
    return { events: inserted, tuplets: event.voice.duration, keptCount: insertIndex + 1 };
  });
}

/**
 * New song without the addressed event of that voice: the events after it move left. A bar that was full and does not
 * end in a rest pulls the time it lacks back from the next bars (pullVoiceBack); otherwise the voice is padded at the
 * end with rests of the removed length (as far as the measure allows). When the padding cannot be written as rests
 * (an odd remainder in an overfull measure) the voice is left short rather than the delete refused: nothing is lost
 * and the measure stays valid.
 */
export function deleteBeat(song: Song, at: BeatAddress): Song {
  return deleteBeatWithFlow(song, at).song;
}

/** deleteBeat, with what it moved across bar lines. */
export function deleteBeatWithFlow(song: Song, at: BeatAddress): BeatChange {
  const context = voiceContext(song, at);
  const removed = context?.events[context.index];
  if (context === undefined || removed === undefined) {
    return { song };
  }
  const { events, index, length } = context;
  const remaining = withoutEvent(events, index);
  const isPulling = eventsTicks(events) >= length && eventsTicks(remaining) < length;
  const pulled = isPulling ? pullVoiceBack(song, flowAt(at), remaining, removed.voice.duration) : undefined;
  return pulled ?? editVoiceEvents(song, at, paddedWithoutEvent);
}

function withoutEvent(events: VoiceEvents, index: number): VoiceEvents {
  return [...events.slice(0, index), ...events.slice(index + 1)];
}

/** The voice without the addressed event, padded at the end with rests of its length as far as the bar allows. */
function paddedWithoutEvent({ events, index, length }: VoiceContext): VoiceChange | undefined {
  const removed = events[index];
  if (removed === undefined) {
    return undefined;
  }
  const remaining = withoutEvent(events, index);
  const padding = Math.max(0, Math.min(eventsTicks(events), length) - eventsTicks(remaining));
  const padded = [...remaining, ...signedRests(restEvents(padding, removed.voice.duration) ?? [], remaining[remaining.length - 1] ?? removed)];
  return { events: padded, tuplets: removed.voice.duration };
}
