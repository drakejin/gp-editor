// Guitar Pro 8's Move Voice (⌥1–⌥4); no TuxGuitar counterpart.
import type { Note, Song, Voice } from '../model/song';
import { type BeatAddress, findVoice, isVoiceIndex, locateVoice } from './addresses';
import { deleteBeatNotes } from './beats';
import { sortByString, updateVoice } from './song-paths';
import { isSameDuration } from './timeline';
import { placeVoiceEvent } from './voice-entry';

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
    return placeVoiceEvent(song, at, { duration: voice.duration, notes: voice.notes, isEmpty: false, direction: 'none' }, false);
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

/**
 * New song where the addressed voice's notes on `strings` (every note when absent) play in voice `toVoiceIndex`
 * instead, at the same time and for as long (Guitar Pro 8's Move Voice): they join an event of the same length there,
 * or take the time an empty voice or its free rests leave (the voice filled with rests to the bar lines). The voice they
 * leave keeps its other notes, or rests where they were. Same song when the voice is the same or past the fourth, no
 * note moves, or voice `toVoiceIndex` cannot take them there (see addToVoice).
 */
export function moveNotesToVoice(song: Song, at: BeatAddress, toVoiceIndex: number, strings?: readonly number[]): Song {
  const location = locateVoice(song, at);
  const moved = location?.voice.notes.filter((note) => strings === undefined || strings.includes(note.string)) ?? [];
  if (location === undefined || moved.length === 0 || !isVoiceIndex(toVoiceIndex) || toVoiceIndex === at.voiceIndex) {
    return song;
  }
  const added = addToVoice(song, { ...at, voiceIndex: toVoiceIndex }, { ...location.voice, notes: moved });
  // Rests the target voice gains before the beat may shift the beat indexes: the beat is found again by where it starts.
  const beatIndex = added.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats.findIndex((beat) => beat.start === location.beat.start) ?? -1;
  if (added === song || beatIndex < 0) {
    return song;
  }
  return withoutNotes(added, { ...at, beatIndex }, moved, moved.length === location.voice.notes.length);
}
