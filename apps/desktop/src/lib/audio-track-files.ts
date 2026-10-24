import { type Song, type SongFile, type WritableFormat, setAudioTrack, writeSong } from '@gp-editor/core';
import { audioData, loadAudioData } from '../native/audio-track';
import { base64ToBytes, bytesToBase64 } from './base64';
import { errorMessage } from './errors';

/** A song as it opens, and what the hint strip says about its audio track. */
export interface LoadedSong {
  readonly song: Song;
  readonly hint?: string;
}

/** A song as it is saved, and what the hint strip says about its audio track. */
export interface WrittenSong {
  readonly bytes: Uint8Array;
  readonly hint?: string;
}

/**
 * A read .gp file whose audio track's file goes to the native side once (the model keeps only its id, the one the
 * native side gives it). When macOS cannot play it, the song opens with its audio track, silent, and the hint says so.
 */
export async function withLoadedAudio(file: SongFile): Promise<LoadedSong> {
  const { song, audioTrackData } = file;
  const track = song.audioTrack;
  if (track === undefined || audioTrackData === undefined) {
    return { song };
  }
  try {
    const info = await loadAudioData(bytesToBase64(audioTrackData), track.fileExtension);
    return { song: setAudioTrack(song, { ...track, assetId: info.assetId }) };
  } catch (error: unknown) {
    return { song, hint: `The audio track's file cannot be played: ${errorMessage(error, 'unknown format')}.` };
  }
}

/** The song's file in `format`: a .gp file embeds the audio track's file, fetched from the native side. */
export async function songBytesFor(song: Song, format: WritableFormat): Promise<WrittenSong> {
  const track = song.audioTrack;
  if (format !== 'gp' || track === undefined) {
    return { bytes: writeSong(song, format) };
  }
  try {
    const audioTrackData = base64ToBytes(await audioData(track.assetId));
    return { bytes: writeSong(song, format, { audioTrackData }) };
  } catch (error: unknown) {
    return { bytes: writeSong(song, format), hint: `The audio track was left out: ${errorMessage(error, 'its file is not loaded')}.` };
  }
}
