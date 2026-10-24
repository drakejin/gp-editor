// Port of TuxGuitar MidiSequenceParser.getNextNote / getPreviousNote (LGPL-2.1): walking a track in playback order.
import type { Beat, Channel, MeasureHeader, Note, Track, Voice } from '../model/song';
import type { PlayedMeasure } from './playback-order';

/** One track being turned into a sequence. */
export interface TrackContext {
  readonly track: Track;
  readonly channel: Channel;
  readonly headers: readonly MeasureHeader[];
  readonly played: readonly PlayedMeasure[];
  /** Sequence tick of MIDI tick 0 (where playback starts). */
  readonly origin: number;
  /** The track's beats in playback order (buildPlaybackBeats), which the searches below walk. */
  readonly playback: PlaybackBeats;
}

/** A note at one place of the playback (TuxGuitar keeps these as back-pointers on TGNote). */
export interface PlacedNote {
  readonly note: Note;
  readonly voice: Voice;
  readonly beat: Beat;
  readonly header: MeasureHeader;
  /** Quarter notes per minute the measure sounds at (playedTempo: the header's tempo times the pass's scale). */
  readonly tempo: number;
  /** Repeat move of the played measure. */
  readonly move: number;
  readonly playedIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
}

/** A beat of a played measure. */
export interface PlayedBeat {
  readonly beat: Beat;
  readonly move: number;
  readonly playedIndex: number;
}

/**
 * A track's beats in playback order, built once per render: the searches for the next and previous notes of every
 * note walk this list instead of the played measures (they ran once per note, through generators).
 */
export interface PlaybackBeats {
  readonly beats: readonly PlayedBeat[];
  /** Index in `beats` of each played measure's first beat, then the number of beats. */
  readonly firstBeats: readonly number[];
}

export function buildPlaybackBeats(track: Track, played: readonly PlayedMeasure[]): PlaybackBeats {
  const beats: PlayedBeat[] = [];
  const firstBeats: number[] = [];
  played.forEach((measure, playedIndex) => {
    firstBeats.push(beats.length);
    for (const beat of track.measures[measure.headerIndex]?.beats ?? []) {
      beats.push({ beat, move: measure.move, playedIndex });
    }
  });
  firstBeats.push(beats.length);
  return { beats, firstBeats };
}

/** Where `beatIndex` of played measure `playedIndex` would be in the playback's beats, kept within that measure. */
function positionIn(playback: PlaybackBeats, playedIndex: number, beatIndex: number): number {
  const first = playback.firstBeats[playedIndex] ?? playback.beats.length;
  const end = playback.firstBeats[playedIndex + 1] ?? first;
  return first + Math.min(Math.max(beatIndex, 0), end - first);
}

/** Position in the playback's beats of the first beat after `beatIndex` of played measure `playedIndex`. */
export function nextBeatPosition(context: TrackContext, playedIndex: number, beatIndex: number): number {
  return positionIn(context.playback, playedIndex, beatIndex + 1);
}

/** Position in the playback's beats of the last beat before `beatIndex` of played measure `playedIndex` (-1: none). */
export function previousBeatPosition(context: TrackContext, playedIndex: number, beatIndex: number): number {
  return positionIn(context.playback, playedIndex, beatIndex) - 1;
}

/** The voice of a beat at `voiceIndex` when it holds a beat (TGVoice.isEmpty is false). */
export function voiceAt(beat: Beat, voiceIndex: number): Voice | undefined {
  const voice = beat.voices[voiceIndex];
  return voice === undefined || voice.isEmpty ? undefined : voice;
}

export interface FoundNote {
  readonly note: Note;
  readonly beat: Beat;
  readonly move: number;
}

/** getNextNote(…, breakAtRest = true): the note on the same string in the next beat of the voice, if any. */
export function findNextNote(context: TrackContext, placed: PlacedNote): FoundNote | undefined {
  const { beats } = context.playback;
  for (let position = nextBeatPosition(context, placed.playedIndex, placed.beatIndex); position < beats.length; position++) {
    const next = beats[position];
    const voice = next === undefined ? undefined : voiceAt(next.beat, placed.voiceIndex);
    if (next !== undefined && voice !== undefined) {
      const note = voice.notes.find((candidate) => candidate.string === placed.note.string);
      return note === undefined ? undefined : { note, beat: next.beat, move: next.move };
    }
  }
  return undefined;
}

/** getPreviousNote(…, breakAtRest = false): the last note played before on the same string in the voice. */
export function findPreviousNote(context: TrackContext, placed: PlacedNote): Note | undefined {
  const { beats } = context.playback;
  for (let position = previousBeatPosition(context, placed.playedIndex, placed.beatIndex); position >= 0; position--) {
    const previous = beats[position];
    const note = previous === undefined ? undefined : voiceAt(previous.beat, placed.voiceIndex)?.notes.find((candidate) => candidate.string === placed.note.string);
    if (note !== undefined) {
      return note;
    }
  }
  return undefined;
}
