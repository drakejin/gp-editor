// A note typed into an empty voice, after TuxGuitar's TGMeasureManager.addNote and autoCompleteSilences (LGPL-2.1).
import { durationTicks } from '../model/defaults';
import type { Measure, Note, Song } from '../model/song';
import { type BeatAddress, locateVoice } from './addresses';
import { headerTicks } from './relayout';
import { replaceAt, updateMeasure } from './song-paths';
import { type VoiceEvent, type VoiceEvents, eventTicks, eventsTicks, isFreeRest, measureGapRests, toBeats, toMeasureVoices } from './timeline';
import { takeRestsAfter, trimTrailingRests } from './voice-fit';

/** A voice's events around a position: those that end by it, and those from it on. */
interface Split {
  readonly before: VoiceEvents;
  readonly after: VoiceEvents;
}

/**
 * The voice's events split at `offset` ticks from the measure start. A free rest across the offset is cut in two, and
 * time the voice leaves unused before it becomes rests. Undefined when another event lies across or at the offset, or
 * the time cannot be written as rests.
 */
function splitAt(events: VoiceEvents, offset: number, measure: Measure): Split | undefined {
  let position = 0;
  for (const [index, event] of events.entries()) {
    const end = position + eventTicks(event);
    if (end > offset) {
      const lead = measureGapRests(measure, offset - position);
      const tail = measureGapRests(measure, end - offset);
      if (!isFreeRest(event) || lead === undefined || tail === undefined) {
        return undefined;
      }
      return { before: [...events.slice(0, index), ...lead], after: [...tail, ...events.slice(index + 1)] };
    }
    position = end;
  }
  const gap = measureGapRests(measure, offset - position);
  return gap === undefined ? undefined : { before: [...events, ...gap], after: [] };
}

/**
 * New song where the empty voice at `at` plays `note` for as long as the beat lasts (the duration of the beat's first
 * played voice), and is filled with rests wherever it has nothing, from the bar line to the note and from the note to
 * the bar line, so it stays a whole timeline. Free rests of the voice under the new note are taken over; a later note
 * of the voice moves right only if it must. Same song when the voice is not empty there, or the position lies inside
 * another event of that voice.
 */
export function fillEmptyVoice(song: Song, at: BeatAddress, note: Note): Song {
  const location = locateVoice(song, at);
  const duration = location?.beat.voices.find((voice) => !voice.isEmpty)?.duration;
  if (location === undefined || !location.voice.isEmpty || duration === undefined) {
    return song;
  }
  const { header, measure, beat, voice } = location;
  const measureVoices = toMeasureVoices(measure, header.start, at.voiceIndex);
  const events = measureVoices?.voices[at.voiceIndex];
  const split = events === undefined ? undefined : splitAt(events, beat.start - header.start, measure);
  if (measureVoices === undefined || split === undefined) {
    return song;
  }
  const event: VoiceEvent = { voice: { ...voice, duration, notes: [note], isEmpty: false } };
  const placed = takeRestsAfter([...split.before, event, ...split.after], split.before.length, durationTicks(duration), duration);
  if (placed === undefined) {
    return song;
  }
  const length = headerTicks(header);
  const filled = [...placed, ...(measureGapRests(measure, length - eventsTicks(placed)) ?? [])];
  const voices = replaceAt(measureVoices.voices, at.voiceIndex, trimTrailingRests(filled, length, duration.tuplet));
  const beats = toBeats(header.start, { ...measureVoices, voices }, measure.beats);
  return updateMeasure(song, at.trackIndex, at.measureIndex, (current) => ({ ...current, beats }));
}
