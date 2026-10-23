import { type VoiceEvents, distinctTuplets, gapRests, toBeats } from '../edit/timeline';
import { durationTicks, measureTicks } from '../model/defaults';
import type { Clef, Duration, Measure, Note } from '../model/song';
import { type Neck, NO_COUNTS, type PlacedNote, type PlacementCounts, addCounts, buildBeatNotes } from './beat-notes';
import { toDuration } from './durations';
import type { PlannedMeasure } from './header-plan';
import type { TranscribedBeat } from './types';
import { countOf } from './wording';

/** Voices per beat, as Guitar Pro 5 files have; a track's first part in a measure is voice 1, its second voice 2. */
const VOICE_COUNT = 2;

/** A track's measures are built with its neck, clef and the label its bar warnings start with. */
export interface TrackLayout {
  readonly trackIndex: number;
  readonly neck: Neck;
  readonly clef: Clef;
  /** "Bar 3", or "Bar 3, Bass" when the song has several tracks. */
  readonly where: (barNumber: number) => string;
}

export interface TrackMeasures {
  readonly measures: readonly Measure[];
  readonly warnings: readonly string[];
}

/** A transcribed beat laid out in its voice: its duration and its offset from the measure start. */
interface PlannedEvent {
  readonly beat: TranscribedBeat;
  readonly duration: Duration;
  readonly offset: number;
}

/** What each voice played last: the notes of its last event, empty after a rest or a measure without it. */
type VoiceMemory = readonly (readonly PlacedNote[])[];

interface VoiceNotes {
  /** Notes of every event, voice by voice. */
  readonly notes: readonly (readonly (readonly Note[])[])[];
  readonly memory: VoiceMemory;
  readonly counts: PlacementCounts;
}

function planVoice(beats: readonly TranscribedBeat[]): readonly PlannedEvent[] {
  let offset = 0;
  return beats.map((beat) => {
    const duration = toDuration(beat);
    const event = { beat, duration, offset };
    offset += durationTicks(duration);
    return event;
  });
}

function voiceTicks(events: readonly PlannedEvent[]): number {
  return events.reduce((ticks, event) => ticks + durationTicks(event.duration), 0);
}

function isRest(beat: TranscribedBeat): boolean {
  return beat.rest === true || (beat.notes ?? []).length === 0;
}

/** Every voice's notes, beat by beat in time order, so a tie finds the event before it in its voice. */
function placeVoices(voices: readonly (readonly PlannedEvent[])[], neck: Neck, memory: VoiceMemory): VoiceNotes {
  const notes: (readonly Note[])[][] = voices.map((events) => events.map(() => []));
  const last: (readonly PlacedNote[])[] = voices.map((_, voiceIndex) => memory[voiceIndex] ?? []);
  let counts = NO_COUNTS;
  const offsets = [...new Set(voices.flatMap((events) => events.map((event) => event.offset)))].sort((a, b) => a - b);
  for (const offset of offsets) {
    const playing = voices.flatMap((events, voiceIndex) => {
      const eventIndex = events.findIndex((event) => event.offset === offset);
      const event = events[eventIndex];
      return event === undefined ? [] : [{ voiceIndex, eventIndex, notes: isRest(event.beat) ? [] : (event.beat.notes ?? []) }];
    });
    const placed = buildBeatNotes(playing.map((voice) => ({ notes: voice.notes, previous: last[voice.voiceIndex] ?? [] })), neck);
    playing.forEach(({ voiceIndex, eventIndex }, index) => {
      const voiceNotes = notes[voiceIndex];
      if (voiceNotes !== undefined) {
        voiceNotes[eventIndex] = placed.notes[index] ?? [];
      }
      last[voiceIndex] = placed.placed[index] ?? [];
    });
    counts = addCounts(counts, placed.counts);
  }
  return { notes, memory: last, counts };
}

/** Rests for `ticks`, plain or in a tuplet the voice uses; none when the time cannot be written as rests. */
function padRests(ticks: number, events: readonly PlannedEvent[]): VoiceEvents {
  return gapRests(ticks, distinctTuplets(events.map((event) => event.duration))) ?? [];
}

/** A voice's events, then rests to the end of the measure (the first voice always fills its measure). */
function toVoiceEvents(events: readonly PlannedEvent[], notes: readonly (readonly Note[])[], length: number, voiceIndex: number): VoiceEvents {
  const played = events.map((event, eventIndex) => ({ voice: { duration: event.duration, notes: notes[eventIndex] ?? [], isEmpty: false, direction: 'none' as const } }));
  const used = voiceTicks(events);
  const isPadded = used < length && (voiceIndex === 0 || events.length > 0);
  return isPadded ? [...played, ...padRests(length - used, events)] : played;
}

function measureWarnings(where: string, counts: PlacementCounts, extraParts: number, isOverfull: boolean): readonly string[] {
  return [
    ...(extraParts > 0 ? [`${where}: ${countOf(extraParts, 'part')} left out (a track holds two voices)`] : []),
    ...(isOverfull ? [`${where}: the beats run past the end of the bar`] : []),
    ...(counts.octaveMoved > 0 ? [`${where}: ${countOf(counts.octaveMoved, 'note')} moved an octave to fit the tuning`] : []),
    ...(counts.leftOut > 0 ? [`${where}: ${countOf(counts.leftOut, 'note')} left out (no free string)`] : []),
    ...(counts.unreadable > 0 ? [`${where}: ${countOf(counts.unreadable, 'note')} left out (unreadable pitch)`] : []),
  ];
}

interface MeasureBuild {
  readonly measure: Measure;
  readonly memory: VoiceMemory;
  readonly warnings: readonly string[];
}

function buildMeasure({ source, header, headerIndex, keySignature }: PlannedMeasure, layout: TrackLayout, memory: VoiceMemory): MeasureBuild {
  const parts = source.parts.filter((part) => part.track === layout.trackIndex);
  const voices = parts.slice(0, VOICE_COUNT).map((part) => planVoice(part.beats));
  const placed = placeVoices(voices, layout.neck, memory);
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const events = Array.from({ length: VOICE_COUNT }, (_, voiceIndex) => toVoiceEvents(voices[voiceIndex] ?? [], placed.notes[voiceIndex] ?? [], length, voiceIndex));
  const isOverfull = voices.some((voice) => voiceTicks(voice) > length);
  const beats = toBeats(header.start, { voiceCount: VOICE_COUNT, voices: events }, []);
  return {
    measure: { headerIndex, clef: layout.clef, keySignature, beats },
    memory: events.map((voiceEvents, voiceIndex) => (voiceEvents.length === (voices[voiceIndex]?.length ?? 0) ? (placed.memory[voiceIndex] ?? []) : [])),
    warnings: measureWarnings(layout.where(header.number), placed.counts, parts.length - voices.length, isOverfull),
  };
}

/**
 * One track's measures: in each measure the track's parts become its voices (beats laid end to end from the measure
 * start, a short voice padded with rests, a long one kept over-full), a measure without a part a measure of rests.
 * Notes go on strings beat by beat (buildBeatNotes), ties reaching back across the bar line.
 */
export function buildTrackMeasures(measures: readonly PlannedMeasure[], layout: TrackLayout): TrackMeasures {
  let memory: VoiceMemory = [];
  const built = measures.map((measure) => {
    const result = buildMeasure(measure, layout, memory);
    memory = result.memory;
    return result;
  });
  return { measures: built.map((result) => result.measure), warnings: built.flatMap((result) => result.warnings) };
}
