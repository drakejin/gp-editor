// A note's audio settings (Guitar Pro 8's note inspector, "Audio"; not in TuxGuitar): play duration, start offset and
// velocity change, which renderMidi honours.
import { NOTE_AUDIO_LIMITS, isSameNoteAudio, toNoteAudio } from '../model/defaults';
import type { NoteAudio, Song } from '../model/song';
import { isRawObject } from '../transcription/parse-values';
import type { StringAddress } from './addresses';
import { isIntegerIn } from './fragment-values-json';
import { updateNote } from './song-paths';

/** New song with the audio settings of the note on the addressed string (toNoteAudio); the defaults remove them. */
export function setNoteAudio(song: Song, at: StringAddress, audio: NoteAudio): Song {
  const next = toNoteAudio(audio);
  return updateNote(song, at, (note) => {
    if (isSameNoteAudio(note.audio, next)) {
      return note;
    }
    const { audio: _previous, ...rest } = note;
    return next === undefined ? rest : { ...rest, audio: next };
  });
}

/** Audio settings read from untrusted JSON (a copied note): whole numbers within NOTE_AUDIO_LIMITS, else undefined. */
export function parseNoteAudio(value: unknown): NoteAudio | undefined {
  const limits = NOTE_AUDIO_LIMITS;
  if (
    !isRawObject(value) ||
    !isIntegerIn(value.durationPercent, limits.minDurationPercent, limits.maxDurationPercent) ||
    !isIntegerIn(value.offsetPercent, 0, limits.maxOffsetPercent) ||
    !isIntegerIn(value.velocityOffset, -limits.maxVelocityOffset, limits.maxVelocityOffset)
  ) {
    return undefined;
  }
  return { durationPercent: value.durationPercent, offsetPercent: value.offsetPercent, velocityOffset: value.velocityOffset };
}
