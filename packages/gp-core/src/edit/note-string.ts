// A note moved to the next string at the same pitch, after TuxGuitar's TGMeasureManager.shiftNote (LGPL-2.1).
import type { Note, Song } from '../model/song';
import { type StringAddress, findNote, hasString, otherVoiceOnString } from './addresses';
import { isFret } from './edit-song';
import { shiftEffectFrets } from './retune';
import { sortByString, updateVoice } from './song-paths';
import { nextVoiceEvent, previousNoteForTie, tiedNotesAt, untieOrphanNotes } from './ties';

/**
 * New song with the note at the position moved to `string`, keeping its pitch (TuxGuitar's TGMeasureManager.shiftNote):
 * its fret becomes the pitch over the new string's open note, its grace, trill and tapped-harmonic frets move with it,
 * its left-hand finger no longer applies, and the ties the move breaks are undone (its own, and the next note's on the
 * string it left). A drum note keeps its key. Same song when there is no note, the string is missing or taken in any
 * voice of the beat, or the note or its grace note would fall off the neck.
 */
export function setNoteString(song: Song, at: StringAddress, string: number): Song {
  const target: StringAddress = { ...at, string };
  const note = findNote(song, at);
  const isFree = hasString(song, target) && findNote(song, target) === undefined && otherVoiceOnString(song, target) === undefined;
  const moved = note === undefined || !isFree ? undefined : movedNote(song, at, note, string);
  if (note === undefined || moved === undefined) {
    return song;
  }
  const edited = updateVoice(song, at, (voice) => ({ ...voice, notes: sortByString(voice.notes.map((other) => (other === note ? moved : other))) }));
  return untieOrphanNotes(edited, tiedNotesAt(edited, nextVoiceEvent(edited, at), new Set([at.string])));
}

/** The note on `string` at the same pitch; undefined when it (or its grace note) would fall off the neck. */
function movedNote(song: Song, at: StringAddress, note: Note, string: number): Note | undefined {
  const track = song.tracks[at.trackIndex];
  const from = track?.strings[at.string - 1]?.tuning;
  const to = track?.strings[string - 1]?.tuning;
  if (track === undefined || from === undefined || to === undefined) {
    return undefined;
  }
  const shift = track.isPercussion ? 0 : from - to;
  const fret = note.fret + shift;
  const grace = note.effect.grace;
  if (!track.isPercussion && (!isFret(fret) || (grace !== undefined && !isFret(grace.fret + shift)))) {
    return undefined;
  }
  const { leftFinger: _finger, ...kept } = note;
  const isTied = note.isTied && previousNoteForTie(song, { ...at, string })?.fret === fret;
  return { ...kept, string, fret, isTied, effect: shiftEffectFrets(note.effect, shift) };
}
