// Guitar Pro 8's single track paste (no TuxGuitar counterpart). Its guide (Copy, Paste and Cut): "Since this mode
// focuses on a single track, it does not account for bar structures, such as time signatures or key signatures"; the
// simple paste "completes the current bar with the clipboard content", and "When the cursor is on an empty bar, pasting
// first fills the empty bars". Its "additional bars are added before the bar where the paste is performed" belongs to the
// multitrack copy, which copies whole bars of every track (the app has none): a paste here writes over the cursor's track
// only, so it never moves one track against the others, and bars are added only past the song's end.
import type { Song } from '../model/song';
import type { BeatAddress } from './addresses';
import type { DurationTuplets } from '../model/defaults';
import { type VoiceFlow, barEvents, barTicks, liftVoice, rewriteVoice } from './bar-flow';
import { type BeatFragment, itemEvent, untieFirst } from './beat-fragment';
import { type VoicePosition, beatPosition, cutAt, hasVoiceSlot, onTrackStrings, runEvents } from './beat-ranges';
import { updateNote } from './song-paths';
import { type VoiceEvent, type VoiceEvents, distinctTuplets, eventTicks, eventsTicks, isFreeRest, mixedGapRests, restEvent, signedRests } from './timeline';

/** A paste's outcome. */
export interface PastedBeats {
  readonly song: Song;
  /** Bars added at the end of the song (rests in the other tracks) for what ran past its last bar. */
  readonly addedBars: number;
  /** Where the pasted beats start. */
  readonly at: BeatAddress;
  /** The last bar the pasted beats reach (`at`'s bar for a paste within it). */
  readonly lastMeasureIndex: number;
}

/** How much of a stream each bar takes, by bar index. */
type BarRoom = (measureIndex: number) => number;

/**
 * The room of each bar in the flow's voice as it is: its time signature's length, or the voice's own where it over-fills
 * the bar (a cut leaves every bar as long as it was, so nothing after it moves); read once per bar.
 */
function voiceBarRoom(song: Song, flow: VoiceFlow): BarRoom {
  const rooms = new Map<number, number>();
  return (measureIndex) => {
    const known = rooms.get(measureIndex);
    if (known !== undefined) {
      return known;
    }
    const placed = measureIndex < song.measureHeaders.length ? liftVoice(song, { ...flow, firstMeasureIndex: measureIndex }, measureIndex) : undefined;
    const room = Math.max(barTicks(song, measureIndex), eventsTicks((placed ?? []).map((each) => each.event)));
    rooms.set(measureIndex, room);
    return room;
  };
}

/**
 * A paste's rooms: each bar takes its time signature's length, so a bar the paste writes over is written whole — an
 * over-full one too, whose extra time the paste's own beats then fill, never shifting the bars after it —; the first
 * bar keeps its own length when the paste starts past its bar line (in its over-full part).
 */
function pasteBarRoom(song: Song, flow: VoiceFlow, start: number): BarRoom {
  const own = voiceBarRoom(song, flow);
  return (measureIndex) => (measureIndex === flow.firstMeasureIndex && start >= barTicks(song, measureIndex) ? own(measureIndex) : barTicks(song, measureIndex));
}

/** Where `ticks` of stream from `start` in bar `firstIndex` end: the bar and the offset in it (at most its room). */
function endOf(room: BarRoom, firstIndex: number, start: number, ticks: number): VoicePosition {
  let measureIndex = firstIndex;
  let offset = start;
  let left = ticks;
  // At least a tick per bar, so a bar of no length cannot stall the loop.
  while (left > Math.max(1, room(measureIndex)) - offset) {
    left -= Math.max(1, room(measureIndex)) - offset;
    measureIndex += 1;
    offset = 0;
  }
  return { measureIndex, offset: offset + left };
}

/**
 * Rests for the `ticks` left of `event` after a paste's end: in any tuplet of the event or the paste (two of them mixed
 * if need be, mixedGapRests); when none can write that time, a rest of the event's own length, which over-fills the bar
 * a little rather than leaving it unreadable. Under the event's octave sign.
 */
function restOfEvent(event: VoiceEvent, ticks: number, tuplets: readonly DurationTuplets[]): VoiceEvents {
  const rests = mixedGapRests(ticks, distinctTuplets([event.voice.duration, ...tuplets]));
  return signedRests(rests ?? [restEvent(event.voice.duration)], event);
}

/**
 * The flow's voice in bar `measureIndex` from `offset` on (nothing past the song's end): an event across that point
 * leaves the rest of its time as rests (restOfEvent). Undefined when the bar cannot be read as events.
 */
function eventsFrom(song: Song, flow: VoiceFlow, at: VoicePosition, tuplets: readonly DurationTuplets[]): VoiceEvents | undefined {
  const events = at.measureIndex < song.measureHeaders.length ? barEvents(song, flow, at.measureIndex) : [];
  if (events === undefined) {
    return undefined;
  }
  let position = 0;
  for (const [index, event] of events.entries()) {
    const end = position + eventTicks(event);
    if (end > at.offset) {
      return position >= at.offset ? events.slice(index) : [...restOfEvent(event, end - at.offset, tuplets), ...events.slice(index + 1)];
    }
    position = end;
  }
  return [];
}

/** The voice's first beat with notes that starts at `tick` or later (from the flow's first bar on); undefined when none. */
function firstNotesFrom(song: Song, flow: VoiceFlow, tick: number): BeatAddress | undefined {
  const measures = song.tracks[flow.trackIndex]?.measures ?? [];
  for (let measureIndex = flow.firstMeasureIndex; measureIndex < measures.length; measureIndex++) {
    const beatIndex = measures[measureIndex]?.beats.findIndex((beat) => beat.start >= tick && (beat.voices[flow.voiceIndex]?.notes.length ?? 0) > 0) ?? -1;
    if (beatIndex >= 0) {
      return { trackIndex: flow.trackIndex, voiceIndex: flow.voiceIndex, measureIndex, beatIndex };
    }
  }
  return undefined;
}

/** The voice's first note after the written events untied: what it was tied to was written over. */
function untieAfter(song: Song, flow: VoiceFlow, tick: number): Song {
  const next = firstNotesFrom(song, flow, tick);
  const notes = next === undefined ? [] : (song.tracks[flow.trackIndex]?.measures[next.measureIndex]?.beats[next.beatIndex]?.voices[flow.voiceIndex]?.notes ?? []);
  return next === undefined ? song : notes.filter((note) => note.isTied).reduce((current, note) => updateNote(current, { ...next, string: note.string }, (tiedNote) => ({ ...tiedNote, isTied: false })), song);
}

/** Events written over a voice: the song, the song tick the first one starts at, and the last bar they reach. */
interface Written {
  readonly song: Song;
  readonly start: number;
  readonly lastMeasureIndex: number;
}

/**
 * `inserted` written over the flow's voice from `offset` in its first bar (a note held across that point stays, and the
 * events go in after it), each bar taking as much as `roomOf` gives it (from where the events start in the first bar):
 * what played in their time is replaced — a free rest across their end cut, a note across it leaving the rest of its
 * time as rests —, what follows in the bar they end in stays in place, bars are appended for what runs past the song's
 * end. The same song when nothing changes; undefined when the voice cannot be read there.
 */
function writeEvents(song: Song, flow: VoiceFlow, offset: number, inserted: VoiceEvents, roomOf: (start: number) => BarRoom): Written | undefined {
  const measure = song.tracks[flow.trackIndex]?.measures[flow.firstMeasureIndex];
  const firstBar = liftVoice(song, flow, flow.firstMeasureIndex);
  if (measure === undefined || firstBar === undefined) {
    return undefined;
  }
  const before = cutAt(firstBar, offset, measure).before;
  const start = eventsTicks(before);
  const room = roomOf(start);
  const end = endOf(room, flow.firstMeasureIndex, start, eventsTicks(inserted));
  const kept = eventsFrom(song, flow, end, inserted.map((event) => event.voice.duration));
  if (kept === undefined) {
    return undefined;
  }
  const lastIndex = Math.min(end.measureIndex, song.measureHeaders.length - 1);
  // The bar the events end in keeps what follows them there, over-full or not.
  const layoutRoom: BarRoom = (measureIndex) => (measureIndex === end.measureIndex ? Math.max(room(measureIndex), end.offset + eventsTicks(kept)) : room(measureIndex));
  const written = rewriteVoice(song, flow, [...before, ...inserted, ...kept], lastIndex, layoutRoom);
  const endBar = song.measureHeaders[end.measureIndex];
  const untied = endBar === undefined ? written : untieAfter(written, flow, endBar.start + end.offset);
  const barStart = song.measureHeaders[flow.firstMeasureIndex]?.start ?? 0;
  return { song: untied, start: barStart + start, lastMeasureIndex: Math.min(end.measureIndex, untied.measureHeaders.length - 1) };
}

/** The beat of the voice's track that starts at song tick `tick`, from bar `measureIndex` on; `at` itself when none does. */
function beatStartingAt(song: Song, at: BeatAddress, tick: number): BeatAddress {
  const headers = song.measureHeaders;
  let measureIndex = at.measureIndex;
  while ((headers[measureIndex + 1]?.start ?? Number.POSITIVE_INFINITY) <= tick) {
    measureIndex += 1;
  }
  const beatIndex = song.tracks[at.trackIndex]?.measures[measureIndex]?.beats.findIndex((beat) => beat.start === tick) ?? -1;
  return beatIndex < 0 ? at : { ...at, measureIndex, beatIndex };
}

/**
 * Guitar Pro 8's single track paste of `fragment` at `at`, in that voice: written over the voice from the cursor for as
 * many bars as it needs (what played in its time is replaced — a free rest across its end cut, a note across it leaving
 * the rest of its time as rests —, an empty bar or voice filled, what follows stays in place, an over-full bar kept
 * over-full); nothing is inserted and no other track changes, but bars are appended (rests in every other track) for
 * what runs past the last bar. Notes on strings the track lacks are left out; the first pasted beat and the voice's
 * first note after the paste lose their ties. `at` answers the beat the pasted beats start on (in the next bar when a
 * note held across the cursor runs into it). The same song for an empty fragment, a missing beat, or drum beats into a
 * track that is not a drum track (and the other way round).
 */
export function pasteBeats(song: Song, at: BeatAddress, fragment: BeatFragment): PastedBeats {
  const unchanged: PastedBeats = { song, addedBars: 0, at, lastMeasureIndex: at.measureIndex };
  const track = song.tracks[at.trackIndex];
  const position = hasVoiceSlot(song, at) ? beatPosition(song, at) : undefined;
  if (track === undefined || position === undefined || fragment.items.length === 0 || fragment.isPercussion !== track.isPercussion) {
    return unchanged;
  }
  const flow: VoiceFlow = { trackIndex: at.trackIndex, voiceIndex: at.voiceIndex, firstMeasureIndex: at.measureIndex };
  const inserted = untieFirst(onTrackStrings(fragment.items, track.strings.length).map(itemEvent));
  const written = writeEvents(song, flow, position.offset, inserted, (start) => pasteBarRoom(song, flow, start));
  if (written === undefined || written.song === song) {
    return unchanged;
  }
  // Rests written before the paste into an empty voice can add beats before it: its first beat found by its start.
  const first = beatStartingAt(written.song, at, written.start);
  return { song: written.song, addedBars: written.song.measureHeaders.length - song.measureHeaders.length, at: first, lastMeasureIndex: written.lastMeasureIndex };
}

/**
 * ⌘X's edit, Guitar Pro 8's single track cut (as its copy, it "does not account for bar structures"): the events copyBeats
 * takes from `from` to `to` (inclusive, either order) of `from`'s track and voice replaced by rests of the same lengths —
 * their notes and beat marks go, an octave sign stays over the rests, nothing after them moves, no other track changes,
 * so pasting the copied beats back there gives the song back. The voice's first note after the run loses its ties. The
 * same song when a beat is missing or the run holds only rests.
 */
export function clearBeats(song: Song, from: BeatAddress, to: BeatAddress): Song {
  const run = runEvents(song, from, to) ?? [];
  const first = run[0];
  if (first === undefined || run.every((placed) => isFreeRest(placed.event))) {
    return song;
  }
  const flow: VoiceFlow = { trackIndex: from.trackIndex, voiceIndex: from.voiceIndex, firstMeasureIndex: first.measureIndex };
  const rests = run.flatMap(({ event }) => signedRests([restEvent(event.voice.duration)], event));
  return writeEvents(song, flow, first.offset, rests, () => voiceBarRoom(song, flow))?.song ?? song;
}
