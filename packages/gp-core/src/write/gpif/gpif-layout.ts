// How a measure's voices become GPIF voices (no TuxGuitar counterpart): the inverse of the reader's voice layout.
import { MAX_VOICES } from '../../formats/gpif/gpif-measure';
import { durationTicks, measureTicks, NORMAL_TUPLET, NOTE_VALUES } from '../../model/defaults';
import type { Beat, Duration, Measure, MeasureHeader, Note, Track, Voice } from '../../model/song';

/** A model beat's voice, written as one GPIF beat. `beatIndex` is the beat's index in `Measure.beats`. */
export interface WrittenBeat {
  readonly kind: 'beat';
  readonly beatIndex: number;
  readonly beat: Beat;
  readonly voice: Voice;
}

/** A rest filling a gap between two beats of a voice (GPIF voices have no gaps). */
export interface FillerRest {
  readonly kind: 'rest';
  readonly duration: Duration;
}

export type VoiceItem = WrittenBeat | FillerRest;

/** Durations a gap is filled with, longest first: plain and dotted notes, and triplets. */
const FILLER_DURATIONS: readonly Duration[] = NOTE_VALUES.flatMap((value) => [
  { value, dotted: true, doubleDotted: false, tuplet: NORMAL_TUPLET },
  { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET },
  { value, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } },
]).sort((a, b) => durationTicks(b) - durationTicks(a));

/** Rests that fill `ticks`, longest first; a remainder shorter than a 64th triplet is left out. */
export function restDurations(ticks: number): readonly Duration[] {
  const rests: Duration[] = [];
  let remaining = ticks;
  for (const duration of FILLER_DURATIONS) {
    const length = durationTicks(duration);
    while (remaining >= length) {
      rests.push(duration);
      remaining -= length;
    }
  }
  return rests;
}

function isWritten(voice: Voice | undefined): voice is Voice {
  return voice !== undefined && !voice.isEmpty;
}

function sortedBeats(measure: Measure): readonly { readonly beat: Beat; readonly beatIndex: number }[] {
  return measure.beats.map((beat, beatIndex) => ({ beat, beatIndex })).sort((a, b) => a.beat.start - b.beat.start || a.beatIndex - b.beatIndex);
}

/**
 * Where measure 1's voices start: the reader lays an incomplete first measure out against its end (an anacrusis), so a
 * first measure whose beats start after the bar line is written from its first beat and the reader moves it back.
 */
export function leadingShiftOf(measure: Measure, header: MeasureHeader): number {
  const starts = measure.beats.filter((beat) => beat.voices.slice(0, MAX_VOICES).some(isWritten)).map((beat) => beat.start);
  return starts.length === 0 ? 0 : Math.max(0, Math.min(...starts) - header.start);
}

/** Ticks a measure's voices take from their first beat to their last end (0 when it has no beats). */
function usedTicksOf(measure: Measure): number {
  let first = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const beat of measure.beats) {
    for (const voice of beat.voices.slice(0, MAX_VOICES).filter(isWritten)) {
      first = Math.min(first, beat.start);
      end = Math.max(end, beat.start + durationTicks(voice.duration));
    }
  }
  return end > first ? end - first : 0;
}

/** Whether measure 1 is an anacrusis: some track has beats in it, and none fills the bar. */
export function isAnacrusis(tracks: readonly Track[], header: MeasureHeader | undefined): boolean {
  if (header === undefined) {
    return false;
  }
  const used = tracks.map((track) => (track.measures[0] === undefined ? 0 : usedTicksOf(track.measures[0])));
  return Math.max(0, ...used) > 0 && Math.max(...used) < measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
}

/**
 * The GPIF beats of voice `voiceIndex` of a measure, in time order, starting at the bar line plus `leadingShift`. A gap
 * before a beat is filled with rests so that the reader puts the beat back where it was.
 */
export function voiceItems(measure: Measure, header: MeasureHeader, voiceIndex: number, leadingShift: number): readonly VoiceItem[] {
  const items: VoiceItem[] = [];
  let cursor = header.start + leadingShift;
  for (const { beat, beatIndex } of sortedBeats(measure)) {
    const voice = beat.voices[voiceIndex];
    if (!isWritten(voice)) {
      continue;
    }
    if (beat.start > cursor) {
      items.push(...restDurations(beat.start - cursor).map((duration): FillerRest => ({ kind: 'rest', duration })));
    }
    items.push({ kind: 'beat', beatIndex, beat, voice });
    cursor = Math.max(cursor, beat.start) + durationTicks(voice.duration);
  }
  return items;
}

/** A note's place in a track: measure, beat (index in `Measure.beats`), voice and note index. */
export function noteKey(measureIndex: number, beatIndex: number, voiceIndex: number, noteIndex: number): string {
  return `${measureIndex}/${beatIndex}/${voiceIndex}/${noteIndex}`;
}

/** Links between consecutive notes on a string of a voice, which Guitar Pro marks on both notes. */
export interface NoteLinks {
  /** Notes the next note on their string is tied to (`<Tie origin="true">`). */
  readonly tieOrigins: ReadonlySet<string>;
  /** Notes a hammer-on or pull-off leads to (`HopoDestination`). */
  readonly hopoDestinations: ReadonlySet<string>;
}

interface LastNote {
  readonly key: string;
  readonly note: Note;
}

/** Tie origins and hammer-on destinations of a track: per voice and string, each note is linked to the one before it. */
export function noteLinksOf(track: Track): NoteLinks {
  const tieOrigins = new Set<string>();
  const hopoDestinations = new Set<string>();
  for (let voiceIndex = 0; voiceIndex < MAX_VOICES; voiceIndex++) {
    const last = new Map<number, LastNote>();
    track.measures.forEach((measure, measureIndex) => {
      for (const { beat, beatIndex } of sortedBeats(measure)) {
        beat.voices[voiceIndex]?.notes.forEach((note, noteIndex) => {
          const key = noteKey(measureIndex, beatIndex, voiceIndex, noteIndex);
          const previous = last.get(note.string);
          if (previous !== undefined && note.isTied) {
            tieOrigins.add(previous.key);
          }
          if (previous?.note.effect.hammer === true) {
            hopoDestinations.add(key);
          }
          last.set(note.string, { key, note });
        });
      }
    });
  }
  return { tieOrigins, hopoDestinations };
}
