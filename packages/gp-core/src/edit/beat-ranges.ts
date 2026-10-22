import type { Beat, Measure, Song, Track } from '../model/song';
import type { BeatAddress } from './addresses';
import { type PlacedEvent, type VoiceFlow, liftVoice, reflowVoice } from './bar-flow';
import { type BeatFragment, type BeatFragmentItem, fragmentItem, itemEvent, settleFragmentTies, untieFirst } from './beat-fragment';
import { type VoiceEvents, eventTicks, isFreeRest, measureGapRests } from './timeline';

/** A position in a voice: a bar, and ticks from its start. */
interface VoicePosition {
  readonly measureIndex: number;
  readonly offset: number;
}

/** An inclusive run of one voice: the events that start from `first` to `last`. */
interface VoiceRange {
  readonly flow: VoiceFlow;
  readonly first: VoicePosition;
  readonly last: VoicePosition;
}

function comparePositions(a: VoicePosition, b: VoicePosition): number {
  return a.measureIndex - b.measureIndex || a.offset - b.offset;
}

/** Where the addressed beat starts in its bar; undefined when the beat does not exist. */
function beatPosition(song: Song, at: BeatAddress): VoicePosition | undefined {
  const header = song.measureHeaders[at.measureIndex];
  const beat = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex];
  return header === undefined || beat === undefined ? undefined : { measureIndex: at.measureIndex, offset: beat.start - header.start };
}

/** True when the addressed beat has a slot for the addressed voice (it may be empty). */
function hasVoiceSlot(song: Song, at: BeatAddress): boolean {
  const beat = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex];
  return Number.isInteger(at.voiceIndex) && at.voiceIndex >= 0 && beat?.voices[at.voiceIndex] !== undefined;
}

/** The run from `from` to `to` (either order) in `from`'s track and voice; undefined when a beat is missing. */
function resolveRange(song: Song, from: BeatAddress, to: BeatAddress): VoiceRange | undefined {
  const a = hasVoiceSlot(song, from) ? beatPosition(song, from) : undefined;
  const b = beatPosition(song, { ...to, trackIndex: from.trackIndex });
  if (a === undefined || b === undefined) {
    return undefined;
  }
  const [first, last] = comparePositions(a, b) <= 0 ? [a, b] : [b, a];
  return { flow: { trackIndex: from.trackIndex, voiceIndex: from.voiceIndex, firstMeasureIndex: first.measureIndex }, first, last };
}

function positionOf(placed: PlacedEvent): VoicePosition {
  return { measureIndex: placed.measureIndex, offset: placed.offset };
}

function isInRange(placed: PlacedEvent, range: VoiceRange): boolean {
  const position = positionOf(placed);
  return comparePositions(position, range.first) >= 0 && comparePositions(position, range.last) <= 0;
}

function beatOf(track: Track, placed: PlacedEvent): Beat | undefined {
  return placed.event.beatIndex === undefined ? undefined : track.measures[placed.measureIndex]?.beats[placed.event.beatIndex];
}

/**
 * The beats from `from` to `to` (inclusive, either order, across bars) of `from`'s track and voice, as a fragment:
 * each event of the voice that starts in the run, rests included (time the voice leaves unused reads as rests), with
 * the stroke, pick stroke and text of its beat. A tie keeps only when it starts inside the run (a note tied over a bar
 * line into the run loses it). No items when a beat is missing.
 */
export function copyBeats(song: Song, from: BeatAddress, to: BeatAddress): BeatFragment {
  const track = song.tracks[from.trackIndex];
  const range = resolveRange(song, from, to);
  const placed = range === undefined ? undefined : liftVoice(song, range.flow, range.last.measureIndex);
  if (track === undefined || range === undefined || placed === undefined) {
    return { isPercussion: track?.isPercussion ?? false, items: [] };
  }
  const items = placed.filter((event) => isInRange(event, range)).map((event) => fragmentItem(event.event.voice, beatOf(track, event)));
  return { isPercussion: track.isPercussion, items: settleFragmentTies(items) };
}

/**
 * New song without the beats from `from` to `to` (as copyBeats picks them) in that voice: what followed moves earlier,
 * the voice is re-barred from the run's bar to the end (a note across a bar line becomes tied notes) and its end is
 * filled with rests. The note after the run loses its ties (they started inside the run). Other voices and tracks are
 * untouched. Same song when a beat is missing or the run holds nothing.
 */
export function deleteBeatsFlowing(song: Song, from: BeatAddress, to: BeatAddress): Song {
  const range = resolveRange(song, from, to);
  const placed = range === undefined ? undefined : liftVoice(song, range.flow);
  if (range === undefined || placed === undefined) {
    return song;
  }
  const before = placed.filter((event) => comparePositions(positionOf(event), range.first) < 0).map((event) => event.event);
  const after = placed.filter((event) => comparePositions(positionOf(event), range.last) > 0).map((event) => event.event);
  if (before.length + after.length === placed.length) {
    return song;
  }
  return reflowVoice(song, range.flow, [...before, ...untieFirst(after)]);
}

/** A voice's events cut at `offset` in its first bar: a free rest across it is cut in two; a note across it stays before. */
interface CutStream {
  readonly before: VoiceEvents;
  readonly after: VoiceEvents;
}

function cutAt(placed: readonly PlacedEvent[], offset: number, measure: Measure): CutStream {
  const firstBar = placed[0]?.measureIndex;
  const found = placed.findIndex((event) => event.measureIndex !== firstBar || event.offset + eventTicks(event.event) > offset);
  const index = found < 0 ? placed.length : found;
  const events = placed.map((event) => event.event);
  const across = placed[index];
  if (across === undefined || across.measureIndex !== firstBar || across.offset >= offset) {
    return { before: events.slice(0, index), after: events.slice(index) };
  }
  const lead = measureGapRests(measure, offset - across.offset);
  const tail = measureGapRests(measure, across.offset + eventTicks(across.event) - offset);
  if (!isFreeRest(across.event) || lead === undefined || tail === undefined) {
    return { before: events.slice(0, index + 1), after: events.slice(index + 1) };
  }
  return { before: [...events.slice(0, index), ...lead], after: [...tail, ...events.slice(index + 1)] };
}

/** The items without notes on strings the track lacks (an item left without notes is a rest). */
function onTrackStrings(items: readonly BeatFragmentItem[], stringCount: number): readonly BeatFragmentItem[] {
  return items.map((item) => (item.notes.every((note) => note.string <= stringCount) ? item : { ...item, notes: item.notes.filter((note) => note.string <= stringCount) }));
}

/**
 * New song with the fragment inserted before the beat at `at` in that voice (inside a rest of an emptier voice, at the
 * beat's time; after a note the position falls in). What followed moves later and the voice is re-barred as in
 * deleteBeatsFlowing; when it runs past the last bar, bars are appended (every track gets rests, headers copy the last
 * one) — but what runs past the end as rests only is dropped. The fragment's first item and the beat it lands before
 * lose their ties. Notes on strings the track lacks are left out. Same song for an empty fragment, a missing beat, or
 * drum beats into a track that is not a drum track (and the other way round).
 */
export function insertBeatsFlowing(song: Song, at: BeatAddress, fragment: BeatFragment): Song {
  const track = song.tracks[at.trackIndex];
  const position = hasVoiceSlot(song, at) ? beatPosition(song, at) : undefined;
  const measure = track?.measures[at.measureIndex];
  if (track === undefined || position === undefined || measure === undefined || fragment.items.length === 0 || fragment.isPercussion !== track.isPercussion) {
    return song;
  }
  const flow: VoiceFlow = { trackIndex: at.trackIndex, voiceIndex: at.voiceIndex, firstMeasureIndex: at.measureIndex };
  const placed = liftVoice(song, flow);
  if (placed === undefined) {
    return song;
  }
  const { before, after } = cutAt(placed, position.offset, measure);
  const inserted = onTrackStrings(fragment.items, track.strings.length).map(itemEvent);
  return reflowVoice(song, flow, [...before, ...untieFirst(inserted), ...untieFirst(after)]);
}
