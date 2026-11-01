// The tracks easy fingering works on: guitars, basses, ukuleles and banjos — not drums, keyboards, voices or others,
// whose strings only hold their pitches.
import { trackInstrumentOf } from '../composition/track-instrument';
import { type NoteScope, type ScopedTrack, isPercussionTrack, scopedTracks } from '../edit/edit-scope';
import type { Song, Track } from '../model/song';
import { isFrettedInstrument } from '../transcription/instruments';

/** A guitar, bass, ukulele or banjo track: one whose strings are the instrument's. */
function isFrettedTrack(song: Song, trackIndex: number): boolean {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrumentOf(song, trackIndex);
  return track !== undefined && !isPercussionTrack(song, track) && track.strings.length > 0 && instrument !== undefined && isFrettedInstrument(instrument);
}

/** The fretted tracks of a scope, each with its index and its part of the scope. */
export function frettedTracks(song: Song, scope: NoteScope): readonly (readonly [number, Track, ScopedTrack])[] {
  return [...(scopedTracks(song, scope) ?? [])].flatMap(([trackIndex, scoped]) => {
    const track = song.tracks[trackIndex];
    return track !== undefined && isFrettedTrack(song, trackIndex) ? [[trackIndex, track, scoped] as const] : [];
  });
}
