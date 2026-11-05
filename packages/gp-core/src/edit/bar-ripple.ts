import { headerTicks } from '../model/defaults';
import type { Duration, Measure, Song } from '../model/song';
import { type EventCut, cutAtBarLine, cutEventsAt } from './bar-cut';
import { type VoiceFlow, appendBars, barEvents, rewriteBar } from './bar-flow';
import { blankSyllablesForTies } from './lyrics-ties';
import { hasSameItems, updateTrack } from './song-paths';
import { type VoiceEvent, type VoiceEvents, distinctTuplets, eventsTicks, gapRests, isFreeRest, restEvents, signedRests } from './timeline';
import { trimTrailingRests } from './voice-fit';

/**
 * The ripple of a beat edit through one voice of one track (no Guitar Pro counterpart: Guitar Pro 8 leaves such a bar
 * too long or too short and marks it red; its Bar Arranger re-bars on request). A bar left too long passes what runs
 * past its bar line on to the next bar, which passes its own excess on, until a bar whose rests at the end take the
 * push; past the song's last bar, bars are added. A bar left short by a deleted beat takes the time it lacks from the
 * start of the next bar, bar by bar, until a bar that ends in a rest (or holds only rests) gives the time. A note across
 * a bar line becomes tied notes; a tuplet group never crosses one.
 */

/** What a beat edit moved across bar lines in its voice. */
export interface BarFlow {
  /** `later`: music moved on into the next bars; `earlier`: pulled back from them. */
  readonly direction: 'later' | 'earlier';
  /** Beats with notes that crossed the edited bar's line: on into the next bar, or back from it. */
  readonly movedNotes: number;
  /** The last bar (index) the ripple changed. */
  readonly lastMeasureIndex: number;
  /** Bars added at the end of the song (every track: rests). */
  readonly addedBars: number;
  /** A bar (index) a tuplet group stopped the ripple at: left too long (later), or not pulled from (earlier). */
  readonly keptMeasureIndex?: number;
}

/** A song after a beat edit, and what the edit moved across bar lines (none when it stayed in its bar). */
export interface BeatChange {
  readonly song: Song;
  readonly flow?: BarFlow;
}

/** Most bars one ripple may add: a note longer than many bars cut into tied pieces at the end of the song. */
const MAX_ADDED_BARS = 256;

/** A bar's new events in the flowing voice. */
interface BarWrite {
  readonly measureIndex: number;
  readonly events: VoiceEvents;
}

/** The ripple so far: the song (with the bars added), the bars to write, and the tied pieces a bar line made. */
interface Ripple {
  readonly song: Song;
  readonly writes: readonly BarWrite[];
  readonly movedNotes: number;
  readonly addedBars: number;
  readonly pieces: readonly VoiceEvent[];
}

function barLength(song: Song, measureIndex: number): number {
  const header = song.measureHeaders[measureIndex];
  return header === undefined ? 0 : headerTicks(header);
}

function noteEvents(events: VoiceEvents): number {
  return events.filter((event) => event.voice.notes.length > 0).length;
}

/** The ripple's tied pieces with those a cut made: every piece after the first, the first too when it cut such a piece. */
function withPieces(pieces: readonly VoiceEvent[], cut: EventCut): readonly VoiceEvent[] {
  if (cut.split === undefined || cut.split.event.voice.notes.length === 0) {
    return pieces;
  }
  const [first, ...later] = cut.split.pieces;
  const kept = pieces.includes(cut.split.event) && first !== undefined ? [first] : [];
  return [...pieces, ...kept, ...later];
}

/** The song with the ripple's bars written in the flowing voice; undefined when a bar cannot be read. */
function writeRipple(ripple: Ripple, flow: VoiceFlow): Song | undefined {
  const { song, writes } = ripple;
  const measures = song.tracks[flow.trackIndex]?.measures ?? [];
  const rewritten = measures.map((measure, measureIndex): Measure | undefined => {
    const write = writes.find((entry) => entry.measureIndex === measureIndex);
    return write === undefined ? measure : rewriteBar(song, flow, measureIndex, write.events);
  });
  if (!rewritten.every((measure): measure is Measure => measure !== undefined)) {
    return undefined;
  }
  const written = updateTrack(song, flow.trackIndex, (track) => (hasSameItems(rewritten, track.measures) ? track : { ...track, measures: rewritten }));
  return blankSyllablesForTies(written, flow, writes, ripple.pieces);
}

/** The ripple's song and report; the original song when a bar cannot be written. */
function finish(original: Song, ripple: Ripple, flow: VoiceFlow, report: Omit<BarFlow, 'movedNotes' | 'addedBars'>): BeatChange {
  const song = writeRipple(ripple, flow);
  return song === undefined ? { song: original } : { song, flow: { ...report, movedNotes: ripple.movedNotes, addedBars: ripple.addedBars } };
}

/** The ripple with the song one bar longer when `measureIndex` is past its last bar. */
function withBar(ripple: Ripple, measureIndex: number): Ripple {
  return measureIndex < ripple.song.measureHeaders.length ? ripple : { ...ripple, song: appendBars(ripple.song, 1), addedBars: ripple.addedBars + 1 };
}

/**
 * The song with the flow's voice in its first bar set to `events`, which run past its bar line: the excess flows on
 * (see the module comment). The edited bar stays too long when a tuplet group would cross its bar line.
 */
export function flowVoiceOn(song: Song, flow: VoiceFlow, events: VoiceEvents): BeatChange {
  let ripple: Ripple = { song, writes: [], movedNotes: 0, addedBars: 0, pieces: [] };
  let bar = events;
  for (let measureIndex = flow.firstMeasureIndex; ; measureIndex++) {
    const length = barLength(ripple.song, measureIndex);
    const cut = eventsTicks(bar) > length ? cutAtBarLine(bar, length) : { before: bar, after: [] };
    const isStopped = cut === undefined || ripple.addedBars >= MAX_ADDED_BARS;
    if (isStopped || cut.after.length === 0) {
      const done = { ...ripple, writes: [...ripple.writes, { measureIndex, events: isStopped ? bar : cut.before }] };
      return finish(song, done, flow, { direction: 'later', lastMeasureIndex: measureIndex, ...(isStopped ? { keptMeasureIndex: measureIndex } : {}) });
    }
    const isFirst = measureIndex === flow.firstMeasureIndex;
    ripple = withBar({ ...ripple, writes: [...ripple.writes, { measureIndex, events: cut.before }], movedNotes: isFirst ? noteEvents(cut.after) : ripple.movedNotes, pieces: withPieces(ripple.pieces, cut) }, measureIndex + 1);
    const next = barEvents(ripple.song, flow, measureIndex + 1);
    if (next === undefined) {
      const kept = { ...ripple, writes: [...ripple.writes.slice(0, -1), { measureIndex, events: bar }] };
      return finish(song, kept, flow, { direction: 'later', lastMeasureIndex: measureIndex, keptMeasureIndex: measureIndex });
    }
    bar = trimTrailingRests([...cut.after, ...next], barLength(ripple.song, measureIndex + 1));
  }
}

/** The bar's events with rests to its length (preferably `preferred`, under the octave sign before them); left short when they cannot be written. */
function filled(events: VoiceEvents, length: number, preferred: Duration): VoiceEvents {
  const ticks = length - eventsTicks(events);
  const rests = ticks <= 0 ? [] : (restEvents(ticks, preferred) ?? gapRests(ticks, distinctTuplets(events.map((event) => event.voice.duration))) ?? []);
  return [...events, ...signedRests(rests, events[events.length - 1])];
}

/** True when the bar's voice ends in a free rest, which grows to take the gap a deletion left. */
function endsInRest(events: VoiceEvents): boolean {
  const last = events[events.length - 1];
  return last !== undefined && isFreeRest(last);
}

/**
 * The song with the flow's voice in its first bar set to `events`, which a deleted beat left short of the bar line:
 * the time it lacks is pulled back from the next bars (see the module comment), the last bar it reaches filled with
 * rests (preferably of `preferred`, the deleted beat's duration). Undefined when nothing is pulled: the bar ends in a
 * rest that takes the gap, or the next bar holds only rests, or the song ends there.
 */
export function pullVoiceBack(song: Song, flow: VoiceFlow, events: VoiceEvents, preferred: Duration): BeatChange | undefined {
  let ripple: Ripple = { song, writes: [], movedNotes: 0, addedBars: 0, pieces: [] };
  let bar = events;
  for (let measureIndex = flow.firstMeasureIndex; ; measureIndex++) {
    const length = barLength(song, measureIndex);
    const need = length - eventsTicks(bar);
    const next = need <= 0 || endsInRest(bar) ? undefined : barEvents(song, flow, measureIndex + 1);
    const isPulling = next !== undefined && !next.every(isFreeRest) && barLength(song, measureIndex + 1) >= need;
    const cut = isPulling ? cutEventsAt(next, need) : undefined;
    if (cut === undefined) {
      const done = { ...ripple, writes: [...ripple.writes, { measureIndex, events: filled(bar, length, preferred) }] };
      const kept = isPulling ? { keptMeasureIndex: measureIndex + 1 } : {};
      const isMoved = ripple.writes.length > 0 || isPulling;
      return isMoved ? finish(song, done, flow, { direction: 'earlier', lastMeasureIndex: measureIndex, ...kept }) : undefined;
    }
    const isFirst = measureIndex === flow.firstMeasureIndex;
    ripple = { ...ripple, writes: [...ripple.writes, { measureIndex, events: [...bar, ...cut.before] }], movedNotes: isFirst ? noteEvents(cut.before) : ripple.movedNotes, pieces: withPieces(ripple.pieces, cut) };
    bar = cut.after;
  }
}
