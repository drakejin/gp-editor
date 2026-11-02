// Guitar Pro 8's simple paste (no TuxGuitar counterpart). Its guide (Copy, Paste and Cut): "it completes the current bar
// with the clipboard content"; "If the selection includes more than one bar, additional bars are added before the bar
// where the paste is performed"; "When the cursor is on an empty bar, pasting first fills the empty bars, then creates
// new ones if needed". Bars are the whole song's, so a paste never moves one track against the others.
import { durationTicks, headerTicks } from '../model/defaults';
import type { Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { type VoiceFlow, liftVoice, rewriteVoice } from './bar-flow';
import { type BeatFragment, itemEvent, untieFirst } from './beat-fragment';
import { beatPosition, cutAt, hasVoiceSlot, onTrackStrings } from './beat-ranges';
import { insertMeasure } from './measures';
import { type VoiceEvents, eventTicks, eventsTicks, restEvents, signedRests } from './timeline';

/** A paste's outcome. */
export interface PastedBeats {
  readonly song: Song;
  /** Bars added to the song (every track): before the cursor's bar, after the empty bars it filled, or at the end. */
  readonly addedBars: number;
  /** Where the pasted beats start. */
  readonly at: BeatAddress;
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

/** How many bars from `measureIndex` on hold no note in the track, one after the other. */
function emptyBarsFrom(song: Song, at: BeatAddress): number {
  const measures = song.tracks[at.trackIndex]?.measures ?? [];
  const firstFull = measures.findIndex((measure, index) => index >= at.measureIndex && measure.beats.some((beat) => beat.voices.some((voice) => voice.notes.length > 0)));
  return (firstFull < 0 ? measures.length : firstFull) - at.measureIndex;
}

function withBarsBefore(song: Song, measureIndex: number, count: number): Song {
  return Array.from({ length: Math.max(0, count) }).reduce<Song>((current) => insertMeasure(current, measureIndex, 'before'), song);
}

/** Room for a fragment longer than a bar: new bars before the cursor's bar, or the empty bars there and new ones after them. */
function roomForBars(song: Song, at: BeatAddress, ticks: number): { readonly song: Song; readonly at: BeatAddress } {
  const empty = emptyBarsFrom(song, at);
  if (empty === 0) {
    const count = Math.ceil(ticks / barLength(song, at.measureIndex));
    return { song: withBarsBefore(song, at.measureIndex, count), at: { ...at, beatIndex: 0 } };
  }
  const offset = beatPosition(song, at)?.offset ?? 0;
  const missing = barReached(song, at.measureIndex, offset + ticks) + 1 - at.measureIndex - empty;
  const after = at.measureIndex + empty;
  return { song: after < song.measureHeaders.length ? withBarsBefore(song, after, missing) : song, at };
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

/** The events with the first one that has notes untied, when only rests come before it: the note it continued is gone. */
function untieFirstNotes(events: VoiceEvents): VoiceEvents {
  const index = events.findIndex((event) => event.voice.notes.length > 0);
  return index < 0 ? events : [...events.slice(0, index), ...untieFirst(events.slice(index))];
}

/** The fragment written over the voice from the beat at `at`; undefined when the voice cannot be read there. */
function writeOver(song: Song, at: BeatAddress, fragment: BeatFragment): Song | undefined {
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
  const lastIndex = Math.min(barReached(song, at.measureIndex, start + eventsTicks(inserted)), song.measureHeaders.length - 1);
  const placed = liftVoice(song, flow, lastIndex);
  const cut = placed === undefined ? undefined : cutAt(placed, position.offset, measure);
  const kept = cut === undefined ? undefined : withoutLeadingTicks(cut.after, eventsTicks(inserted));
  return cut === undefined || kept === undefined ? undefined : rewriteVoice(song, flow, [...cut.before, ...inserted, ...untieFirstNotes(kept)], lastIndex);
}

/**
 * Guitar Pro 8's simple paste of `fragment` at `at`, in that voice. Up to a bar long, it is written over the voice from
 * the cursor (what played in its time is replaced — a free rest across its end cut, a note across it leaving the rest
 * of its time as rests —, what follows stays in place; past the last bar, bars are appended). Longer, on a bar of the
 * track with notes: whole bars are added before the cursor's bar, as many as it needs, and it goes into them; on an
 * empty bar: it fills the empty bars from there on, with bars added after them for what does not fit. Notes on strings
 * the track lacks are left out; the first pasted beat and the note after the paste lose their ties. The same song for
 * an empty fragment, a missing beat, or drum beats into a track that is not a drum track (and the other way round).
 */
export function pasteBeats(song: Song, at: BeatAddress, fragment: BeatFragment): PastedBeats {
  const unchanged: PastedBeats = { song, addedBars: 0, at };
  const track = song.tracks[at.trackIndex];
  const header = song.measureHeaders[at.measureIndex];
  if (track === undefined || header === undefined || fragment.items.length === 0 || fragment.isPercussion !== track.isPercussion || !hasVoiceSlot(song, at)) {
    return unchanged;
  }
  const ticks = fragment.items.reduce((total, item) => total + durationTicks(item.duration), 0);
  const room = ticks <= headerTicks(header) ? { song, at } : roomForBars(song, at, ticks);
  const written = writeOver(room.song, room.at, fragment);
  if (written === undefined || written === room.song) {
    return unchanged;
  }
  return { song: written, addedBars: written.measureHeaders.length - song.measureHeaders.length, at: room.at };
}
