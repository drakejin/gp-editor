// AI Edit's preset "Lower the key and make it easy to play": a chromatic transposition, then the easy fingering of the
// same scope — exact, no model involved, one edit.
import type { NoteScope } from '../edit/edit-scope';
import { type Transposition, transpose } from '../edit/transpose';
import type { Song } from '../model/song';
import { type Refingering, refinger } from './refinger';

/** The song transposed and re-fingered; `transposition` is the plain transposition (its song the step in between). */
export interface EasyTransposition {
  readonly song: Song;
  readonly transposition: Transposition;
  /** `before` = the plain transposition's fingering cost. */
  readonly refingering: Refingering;
}

/**
 * The scope moved by `semitones` (transpose: key signatures with a song or track, drums never; a note no string holds
 * stays and is counted), then re-fingered for easy playing (refinger). With 0 semitones it only re-fingers.
 */
export function easyTranspose(song: Song, scope: NoteScope, semitones: number): EasyTransposition {
  const transposition = transpose(song, scope, { mode: 'chromatic', amount: semitones });
  const refingering = refinger(transposition.song, scope);
  return { song: refingering.song, transposition, refingering };
}
