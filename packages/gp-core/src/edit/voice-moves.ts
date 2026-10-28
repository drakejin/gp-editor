// Guitar Pro 8's Move Voice (⌥1–⌥4); no TuxGuitar counterpart.
import type { Note, Song, Voice } from '../model/song';
import { type BeatAddress, findVoice, isVoiceIndex, locateVoice } from './addresses';
import { isInRun, orderRun } from './beat-runs';
import { deleteBeatNotes } from './beats';
import { sortByString, updateVoice } from './song-paths';
import { isSameDuration } from './timeline';
import { untieOrphanNotes } from './ties';
import { placeVoiceEvent } from './voice-entry';

/** Where a beat of the run starts: its bar and tick (beat indexes shift as rests are added). */
interface BeatStart {
  readonly measureIndex: number;
  readonly start: number;
}

/**
 * Voice `at.voiceIndex` with `voice`'s notes added at the addressed beat: an event of the same length there takes them
 * (on strings it leaves free), an empty voice or free rests there make room for an event as long. Same song when the
 * voice plays something else there, a string is taken, or a later note of the voice would have to move.
 */
function addToVoice(song: Song, at: BeatAddress, voice: Voice): Song {
  const there = findVoice(song, at);
  if (there === undefined) {
    return song;
  }
  if (there.isEmpty || there.notes.length === 0) {
    const { beamToNext: _beam, ...moved } = voice;
    return placeVoiceEvent(song, at, { ...moved, isEmpty: false }, false);
  }
  const taken = new Set(there.notes.map((note) => note.string));
  if (!isSameDuration(there.duration, voice.duration) || voice.notes.some((note) => taken.has(note.string))) {
    return song;
  }
  return updateVoice(song, at, (current) => ({ ...current, notes: sortByString([...current.notes, ...voice.notes]) }));
}

/** The voice at `at` without `moved`: a rest of the same length when no note is left. */
function withoutNotes(song: Song, at: BeatAddress, moved: readonly Note[], isAll: boolean): Song {
  return isAll ? deleteBeatNotes(song, at) : updateVoice(song, at, (voice) => ({ ...voice, notes: voice.notes.filter((note) => !moved.includes(note)) }));
}

function beatIndexAt(song: Song, trackIndex: number, place: BeatStart): number {
  return song.tracks[trackIndex]?.measures[place.measureIndex]?.beats.findIndex((beat) => beat.start === place.start) ?? -1;
}

/** One beat's notes moved (no tie settled yet); undefined when they cannot move, the same song when it has none. */
function moveBeat(song: Song, at: BeatAddress, toVoiceIndex: number, strings: readonly number[] | undefined): Song | undefined {
  const location = locateVoice(song, at);
  const moved = location?.voice.notes.filter((note) => strings === undefined || strings.includes(note.string)) ?? [];
  if (location === undefined || moved.length === 0) {
    return song;
  }
  const added = addToVoice(song, { ...at, voiceIndex: toVoiceIndex }, { ...location.voice, notes: moved });
  // Rests the target voice gains before the beat may shift the beat indexes: the beat is found again by where it starts.
  const beatIndex = beatIndexAt(added, at.trackIndex, { measureIndex: at.measureIndex, start: location.beat.start });
  if (added === song || beatIndex < 0) {
    return undefined;
  }
  return withoutNotes(added, { ...at, beatIndex }, moved, moved.length === location.voice.notes.length);
}

/** Ties on `strings` in `voiceIndexes` of bars `first`…`last` (and the bar after) left with nothing to continue, undone. */
function untieOrphans(song: Song, at: BeatAddress, voiceIndexes: readonly number[], strings: ReadonlySet<number>, [first, last]: readonly [number, number]): Song {
  const measures = song.tracks[at.trackIndex]?.measures ?? [];
  const tied = measures.slice(first, last + 2).flatMap((measure, offset) =>
    measure.beats.flatMap((beat, beatIndex) =>
      voiceIndexes.flatMap((voiceIndex) =>
        (beat.voices[voiceIndex]?.notes ?? [])
          .filter((note) => note.isTied && strings.has(note.string))
          .map((note) => ({ ...at, measureIndex: first + offset, beatIndex, voiceIndex, string: note.string })),
      ),
    ),
  );
  return untieOrphanNotes(song, tied);
}

/** Where each beat from `from` to `to` (either order, inclusive, across bars) of `from`'s track starts. */
function runStarts(song: Song, from: BeatAddress, to: BeatAddress): readonly BeatStart[] {
  const [first, last] = orderRun(from, to);
  const measures = song.tracks[from.trackIndex]?.measures ?? [];
  return measures.slice(first.measureIndex, last.measureIndex + 1).flatMap((measure, offset) => {
    const measureIndex = first.measureIndex + offset;
    return measure.beats.flatMap((beat, beatIndex) => (isInRun(measureIndex, beatIndex, first, last) ? [{ measureIndex, start: beat.start }] : []));
  });
}

function moveRun(song: Song, from: BeatAddress, to: BeatAddress, toVoiceIndex: number, strings?: readonly number[]): Song {
  const starts = runStarts(song, from, to);
  if (starts.length === 0 || !isVoiceIndex(toVoiceIndex) || toVoiceIndex === from.voiceIndex) {
    return song;
  }
  const moved = starts.reduce<Song | undefined>((current, place) => {
    const beatIndex = current === undefined ? -1 : beatIndexAt(current, from.trackIndex, place);
    return current === undefined || beatIndex < 0 ? undefined : moveBeat(current, { ...from, measureIndex: place.measureIndex, beatIndex }, toVoiceIndex, strings);
  }, song);
  if (moved === undefined || moved === song) {
    return song;
  }
  const bars: readonly [number, number] = [starts[0]?.measureIndex ?? 0, starts[starts.length - 1]?.measureIndex ?? 0];
  return untieOrphans(moved, from, [from.voiceIndex, toVoiceIndex], movedStrings(song, from, starts, strings), bars);
}

/** The strings of the notes the run moves. */
function movedStrings(song: Song, from: BeatAddress, starts: readonly BeatStart[], strings: readonly number[] | undefined): ReadonlySet<number> {
  const measures = song.tracks[from.trackIndex]?.measures ?? [];
  const notes = starts.flatMap((place) => measures[place.measureIndex]?.beats.find((beat) => beat.start === place.start)?.voices[from.voiceIndex]?.notes ?? []);
  return new Set(notes.map((note) => note.string).filter((string) => strings === undefined || strings.includes(string)));
}

/**
 * New song where the addressed voice's notes on `strings` (every note when absent) play in voice `toVoiceIndex`
 * instead, at the same time and for as long (Guitar Pro 8's Move Voice): they join an event of the same length there,
 * or take the time an empty voice or its free rests leave (the voice filled with rests to the bar lines); a slashed
 * beat stays slashed. The voice they leave keeps its other notes, or rests where they were. A tie left with nothing to
 * continue — the moved note's, or the next note's in the voice it left — is undone. Same song when the voice is the
 * same or past the fourth, no note moves, or voice `toVoiceIndex` cannot take them there (it plays something else, a
 * string is taken, or a later note of it would have to move).
 */
export function moveNotesToVoice(song: Song, at: BeatAddress, toVoiceIndex: number, strings?: readonly number[]): Song {
  return locateVoice(song, at) === undefined ? song : moveRun(song, at, at, toVoiceIndex, strings);
}

/**
 * New song where every note of the beats from `from` to `to` (either order, across bars) in `from`'s track and voice
 * moves to voice `toVoiceIndex`, beat by beat as moveNotesToVoice moves one; all of them or none (the same song when a
 * beat with notes cannot move). Ties within the run stay.
 */
export function moveBeatsToVoice(song: Song, from: BeatAddress, to: BeatAddress, toVoiceIndex: number): Song {
  return moveRun(song, from, to, toVoiceIndex);
}
