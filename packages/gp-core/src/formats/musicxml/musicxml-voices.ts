// MusicXML voices as the model's voices (no TuxGuitar reader exists): notes grouped by voice and position, gaps filled with rests.
import { restDurations } from '../../edit/rests';
import { durationTicks } from '../../model/defaults';
import type { Duration } from '../../model/song';
import { type RawNote, durationOfTicks } from './musicxml-note';

/** Guitar Pro 6+ voices per beat (GPIF's MAX_VOICES): more MusicXML voices than that are left out. */
export const MAX_VOICES = 4;

/** One voice's event: what starts at `tick`, with the grace notes written before it. */
export interface VoiceEventDraft {
  readonly tick: number;
  readonly duration: Duration;
  /** Sounding notes; none for a rest. */
  readonly notes: readonly RawNote[];
  readonly graces: readonly RawNote[];
}

function voiceKey(note: RawNote): string {
  return `${note.staff}/${note.voice}`;
}

function compareKeys(a: string, b: string): number {
  const [staffA, voiceA = ''] = a.split('/');
  const [staffB, voiceB = ''] = b.split('/');
  return Number(staffA) - Number(staffB) || Number(voiceA) - Number(voiceB) || voiceA.localeCompare(voiceB);
}

/**
 * The voice index of every staff/voice the notes use: on one staff, voices 1–4 keep their number (as Guitar Pro and
 * TuxGuitar write them); otherwise the first four in staff and voice order.
 */
export function resolveVoiceIndexes(notes: readonly RawNote[]): ReadonlyMap<string, number> {
  const keys = [...new Set(notes.map(voiceKey))].sort(compareKeys);
  const staves = new Set(notes.map((note) => note.staff));
  const numbers = keys.map((key) => Number(key.split('/')[1]));
  if (staves.size === 1 && numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= MAX_VOICES)) {
    return new Map(keys.map((key, index) => [key, (numbers[index] ?? 1) - 1]));
  }
  return new Map(keys.slice(0, MAX_VOICES).map((key, index) => [key, index]));
}

/** Rests that fill `ticks` exactly, else as much of it as plain durations can. */
function restsFor(start: number, ticks: number): VoiceEventDraft[] {
  const exact = restDurations(ticks);
  const durations: Duration[] = exact === undefined ? [] : [...exact];
  if (exact === undefined) {
    let left = ticks;
    while (left > 0) {
      const duration = durationOfTicks(left);
      const length = durationTicks(duration);
      if (length > left || length <= 0) {
        break;
      }
      durations.push(duration);
      left -= length;
    }
  }
  let tick = start;
  return durations.map((duration) => {
    const rest: VoiceEventDraft = { tick, duration, notes: [], graces: [] };
    tick += durationTicks(duration);
    return rest;
  });
}

/** Rests where a voice has nothing: before its first event, and after an event that ends (by its written duration) before the next. */
function withGapsFilled(events: readonly VoiceEventDraft[]): VoiceEventDraft[] {
  let end = 0;
  return events.flatMap((event) => {
    const filled = event.tick > end ? [...restsFor(end, event.tick - end), event] : [event];
    end = Math.max(end, event.tick + durationTicks(event.duration));
    return filled;
  });
}

/** A note at the position of an event of its voice joins it (a chord); a note there wins over a rest. */
function mergeAtSameTick(event: VoiceEventDraft, note: RawNote): VoiceEventDraft {
  if (note.isRest) {
    return event;
  }
  if (event.notes.length === 0) {
    return { ...event, duration: note.duration ?? durationOfTicks(note.ticks), notes: [note] };
  }
  return { ...event, notes: [...event.notes, note] };
}

/** The events of one voice: notes at the same position are one event (a chord); grace notes go with the next event. */
function voiceEvents(notes: readonly RawNote[]): VoiceEventDraft[] {
  const events: VoiceEventDraft[] = [];
  let graces: RawNote[] = [];
  for (const note of [...notes].sort((a, b) => a.tick - b.tick)) {
    if (note.grace !== undefined) {
      graces.push(note);
      continue;
    }
    const last = events[events.length - 1];
    if (last !== undefined && last.tick === note.tick) {
      events[events.length - 1] = { ...mergeAtSameTick(last, note), graces: [...last.graces, ...graces] };
      graces = [];
      continue;
    }
    if (note.ticks <= 0 && note.duration === undefined) {
      continue;
    }
    const duration = note.duration ?? durationOfTicks(note.ticks);
    events.push({ tick: note.tick, duration, notes: note.isRest ? [] : [note], graces });
    graces = [];
  }
  return events;
}

/** The measure's events of each voice index (`count` of them), gaps before and between events filled with rests. */
export function measureVoices(notes: readonly RawNote[], indexes: ReadonlyMap<string, number>, count: number): readonly (readonly VoiceEventDraft[])[] {
  return Array.from({ length: count }, (_, voiceIndex) => {
    const own = notes.filter((note) => indexes.get(voiceKey(note)) === voiceIndex);
    return withGapsFilled(voiceEvents(own));
  });
}
