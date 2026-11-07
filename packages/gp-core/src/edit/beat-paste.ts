// Guitar Pro 8's single track paste (no TuxGuitar counterpart). Its guide (Copy, Paste and Cut): "Since this mode
// focuses on a single track, it does not account for bar structures, such as time signatures or key signatures"; the
// simple paste "completes the current bar with the clipboard content", and "When the cursor is on an empty bar, pasting
// first fills the empty bars". Its "additional bars are added before the bar where the paste is performed" belongs to the
// multitrack copy, which copies whole bars of every track (the app has none): a paste here writes over the cursor's track
// only, so it never moves one track against the others, and bars are added only past the song's end.
import type { Song } from '../model/song';
import { type BeatAddress, voiceOf } from './addresses';
import type { DurationTuplets } from '../model/defaults';
import { type VoiceFlow, barEvents, barTicks, layoutBars, liftVoice, rewriteVoice } from './bar-flow';
import { type BeatFragment, type FragmentLayout, itemEvent, untieFirst } from './beat-fragment';
import { type VoicePosition, beatPosition, cutAt, hasVoiceSlot, runEvents } from './beat-ranges';
import { type FittedFragment, fitFragment } from './paste-fit';
import { updateNote } from './song-paths';
import { type VoiceEvent, type VoiceEvents, distinctTuplets, eventTicks, eventsTicks, isFreeRest, mixedGapRests, restEvent, signedRests } from './timeline';

/** A paste's outcome: how the copied notes went onto the track (`mapping`, what moved by octaves or was left out) too. */
export interface PastedBeats extends Omit<FittedFragment, 'items'> {
  readonly song: Song;
  /** Bars added at the end of the song (rests in the other tracks) for what ran past its last bar. */
  readonly addedBars: number;
  /** Where the pasted beats start. */
  readonly at: BeatAddress;
  /** The last bar the pasted beats reach (`at`'s bar for a paste within it). */
  readonly lastMeasureIndex: number;
  /**
   * False when nothing could be written there (an empty fragment, a beat the track lacks, a bar its voice cannot be read
   * in). A paste that writes what is already there is a paste all the same: true, its song equal to the one it was.
   */
  readonly isPasted: boolean;
  /** The beat right after the pasted beats, where the next paste lays the next copy; absent when they end the song. */
  readonly next?: BeatAddress;
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
 * The copied run's own bar lengths (but its last bar's), when the paste starts where the run did in its bar and lands
 * on bars of the same time signatures: each copied over-full bar stays one bar. Undefined otherwise, or when the lengths
 * do not fit the run (`ticks` long: they come from the clipboard).
 */
function copiedBarLengths(song: Song, flow: VoiceFlow, start: number, ticks: number, layout: FragmentLayout | undefined): readonly number[] | undefined {
  const isFromStart = layout !== undefined && layout.offset === start && start <= (layout.bars[0]?.length ?? 0);
  const spanned = isFromStart ? layout.bars.slice(0, -1) : [];
  const isAligned = spanned.length > 0 && spanned.every((bar, k) => bar.ticks === barTicks(song, flow.firstMeasureIndex + k) && bar.length >= bar.ticks);
  const lengths = spanned.map((bar) => bar.length);
  return isAligned && lengths.reduce((sum, length) => sum + length, 0) - start <= ticks ? lengths : undefined;
}

/**
 * A paste's rooms: each bar takes its time signature's length, so a bar the paste writes over is written whole — an
 * over-full one too, whose extra time the paste's own beats then fill, never shifting the bars after it —; the first
 * bar keeps its own length when the paste starts past its bar line (in its over-full part); a copied over-full bar
 * keeps its length when the paste lands as the copy lay (copiedBarLengths).
 */
function pasteBarRoom(song: Song, flow: VoiceFlow, start: number, copied: readonly number[] | undefined): BarRoom {
  const own = voiceBarRoom(song, flow);
  return (measureIndex) => {
    const length = copied?.[measureIndex - flow.firstMeasureIndex];
    if (length !== undefined) {
      return length;
    }
    return measureIndex === flow.firstMeasureIndex && start >= barTicks(song, measureIndex) ? own(measureIndex) : barTicks(song, measureIndex);
  };
}

/**
 * Where `stream` (from bar `firstIndex`'s start) ends once laid into bars of `room` as rewriteVoice lays it — a piece
 * that cannot be split at a bar line stays whole and over-fills its bar —: the bar and the offset in it.
 */
function endOf(stream: VoiceEvents, room: BarRoom, firstIndex: number): VoicePosition {
  const bars = layoutBars(stream, (index) => room(firstIndex + index));
  const last = Math.max(0, bars.length - 1);
  return { measureIndex: firstIndex + last, offset: eventsTicks(bars[last] ?? []) };
}

/**
 * Rests for the `ticks` left of `event` after a paste's end: in any tuplet of the event or the paste (two of them mixed
 * if need be, mixedGapRests); when none can write that time, a rest of the event's own length, which over-fills the bar
 * a little rather than leaving it unreadable (what follows in that bar then comes that much later). Under the event's
 * octave sign.
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

/** Events written over a voice: the song, the song tick the first one starts at, the last bar they reach and where they end. */
interface Written {
  readonly song: Song;
  readonly start: number;
  readonly lastMeasureIndex: number;
  readonly end: VoicePosition;
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
  const end = endOf([...before, ...inserted], room, flow.firstMeasureIndex);
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
  return { song: untied, start: barStart + start, lastMeasureIndex: Math.min(end.measureIndex, untied.measureHeaders.length - 1), end };
}

/** The beat of bar `measureIndex` of the track where the voice has an event starting at song tick `tick`; -1 when none. */
function voiceBeatAt(song: Song, at: BeatAddress, measureIndex: number, tick: number): number {
  const beats = song.tracks[at.trackIndex]?.measures[measureIndex]?.beats ?? [];
  return beats.findIndex((beat) => beat.start === tick && voiceOf(beat, at.voiceIndex)?.isEmpty === false);
}

/**
 * The voice's beat that starts at song tick `tick`: in `at`'s bar (its over-full part too), else in the bar whose time
 * holds it; `at` itself when none does.
 */
function beatStartingAt(song: Song, at: BeatAddress, tick: number): BeatAddress {
  const own = voiceBeatAt(song, at, at.measureIndex, tick);
  if (own >= 0) {
    return { ...at, beatIndex: own };
  }
  const headers = song.measureHeaders;
  let measureIndex = at.measureIndex;
  while ((headers[measureIndex + 1]?.start ?? Number.POSITIVE_INFINITY) <= tick) {
    measureIndex += 1;
  }
  const beatIndex = voiceBeatAt(song, at, measureIndex, tick);
  return beatIndex < 0 ? at : { ...at, measureIndex, beatIndex };
}

/**
 * The flow's beat where its voice goes on at `end`: the beat starting there in that bar, else the next bar's first (beat
 * 0 of a bar without beats too); undefined past the song's last bar.
 */
function beatAfter(song: Song, flow: VoiceFlow, end: VoicePosition): BeatAddress | undefined {
  const header = song.measureHeaders[end.measureIndex];
  const beats = song.tracks[flow.trackIndex]?.measures[end.measureIndex]?.beats ?? [];
  const beatIndex = header === undefined ? -1 : beats.findIndex((beat) => beat.start === header.start + end.offset && voiceOf(beat, flow.voiceIndex)?.isEmpty === false);
  const address = { trackIndex: flow.trackIndex, voiceIndex: flow.voiceIndex };
  if (beatIndex >= 0) {
    return { ...address, measureIndex: end.measureIndex, beatIndex };
  }
  return end.measureIndex + 1 < song.measureHeaders.length ? { ...address, measureIndex: end.measureIndex + 1, beatIndex: 0 } : undefined;
}

/**
 * Guitar Pro 8's single track paste of `fragment` at `at`, in that voice: written over the voice from the cursor for as
 * many bars as it needs (what played in its time is replaced — a free rest across its end cut, a note across it leaving
 * the rest of its time as rests —, an empty bar or voice filled, what follows stays in place, an over-full bar kept
 * over-full); nothing is inserted and no other track changes, but bars are appended (rests in every other track) for
 * what runs past the last bar. The notes go onto the track as fitFragment puts them — by pitch onto another tuning,
 * between drums and pitched tracks by MIDI number —; the first pasted beat and the voice's first note after the paste
 * lose their ties. `at` answers the beat the pasted beats start on (in the next bar when a
 * note held across the cursor runs into it) and `next` the beat right after them. A paste that writes what is there is
 * a paste (an equal song). Nothing pasted only for an empty fragment or a missing beat.
 */
export function pasteBeats(song: Song, at: BeatAddress, fragment: BeatFragment): PastedBeats {
  const unchanged: PastedBeats = { song, addedBars: 0, at, lastMeasureIndex: at.measureIndex, isPasted: false, mapping: 'asCopied', octaveShifted: 0, leftOut: 0 };
  const track = song.tracks[at.trackIndex];
  const position = hasVoiceSlot(song, at) ? beatPosition(song, at) : undefined;
  if (track === undefined || position === undefined || fragment.items.length === 0) {
    return unchanged;
  }
  const flow: VoiceFlow = { trackIndex: at.trackIndex, voiceIndex: at.voiceIndex, firstMeasureIndex: at.measureIndex };
  const { items, ...fit } = fitFragment(fragment, track);
  const inserted = untieFirst(items.map(itemEvent));
  const rooms = (start: number): BarRoom => pasteBarRoom(song, flow, start, copiedBarLengths(song, flow, start, eventsTicks(inserted), fragment.layout));
  const written = writeEvents(song, flow, position.offset, inserted, rooms);
  if (written === undefined) {
    return unchanged;
  }
  // Rests written before the paste into an empty voice can add beats before it: its first beat found by its start.
  const first = beatStartingAt(written.song, at, written.start);
  const next = beatAfter(written.song, flow, written.end);
  const addedBars = written.song.measureHeaders.length - song.measureHeaders.length;
  return { ...fit, song: written.song, addedBars, at: first, lastMeasureIndex: written.lastMeasureIndex, isPasted: true, ...(next === undefined ? {} : { next }) };
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
