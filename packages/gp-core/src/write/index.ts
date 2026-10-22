// Public surface of the Guitar Pro writers.
import type { Song } from '../model/song';
import { writeGp3, writeGp4 } from './gp34-writer';
import { writeGp5 } from './gp5-writer';

export type WritableFormat = 'gp5' | 'gp4' | 'gp3';

const WRITERS: Readonly<Record<WritableFormat, (song: Song) => Uint8Array>> = {
  gp5: writeGp5,
  gp4: writeGp4,
  gp3: writeGp3,
};

/**
 * Encode a song as a Guitar Pro file. GP5 is "FICHIER GUITAR PRO v5.10", GP4 "v4.06", GP3 "v3.00".
 *
 * Any song (read from GP1–GP8 or edited) can be written; what the format cannot hold is left out or
 * clamped: voices beyond the second (GP3/GP4: joined into one), strings beyond the seventh, frets above 99, …
 *
 * @throws RangeError when the song has no measure or no track
 */
export function writeSong(song: Song, format: WritableFormat = 'gp5'): Uint8Array {
  return WRITERS[format](song);
}
