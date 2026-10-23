// Public surface of the Guitar Pro writers.
import type { Song } from '../model/song';
import { writeGp3, writeGp4 } from './gp34-writer';
import { writeGp5 } from './gp5-writer';
import { writeGp7 } from './gpif/gp7-writer';

export type WritableFormat = 'gp5' | 'gp4' | 'gp3' | 'gp';

const WRITERS: Readonly<Record<WritableFormat, (song: Song) => Uint8Array>> = {
  gp5: writeGp5,
  gp4: writeGp4,
  gp3: writeGp3,
  gp: writeGp7,
};

/**
 * Encode a song as a Guitar Pro file. GP5 is "FICHIER GUITAR PRO v5.10", GP4 "v4.06", GP3 "v3.00"; 'gp' is a
 * Guitar Pro 7 file (a zip holding a GPIF document) that Guitar Pro 7 and 8 open.
 *
 * Any song (read from GP1–GP8 or edited) can be written; what the format cannot hold is left out or
 * clamped: voices beyond the second (GP3/GP4: joined into one), strings beyond the seventh, frets above 99, …
 * (GP3–GP5); per-note dynamics and beat effects of a voice, channel names and effects, marker colours … ('gp').
 *
 * @throws RangeError when the song has no measure or no track
 */
export function writeSong(song: Song, format: WritableFormat = 'gp5'): Uint8Array {
  return WRITERS[format](song);
}
