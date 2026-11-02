import { channelProgramOf, resolveTrackInstrument } from '../edit/tuning-presets';
import type { Song } from '../model/song';
import type { TranscribedInstrument } from '../transcription/types';

/** The General MIDI program a track's channel plays; a steel guitar for a track without a channel. */
export function trackProgramOf(song: Song, trackIndex: number): number {
  return channelProgramOf(song.channels, song.tracks[trackIndex]?.channelId);
}

/**
 * An existing track as the PDF import's contract names an instrument, so a model reads and writes its notes as the
 * contract says (tab for the fretted ones, sounding pitches for the others, drum names for drums): what the track is
 * (resolveTrackInstrument), drums for percussion. Undefined for a track the song does not have.
 */
export function trackInstrumentOf(song: Song, trackIndex: number): TranscribedInstrument | undefined {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return undefined;
  }
  const instrument = resolveTrackInstrument(track, song.channels);
  return instrument === 'percussion' ? 'drums' : instrument;
}
