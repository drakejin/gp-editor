// Guitar Pro 8's single track paste (no TuxGuitar counterpart). Its guide (Copy, Paste and Cut): "Since this mode
// focuses on a single track, it does not account for bar structures, such as time signatures or key signatures"; the
// simple paste "completes the current bar with the clipboard content", and "When the cursor is on an empty bar, pasting
// first fills the empty bars". Its "additional bars are added before the bar where the paste is performed" belongs to the
// multitrack copy, which copies whole bars of every track (the app has none): a paste here writes over the cursor's track
// only, so it never moves one track against the others, and bars are added only past the song's end.
import type { Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { type VoiceFlow, barTicks, liftVoice, rewriteVoice } from './bar-flow';
import { type BeatFragment, itemEvent, untieFirst } from './beat-fragment';
import { beatPosition, cutAt, hasVoiceSlot, onTrackStrings, runEvents } from './beat-ranges';
import { updateNote } from './song-paths';
import { type VoiceEvents, eventTicks, eventsTicks, isFreeRest, restEvent, restEvents, signedRests } from './timeline';

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

/**
 * The room of each bar in the flow's voice: its time signature's length, or the voice's own where it over-fills the
 * bar (a paste keeps an over-full bar over-full, so nothing after it moves); read once per bar.
 */
function voiceBarRoom(song: Song, flow: VoiceFlow): (measureIndex: number) => number {
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

/** The bar that tick `ticks` (from bar `firstIndex`'s start, exclusive) ends in; past the song, a bar index after its last. */
function barReached(room: (measureIndex: number) => number, firstIndex: number, ticks: number): number {
  let index = firstIndex;
  for (let left = ticks - room(index); left > 0; left -= room(index)) {
    index += 1;
  }
  return index;
}

/** The events without their first `ticks`: an event across that point leaves the rest of its time as rests. */
function withoutLeadingTicks(events: VoiceEvents, ticks: number): VoiceEvents | undefined {
  let position = 0;
  for (const [index, event] of events.entries()) {
    const end = position + eventTicks(event);
    if (end > ticks) {
      if (position >= ticks) {
        return events.slice(index);
      }
      const tail = restEvents(end - ticks, undefined, event.voice.duration);
      return tail === undefined ? undefined : [...signedRests(tail, event), ...events.slice(index + 1)];
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
 * events go in after it): what played in their time is replaced — a free rest across their end cut, a note across it
 * leaving the rest of its time as rests —, what follows stays in place, bars are appended for what runs past the song's
 * end. Undefined when the voice cannot be read there or nothing changes.
 */
function writeEvents(song: Song, flow: VoiceFlow, offset: number, inserted: VoiceEvents): Written | undefined {
  const measure = song.tracks[flow.trackIndex]?.measures[flow.firstMeasureIndex];
  const firstBar = liftVoice(song, flow, flow.firstMeasureIndex);
  if (measure === undefined || firstBar === undefined) {
    return undefined;
  }
  const room = voiceBarRoom(song, flow);
  const start = eventsTicks(cutAt(firstBar, offset, measure).before);
  const end = start + eventsTicks(inserted);
  const reached = barReached(room, flow.firstMeasureIndex, end);
  const lastIndex = Math.min(reached, song.measureHeaders.length - 1);
  const placed = liftVoice(song, flow, lastIndex);
  const cut = placed === undefined ? undefined : cutAt(placed, offset, measure);
  const kept = cut === undefined ? undefined : withoutLeadingTicks(cut.after, eventsTicks(inserted));
  const written = cut === undefined || kept === undefined ? song : rewriteVoice(song, flow, [...cut.before, ...inserted, ...kept], lastIndex, room);
  if (written === song) {
    return undefined;
  }
  const barStart = song.measureHeaders[flow.firstMeasureIndex]?.start ?? 0;
  return { song: untieAfter(written, flow, barStart + end), start: barStart + start, lastMeasureIndex: Math.min(reached, written.measureHeaders.length - 1) };
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
  const written = writeEvents(song, flow, position.offset, inserted);
  if (written === undefined) {
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
  return writeEvents(song, flow, first.offset, rests)?.song ?? song;
}
