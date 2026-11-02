// Deleting the notes of a run of beats, as Guitar Pro deletes a selection's notes (the beats stay, as rests); no
// TuxGuitar counterpart (its TGMeasureManager.cleanVoiceNotes, deleteBeatNotes here, does one beat).
import type { Beat, Song } from '../model/song';
import type { BeatAddress } from './addresses';
import { orderRun, runBeats, updateRunBeats } from './beat-runs';
import { replaceAt, updateTrack } from './song-paths';
import { nextVoiceEvent, tiedNotesAt, untieOrphanNotes } from './ties';

/** Every note, or only those on some strings. */
type StringFilter = (string: number) => boolean;

/**
 * The beat without voice `voiceIndex`'s notes that `isDeleted` takes (a rest of the same length when none is left); the
 * same beat when it takes none, or for a rest, an empty voice or no such voice.
 */
function withoutVoiceNotes(beat: Beat, voiceIndex: number, isDeleted: StringFilter): Beat {
  const voice = beat.voices[voiceIndex];
  const kept = voice?.notes.filter((note) => !isDeleted(note.string)) ?? [];
  if (voice === undefined || voice.isEmpty || kept.length === voice.notes.length) {
    return beat;
  }
  return { ...beat, voices: replaceAt(beat.voices, voiceIndex, { ...voice, notes: kept }) };
}

/**
 * New song where every beat from `from` to `to` (either order, inclusive, across bars) of `from`'s track is a rest in
 * `from`'s voice, as deleteBeatNotes makes one — or, with `strings`, without its notes on those strings (a rest when no
 * note is left: deleteNote on one string): the beats, their lengths and the other voices stay, so nothing after the run
 * moves. A note right after the run tied to a deleted note sounds again (its tie is undone). Same song when the run
 * holds no such notes in that voice.
 */
export function deleteRunNotes(song: Song, from: BeatAddress, to: BeatAddress, strings?: readonly number[]): Song {
  const track = song.tracks[from.trackIndex];
  if (track === undefined) {
    return song;
  }
  const isDeleted: StringFilter = (string) => strings === undefined || strings.includes(string);
  const [first, last] = orderRun(from, to);
  const deleted = updateRunBeats(track, first, last, (beat) => withoutVoiceNotes(beat, from.voiceIndex, isDeleted));
  if (deleted === track) {
    return song;
  }
  const deletedStrings = runBeats(track, first, last).flatMap((beat) => beat.voices[from.voiceIndex]?.notes.map((note) => note.string).filter(isDeleted) ?? []);
  const edited = updateTrack(song, from.trackIndex, () => deleted);
  return untieOrphanNotes(edited, tiedNotesAt(edited, nextVoiceEvent(edited, { ...last, voiceIndex: from.voiceIndex }), new Set(deletedStrings)));
}
