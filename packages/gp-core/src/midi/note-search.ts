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

function beatsOf(context: TrackContext, playedIndex: number): readonly Beat[] {
  const played = context.played[playedIndex];
  return played === undefined ? [] : context.track.measures[played.headerIndex]?.beats ?? [];
}

/** Beats after `beatIndex` of played measure `playedIndex`, through the rest of the playback. */
export function* beatsAfter(context: TrackContext, playedIndex: number, beatIndex: number): Generator<PlayedBeat> {
  let first = beatIndex + 1;
  for (let index = playedIndex; index < context.played.length; index++) {
    const move = context.played[index]?.move ?? 0;
    const beats = beatsOf(context, index);
    for (let b = first; b < beats.length; b++) {
      const beat = beats[b];
      if (beat !== undefined) {
        yield { beat, move, playedIndex: index };
      }
    }
    first = 0;
  }
}

/** Beats before `beatIndex` of played measure `playedIndex`, walking back to the start of the playback. */
export function* beatsBefore(context: TrackContext, playedIndex: number, beatIndex: number): Generator<PlayedBeat> {
  let last = beatIndex - 1;
  for (let index = playedIndex; index >= 0; index--) {
    const move = context.played[index]?.move ?? 0;
    const beats = beatsOf(context, index);
    for (let b = Math.min(last, beats.length - 1); b >= 0; b--) {
      const beat = beats[b];
      if (beat !== undefined) {
        yield { beat, move, playedIndex: index };
      }
    }
    last = Number.POSITIVE_INFINITY;
  }
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
  for (const next of beatsAfter(context, placed.playedIndex, placed.beatIndex)) {
    const voice = voiceAt(next.beat, placed.voiceIndex);
    if (voice !== undefined) {
      const note = voice.notes.find((candidate) => candidate.string === placed.note.string);
      return note === undefined ? undefined : { note, beat: next.beat, move: next.move };
    }
  }
  return undefined;
}

/** getPreviousNote(…, breakAtRest = false): the last note played before on the same string in the voice. */
export function findPreviousNote(context: TrackContext, placed: PlacedNote): Note | undefined {
  for (const previous of beatsBefore(context, placed.playedIndex, placed.beatIndex)) {
    const note = voiceAt(previous.beat, placed.voiceIndex)?.notes.find(
      (candidate) => candidate.string === placed.note.string,
    );
    if (note !== undefined) {
      return note;
    }
  }
  return undefined;
}
