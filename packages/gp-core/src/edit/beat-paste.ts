// Guitar Pro 8's single track paste (no TuxGuitar counterpart). Its guide (Copy, Paste and Cut): "Since this mode
// focuses on a single track, it does not account for bar structures, such as time signatures or key signatures"; the
// simple paste "completes the current bar with the clipboard content", and "When the cursor is on an empty bar, pasting
// first fills the empty bars". Its "additional bars are added before the bar where the paste is performed" belongs to the
// multitrack copy, which copies whole bars of every track (the app has none): a paste here writes over the cursor's track
// only, so it never moves one track against the others, and bars are added only past the song's end.
import { headerTicks } from '../model/defaults';
import type { Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { type VoiceFlow, liftVoice, rewriteVoice } from './bar-flow';
import { type BeatFragment, itemEvent, untieFirst } from './beat-fragment';
import { beatPosition, cutAt, hasVoiceSlot, onTrackStrings } from './beat-ranges';
import { updateNote } from './song-paths';
import { type VoiceEvents, eventTicks, eventsTicks, restEvents, signedRests } from './timeline';

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

/** Length of bar `measureIndex`; bars past the end are as long as the last one. */
function barLength(song: Song, measureIndex: number): number {
  const header = song.measureHeaders[measureIndex] ?? song.measureHeaders[song.measureHeaders.length - 1];
  return header === undefined ? 0 : headerTicks(header);
}

/** The bar that tick `ticks` (from bar `firstIndex`'s start, exclusive) ends in; past the song, a bar index after its last. */
function barReached(song: Song, firstIndex: number, ticks: number): number {
  let index = firstIndex;
  for (let left = ticks - barLength(song, index); left > 0; left -= barLength(song, index)) {
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

/** The voice's first beat with notes that starts at `tick` or later (from bar `measureIndex` on); undefined when none. */
function firstNotesFrom(song: Song, at: BeatAddress, tick: number): BeatAddress | undefined {
  const measures = song.tracks[at.trackIndex]?.measures ?? [];
  for (let measureIndex = at.measureIndex; measureIndex < measures.length; measureIndex++) {
    const beatIndex = measures[measureIndex]?.beats.findIndex((beat) => beat.start >= tick && (beat.voices[at.voiceIndex]?.notes.length ?? 0) > 0) ?? -1;
    if (beatIndex >= 0) {
      return { ...at, measureIndex, beatIndex };
    }
  }
  return undefined;
}

/** The voice's first note after the pasted beats untied: what it was tied to was written over. */
function untieAfter(song: Song, at: BeatAddress, tick: number): Song {
  const next = firstNotesFrom(song, at, tick);
  const notes = next === undefined ? [] : (song.tracks[at.trackIndex]?.measures[next.measureIndex]?.beats[next.beatIndex]?.voices[at.voiceIndex]?.notes ?? []);
  return next === undefined ? song : notes.filter((note) => note.isTied).reduce((current, note) => updateNote(current, { ...next, string: note.string }, (tiedNote) => ({ ...tiedNote, isTied: false })), song);
}

/** A paste written: the song, the song tick its first beat starts at, and the last bar it reaches. */
interface Written {
  readonly song: Song;
  readonly start: number;
  readonly lastMeasureIndex: number;
}

/** The fragment written over the voice from the beat at `at`; undefined when the voice cannot be read there. */
function writeOver(song: Song, at: BeatAddress, fragment: BeatFragment): Written | undefined {
  const track = song.tracks[at.trackIndex];
  const position = hasVoiceSlot(song, at) ? beatPosition(song, at) : undefined;
  const measure = track?.measures[at.measureIndex];
  const flow: VoiceFlow = { trackIndex: at.trackIndex, voiceIndex: at.voiceIndex, firstMeasureIndex: at.measureIndex };
  const firstBar = liftVoice(song, flow, at.measureIndex);
  if (track === undefined || position === undefined || measure === undefined || firstBar === undefined) {
    return undefined;
  }
  const inserted = untieFirst(onTrackStrings(fragment.items, track.strings.length).map(itemEvent));
  const start = eventsTicks(cutAt(firstBar, position.offset, measure).before);
  const reached = barReached(song, at.measureIndex, start + eventsTicks(inserted));
  const lastIndex = Math.min(reached, song.measureHeaders.length - 1);
  const placed = liftVoice(song, flow, lastIndex);
  const cut = placed === undefined ? undefined : cutAt(placed, position.offset, measure);
  const kept = cut === undefined ? undefined : withoutLeadingTicks(cut.after, eventsTicks(inserted));
  const barStart = song.measureHeaders[at.measureIndex]?.start ?? 0;
  const written = cut === undefined || kept === undefined ? song : rewriteVoice(song, flow, [...cut.before, ...inserted, ...kept], lastIndex);
  return written === song ? undefined : { song: untieAfter(written, at, barStart + start + eventsTicks(inserted)), start: barStart + start, lastMeasureIndex: reached };
}

/**
 * Guitar Pro 8's single track paste of `fragment` at `at`, in that voice: written over the voice from the cursor for as
 * many bars as it needs (what played in its time is replaced — a free rest across its end cut, a note across it leaving
 * the rest of its time as rests —, an empty bar or voice filled, what follows stays in place, an over-full bar of the
 * range kept over-full); nothing is inserted and no other track changes, but bars are appended (rests in every other
 * track) for what runs past the last bar. Notes on strings the track lacks are left out; the first pasted beat and the
 * voice's first note after the paste lose their ties. `at` answers the beat the pasted beats start on. The same song for
 * an empty fragment, a missing beat, or drum beats into a track that is not a drum track (and the other way round).
 */
export function pasteBeats(song: Song, at: BeatAddress, fragment: BeatFragment): PastedBeats {
  const unchanged: PastedBeats = { song, addedBars: 0, at, lastMeasureIndex: at.measureIndex };
  const track = song.tracks[at.trackIndex];
  if (track === undefined || fragment.items.length === 0 || fragment.isPercussion !== track.isPercussion || !hasVoiceSlot(song, at)) {
    return unchanged;
  }
  const written = writeOver(song, at, fragment);
  if (written === undefined) {
    return unchanged;
  }
  // Rests written before the paste into an empty voice can add beats before it: its first beat found by its start.
  const beatIndex = written.song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats.findIndex((beat) => beat.start === written.start) ?? -1;
  const first = { ...at, beatIndex: beatIndex < 0 ? at.beatIndex : beatIndex };
  return { song: written.song, addedBars: written.song.measureHeaders.length - song.measureHeaders.length, at: first, lastMeasureIndex: written.lastMeasureIndex };
}
