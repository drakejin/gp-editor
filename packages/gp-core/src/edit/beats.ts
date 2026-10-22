// Beat edits after TuxGuitar's TGMeasureManager (changeDuration, insert rest, removeVoice with moveNextVoices), LGPL-2.1.
import { NORMAL_TUPLET, durationTicks, isNoteValue, measureTicks } from '../model/defaults';
import type { Duration, Measure, MeasureHeader, Song, Tuplet } from '../model/song';
import { type BeatAddress, locateVoice } from './addresses';
import { replaceAt, updateMeasure } from './song-paths';
import {
  type MeasureVoices,
  type VoiceEvents,
  eventIndexOfBeat,
  eventTicks,
  eventsTicks,
  restEvent,
  restEvents,
  isSameDuration,
  hasSameEvents,
  toBeats,
  toMeasureVoices,
} from './timeline';
import { takeRestsAfter, trimTrailingRests } from './voice-fit';

export type { BeatAddress } from './addresses';

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

/** A voice's new events, and the tuplet of the edited event (a rest cut at the measure end may use it). */
interface VoiceChange {
  readonly events: VoiceEvents;
  readonly tuplet: Tuplet;
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

/**
 * Applies `change` to the addressed voice's events, trims the free rests left past the measure end and rebuilds the
 * measure's beats. Notes are never dropped: like Guitar Pro, an edit that needs more time than the measure has lets
 * the voice run past the end (an over-full measure, which the score marks). Other voices never move.
 */
function editVoiceEvents(song: Song, at: BeatAddress, change: (context: VoiceContext) => VoiceChange | undefined): Song {
  const context = voiceContext(song, at);
  const proposed = context === undefined ? undefined : change(context);
  if (context === undefined || proposed === undefined) {
    return song;
  }
  const settled = trimTrailingRests(proposed.events, context.length, proposed.tuplet);
  if (hasSameEvents(settled, context.events)) {
    return song;
  }
  const voices = replaceAt(context.measureVoices.voices, at.voiceIndex, settled);
  const beats = toBeats(context.header.start, { ...context.measureVoices, voices }, context.measure.beats);
  return updateMeasure(song, at.trackIndex, at.measureIndex, (measure) => ({ ...measure, beats }));
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** A duration the model can hold, or undefined. Dotted wins over double dotted, as in durationTicks. */
function normalizeDuration(duration: Duration): Duration | undefined {
  const { enters, times } = duration.tuplet;
  if (!isNoteValue(duration.value) || !isPositiveInteger(enters) || !isPositiveInteger(times)) {
    return undefined;
  }
  const normalized: Duration = {
    value: duration.value,
    dotted: duration.dotted,
    doubleDotted: duration.doubleDotted && !duration.dotted,
    tuplet: enters === 1 && times === 1 ? NORMAL_TUPLET : { enters, times },
  };
  return durationTicks(normalized) > 0 ? normalized : undefined;
}

/**
 * New song with the addressed event's duration changed (value, dots, tuplet). A shorter event leaves rests of the new
 * duration behind it; a longer one takes the time from the free rests that follow (later notes move right only as far
 * as needed, past the measure end when the rests run out). Same song when the duration is the same or invalid, or the
 * voice is empty there.
 */
export function setBeatDuration(song: Song, at: BeatAddress, duration: Duration): Song {
  const next = normalizeDuration(duration);
  if (next === undefined) {
    return song;
  }
  return editVoiceEvents(song, at, ({ events, index }) => {
    const event = events[index];
    if (event === undefined || isSameDuration(event.voice.duration, next)) {
      return undefined;
    }
    const replaced = replaceAt(events, index, { ...event, voice: { ...event.voice, duration: next } });
    const delta = durationTicks(next) - eventTicks(event);
    const resized = delta > 0 ? takeRestsAfter(replaced, index, delta, next) : restAfter(replaced, index, -delta, next);
    return resized === undefined ? undefined : { events: resized, tuplet: next.tuplet };
  });
}

/** The events with rests of `ticks` (preferably `preferred`) put right after `index`; undefined when they cannot be written. */
function restAfter(events: VoiceEvents, index: number, ticks: number, preferred: Duration): VoiceEvents | undefined {
  const fill = restEvents(ticks, preferred);
  return fill === undefined ? undefined : [...events.slice(0, index + 1), ...fill, ...events.slice(index + 1)];
}

/**
 * New song with a rest as long as the addressed event inserted before or after it in that voice. The events after it
 * move right; free rests pushed past the measure end are dropped and notes pushed past it make the measure over-full.
 */
export function insertBeat(song: Song, at: BeatAddress, position: 'before' | 'after'): Song {
  return editVoiceEvents(song, at, ({ events, index }) => {
    const event = events[index];
    if (event === undefined) {
      return undefined;
    }
    const insertIndex = position === 'before' ? index : index + 1;
    const inserted = [...events.slice(0, insertIndex), restEvent(event.voice.duration), ...events.slice(insertIndex)];
    return { events: inserted, tuplet: event.voice.duration.tuplet };
  });
}

/**
 * New song without the addressed event of that voice: the events after it move left and the voice is padded at the
 * end with rests of the removed length (as far as the measure allows), so a full measure stays full. When the padding
 * cannot be written as rests (an odd remainder in an overfull measure) the voice is left short rather than the delete
 * refused: nothing is lost and the measure stays valid.
 */
export function deleteBeat(song: Song, at: BeatAddress): Song {
  return editVoiceEvents(song, at, ({ events, index, length }) => {
    const removed = events[index];
    if (removed === undefined) {
      return undefined;
    }
    const remaining = [...events.slice(0, index), ...events.slice(index + 1)];
    const padding = Math.max(0, Math.min(eventsTicks(events), length) - eventsTicks(remaining));
    const padded = [...remaining, ...(restEvents(padding, removed.voice.duration) ?? [])];
    return { events: padded, tuplet: removed.voice.duration.tuplet };
  });
}
