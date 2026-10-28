// Public surface of the Guitar Pro writers.
import type { Song } from '../model/song';
import { writeGp3, writeGp4 } from './gp34-writer';
import { writeGp5 } from './gp5-writer';
import { writeGp7 } from './gpif/gp7-writer';

export type WritableFormat = 'gp5' | 'gp4' | 'gp3' | 'gp';

export interface WriteOptions {
  /**
   * The bytes of the song's audio track file (`AudioTrack.assetId`'s data, as readSongFile returns it): a 'gp' file
   * embeds it with the audio track. Without it, or in GP3/GP4/GP5, the audio track is left out.
   */
  readonly audioTrackData?: Uint8Array;
}

const WRITERS: Readonly<Record<WritableFormat, (song: Song, options: WriteOptions) => Uint8Array>> = {
  gp5: (song) => writeGp5(withoutAudioTrack(song)),
  gp4: (song) => writeGp4(withoutAudioTrack(song)),
  gp3: (song) => writeGp3(withoutAudioTrack(song)),
  gp: (song, options) => writeGp7(song, options.audioTrackData),
};

function withoutAudioTrack(song: Song): Song {
  if (song.audioTrack === undefined) {
    return song;
  }
  const { audioTrack: _audioTrack, ...rest } = song;
  return rest;
}

/**
 * Encode a song as a Guitar Pro file. GP5 is "FICHIER GUITAR PRO v5.10", GP4 "v4.06", GP3 "v3.00"; 'gp' is a
 * Guitar Pro 7 file (a zip holding a GPIF document) that Guitar Pro 7 and 8 open.
 *
 * Any song (read from GP1–GP8 or edited) can be written; what the format cannot hold is left out or
 * clamped: voices beyond the second (GP3/GP4: joined into one), strings beyond the seventh, frets above 99, …
 * (GP3–GP5); per-note dynamics and beat effects of a voice, channel names and effects, marker colours … ('gp').
 * Only 'gp' keeps an audio track, with its file given as `options.audioTrackData`.
 *
 * @throws RangeError when the song has no measure or no track
 */
export function writeSong(song: Song, format: WritableFormat = 'gp5', options: WriteOptions = {}): Uint8Array {
  return WRITERS[format](song, options);
}
