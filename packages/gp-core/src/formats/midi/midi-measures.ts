// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader.SongAdjuster (LGPL-2.1): each measure completed with rests, its notes put on strings.
import { type VoiceEvent, distinctTuplets, gapRests, toBeats } from '../../edit/timeline';
import { durationTicks, measureTicks } from '../../model/defaults';
import type { Clef, Measure, MeasureHeader, Note } from '../../model/song';
import type { RawBeat, RawMeasures, RawNote } from './midi-quantize';
import { durationFromPrecise, toPreciseTime } from './precise-duration';

/** Voices per beat, as Guitar Pro 5 (and TuxGuitar's TGBeat) has; the import writes the first. */
const VOICE_COUNT = 2;

/** One beat's notes on strings, given the notes of the beat before (for ties). */
export type NotePlacer = (notes: readonly RawNote[], previous: readonly Note[]) => Note[];

export interface TrackMeasuresPlan {
  readonly headers: readonly MeasureHeader[];
  /** Key signature by header index. */
  readonly keySignatures: readonly number[];
  readonly clef: Clef;
  readonly placeNotes: NotePlacer;
}

function beatEnd(beat: RawBeat): number {
  return beat.start + durationTicks(beat.duration);
}

function restsFrom(start: number, durations: readonly VoiceEvent[]): RawBeat[] {
  let position = start;
  return durations.map((event) => {
    const rest: RawBeat = { start: position, duration: event.voice.duration, notes: [] };
    position += durationTicks(event.voice.duration);
    return rest;
  });
}

/**
 * autoCompleteSilences + fixVoiceLongShort: the beats laid from the bar line, then rests to the end of the measure
 * (the editor's rest filling, plain or in the measure's tuplets). When no rests can fill the time, the last beat lasts to
 * the end if one duration can, else it is removed and the filling tried again.
 */
export function completeMeasureBeats(beats: readonly RawBeat[], start: number, length: number): readonly RawBeat[] {
  const end = start + length;
  let current = beats;
  for (;;) {
    const last = current[current.length - 1];
    const filled = last === undefined ? start : beatEnd(last);
    const rests = gapRests(end - filled, distinctTuplets(current.map((beat) => beat.duration)));
    if (rests !== undefined) {
      return [...current, ...restsFrom(filled, rests)];
    }
    if (last === undefined) {
      return current;
    }
    const longer = durationFromPrecise(toPreciseTime(end - last.start));
    if (longer !== undefined) {
      return [...current.slice(0, -1), { ...last, duration: longer }];
    }
    current = current.slice(0, -1);
  }
}

/** A track's measures: every header's beats completed, notes placed beat after beat (a tie looks at the beat before). */
export function buildTrackMeasures(measures: RawMeasures, plan: TrackMeasuresPlan): Measure[] {
  let previous: readonly Note[] = [];
  return plan.headers.map((header, headerIndex): Measure => {
    const { numerator, denominator } = header.timeSignature;
    const beats = completeMeasureBeats(measures[headerIndex] ?? [], header.start, measureTicks(numerator, denominator));
    const events = beats.map((beat): VoiceEvent => {
      const notes = beat.notes.length === 0 ? [] : plan.placeNotes(beat.notes, previous);
      previous = notes;
      return { voice: { duration: beat.duration, notes, isEmpty: false, direction: 'none' } };
    });
    const voices = Array.from({ length: VOICE_COUNT }, (_, voiceIndex) => (voiceIndex === 0 ? events : []));
    return {
      headerIndex,
      clef: plan.clef,
      keySignature: plan.keySignatures[headerIndex] ?? 0,
      beats: toBeats(header.start, { voiceCount: VOICE_COUNT, voices }, []),
    };
  });
}
