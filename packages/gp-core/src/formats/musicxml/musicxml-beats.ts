// A MusicXML part's measure as the model's beats (no TuxGuitar reader exists): one beat per position any voice starts at.
import { restDurations } from '../../edit/rests';
import { NO_STROKE, QUARTER, durationTicks, measureTicks } from '../../model/defaults';
import type { Beat, MeasureHeader, Stroke, StrokeDirection, Voice } from '../../model/song';
import type { Timed } from './musicxml-measures';
import type { RawNote } from './musicxml-note';
import { type Neck, type PlacedNote, placeBeat } from './musicxml-placement';
import type { VoiceEventDraft } from './musicxml-voices';

const EMPTY_VOICE: Voice = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' };

/** What a measure's beats are built from, and the strings each voice played before it (ties cross bar lines). */
export interface MeasureSource {
  readonly header: MeasureHeader;
  readonly voices: readonly (readonly VoiceEventDraft[])[];
  readonly texts: readonly Timed<string>[];
  readonly previous: readonly (readonly PlacedNote[])[];
}

export interface BuiltBeats {
  readonly beats: readonly Beat[];
  /** What each voice played last, for the next measure's ties. */
  readonly previous: readonly (readonly PlacedNote[])[];
}

function pickStrokeOf(events: readonly (VoiceEventDraft | undefined)[]): StrokeDirection {
  const notes = events.flatMap((event) => event?.notes ?? []);
  return notes.map((note: RawNote) => note.marks.pickStroke).find((direction) => direction !== 'none') ?? 'none';
}

/** MusicXML gives an arpeggio no speed: a stroke of the beat's notes takes a sixteenth. */
const STROKE_VALUE = 16;

function strokeOf(events: readonly (VoiceEventDraft | undefined)[]): Stroke {
  const direction = events.flatMap((event) => event?.notes ?? []).map((note) => note.marks.stroke).find((value) => value !== 'none');
  return direction === undefined ? NO_STROKE : { direction, value: STROKE_VALUE };
}

/** Texts at or after the previous beat's position up to this one go to this beat (a text between two beats goes to the later). */
function textAt(texts: readonly Timed<string>[], after: number, tick: number): string | undefined {
  const words = texts.filter((text) => text.tick > after && text.tick <= tick).map((text) => text.value);
  return words.length === 0 ? undefined : words.join(' ');
}

/** A measure where no voice has anything: rests over its length in the first voice. */
function restBeats(header: MeasureHeader, voiceCount: number): Beat[] {
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  let start = header.start;
  return (restDurations(length) ?? [QUARTER]).map((duration) => {
    const voices = Array.from({ length: voiceCount }, (_, index): Voice => (index === 0 ? { duration, notes: [], isEmpty: false, direction: 'none' } : EMPTY_VOICE));
    const beat: Beat = { start, voices, stroke: NO_STROKE, pickStroke: 'none' };
    start += durationTicks(duration);
    return beat;
  });
}

/** The measure's beats: each position some voice starts at, every voice's notes there placed together on the strings. */
export function buildBeats(source: MeasureSource, neck: Neck): BuiltBeats {
  const { header, voices } = source;
  const ticks = [...new Set(voices.flatMap((events) => events.map((event) => event.tick)))].sort((a, b) => a - b);
  if (ticks.length === 0) {
    return { beats: restBeats(header, voices.length), previous: source.previous };
  }
  let previous = source.previous;
  const beats = ticks.map((tick, index) => {
    const events = voices.map((voiceEvents) => voiceEvents.find((event) => event.tick === tick));
    const placed = placeBeat({ events, previous }, neck);
    previous = previous.map((before, voiceIndex) => (events[voiceIndex] === undefined ? before : (placed.placed[voiceIndex] ?? [])));
    const beatVoices = events.map((event, voiceIndex): Voice =>
      event === undefined ? EMPTY_VOICE : { duration: event.duration, notes: placed.notes[voiceIndex] ?? [], isEmpty: false, direction: 'none' },
    );
    const text = textAt(source.texts, index === 0 ? -1 : (ticks[index - 1] ?? -1), tick);
    const beat: Beat = { start: header.start + tick, voices: beatVoices, stroke: strokeOf(events), pickStroke: pickStrokeOf(events), ...(text === undefined ? {} : { text }) };
    return beat;
  });
  return { beats, previous };
}
