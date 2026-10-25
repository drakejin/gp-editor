import { headerTicks } from '../model/defaults';
import type { Measure, Song } from '../model/song';
import { insertMeasure } from './measures';
import { hasSameItems, updateTrack } from './song-paths';
import { splitAtBarLines } from './tied-pieces';
import {
  type VoiceEvent,
  type VoiceEvents,
  distinctTuplets,
  eventTicks,
  eventsTicks,
  gapRests,
  hasSameEvents,
  isFreeRest,
  measureGapRests,
  toBeats,
  toMeasureVoices,
} from './timeline';

/**
 * A voice seen as one stream of events flowing from bar to bar, for edits that move what follows across bar lines
 * (cut and paste): the stream is lifted out of its bars, changed, and laid back into bars of each time signature's
 * length.
 */

/** One voice of one track, from a bar to the end of the song. */
export interface VoiceFlow {
  readonly trackIndex: number;
  readonly voiceIndex: number;
  readonly firstMeasureIndex: number;
}

/** An event of the voice, with its bar and its offset in ticks from the bar's start. */
export interface PlacedEvent {
  readonly event: VoiceEvent;
  readonly measureIndex: number;
  readonly offset: number;
}

/** The voice's events of one bar, with rests for time it leaves unused up to the bar's end; undefined when unreadable. */
function barEvents(song: Song, flow: VoiceFlow, measureIndex: number): VoiceEvents | undefined {
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[flow.trackIndex]?.measures[measureIndex];
  const voices = header === undefined || measure === undefined ? undefined : toMeasureVoices(measure, header.start, flow.voiceIndex);
  if (header === undefined || measure === undefined || voices === undefined) {
    return undefined;
  }
  const events = voices.voices[flow.voiceIndex] ?? [];
  const padding = measureGapRests(measure, headerTicks(header) - eventsTicks(events));
  return padding === undefined ? undefined : [...events, ...padding];
}

/**
 * The voice's events from the flow's first bar to `lastMeasureIndex` (default: the last bar), each bar's time filled
 * (rests where the voice is silent or ends early). The beat marks go with the voice's event only where no other voice
 * plays (they stay with the beat). Undefined when a bar cannot be read as events.
 */
export function liftVoice(song: Song, flow: VoiceFlow, lastMeasureIndex = song.measureHeaders.length - 1): readonly PlacedEvent[] | undefined {
  const placed: PlacedEvent[] = [];
  for (let measureIndex = flow.firstMeasureIndex; measureIndex <= lastMeasureIndex; measureIndex++) {
    const events = barEvents(song, flow, measureIndex);
    if (events === undefined) {
      return undefined;
    }
    let offset = 0;
    for (const event of events) {
      placed.push({ event, measureIndex, offset });
      offset += eventTicks(event);
    }
  }
  return placed;
}

/** Shares of `ticks` starting with `room` left in bar `barIndex`, then as much of each later bar as needed. */
function barShares(ticks: number, room: number, barIndex: number, barLength: (index: number) => number): readonly number[] {
  const shares = [room];
  for (let left = ticks - room, index = barIndex + 1; left > 0; index++) {
    // At least a tick per bar, so a bar of no length cannot stall the loop.
    const share = Math.min(left, Math.max(1, barLength(index)));
    shares.push(share);
    left -= share;
  }
  return shares;
}

/**
 * The events laid into bars of `barLength(i)` ticks (bar 0 first): an event across a bar line is split into tied
 * pieces (splitAtBarLines); when a piece cannot be written it stays whole and over-fills its bar instead. Only the
 * bars the events reach are returned; the last may be part-filled.
 */
export function layoutBars(events: VoiceEvents, barLength: (index: number) => number): readonly (readonly VoiceEvent[])[] {
  const bars: VoiceEvent[][] = [[]];
  let position = 0;
  for (const event of events) {
    const barIndex = bars.length - 1;
    const room = barLength(barIndex) - position;
    const ticks = eventTicks(event);
    const pieces = ticks <= room ? [[event]] : (splitAtBarLines(event, barShares(ticks, room, barIndex, barLength)) ?? [[event]]);
    pieces.forEach((piece, index) => {
      if (index > 0) {
        bars.push([]);
        position = 0;
      }
      bars[bars.length - 1]?.push(...piece);
      position += eventsTicks(piece);
    });
    if (position >= barLength(bars.length - 1)) {
      bars.push([]);
      position = 0;
    }
  }
  return bars[bars.length - 1]?.length === 0 ? bars.slice(0, -1) : bars;
}

/** The bar's events followed by rests up to its length (left short when the gap cannot be written as rests). */
function fillBar(events: VoiceEvents, length: number): VoiceEvents {
  const rests = gapRests(length - eventsTicks(events), distinctTuplets(events.map((event) => event.voice.duration))) ?? [];
  return rests.length === 0 ? events : [...events, ...rests];
}

/**
 * The measure with the flow's voice replaced by `events` (filled with rests to the bar's end). The measure itself when
 * nothing changes, or when the voice had nothing there and still holds only rests; undefined when unreadable.
 */
function rewriteBar(song: Song, flow: VoiceFlow, measureIndex: number, events: VoiceEvents): Measure | undefined {
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[flow.trackIndex]?.measures[measureIndex];
  const voices = header === undefined || measure === undefined ? undefined : toMeasureVoices(measure, header.start, flow.voiceIndex);
  if (header === undefined || measure === undefined || voices === undefined) {
    return undefined;
  }
  const current = voices.voices[flow.voiceIndex] ?? [];
  const next = fillBar(events, headerTicks(header));
  if ((current.length === 0 && next.every(isFreeRest)) || hasSameEvents(next, current)) {
    return measure;
  }
  const voiceCount = Math.max(voices.voiceCount, flow.voiceIndex + 1);
  const all = Array.from({ length: voiceCount }, (_, index) => (index === flow.voiceIndex ? next : (voices.voices[index] ?? [])));
  const beats = toBeats(header.start, { voiceCount, voices: all }, measure.beats);
  return hasSameItems(beats, measure.beats) ? measure : { ...measure, beats };
}

/** The song with the flow's voice laid out as `bars` from its first bar on; bars past them hold rests. */
function writeBars(song: Song, flow: VoiceFlow, bars: readonly VoiceEvents[]): Song | undefined {
  const measures = song.tracks[flow.trackIndex]?.measures ?? [];
  const rewritten = measures.map((measure, index) =>
    index < flow.firstMeasureIndex ? measure : rewriteBar(song, flow, index, bars[index - flow.firstMeasureIndex] ?? []),
  );
  if (!rewritten.every((measure): measure is Measure => measure !== undefined)) {
    return undefined;
  }
  return updateTrack(song, flow.trackIndex, (track) => (hasSameItems(rewritten, track.measures) ? track : { ...track, measures: rewritten }));
}

function withoutTrailingFreeRests(events: VoiceEvents): VoiceEvents {
  const lastKept = events.reduce((last, event, index) => (isFreeRest(event) ? last : index), -1);
  return events.slice(0, lastKept + 1);
}

/** Length of bar `measureIndex`; bars past the end are as long as the last one. */
function barTicks(song: Song, measureIndex: number): number {
  const header = song.measureHeaders[measureIndex] ?? song.measureHeaders[song.measureHeaders.length - 1];
  return header === undefined ? 0 : headerTicks(header);
}

/** The song with `count` bars added at the end (insertMeasure: the last bar's header, clef and key; rests in every track). */
function appendBars(song: Song, count: number): Song {
  return Array.from({ length: Math.max(0, count) }).reduce<Song>((current) => insertMeasure(current, current.measureHeaders.length - 1, 'after'), song);
}

/**
 * The song with the flow's voice re-barred from its first bar to the end: `stream` is laid into bars of each time
 * signature's length (a note across a bar line becomes tied notes), the voice's end is filled with rests, and bars are
 * appended when the stream runs past the last bar — except for rests only, which are dropped. Other voices and tracks
 * keep their events. The same song when a bar cannot be read as events.
 */
export function reflowVoice(song: Song, flow: VoiceFlow, stream: VoiceEvents): Song {
  const bars = layoutBars(withoutTrailingFreeRests(stream), (index) => barTicks(song, flow.firstMeasureIndex + index));
  const extended = appendBars(song, flow.firstMeasureIndex + bars.length - song.measureHeaders.length);
  return writeBars(extended, flow, bars) ?? song;
}
