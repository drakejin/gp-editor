import type { Note, Song } from '@gp-editor/core';

/** Every note of one beat of a track, all voices. */
export function beatNotes(song: Song, trackIndex: number, measureIndex: number, beatIndex: number): readonly Note[] {
  return song.tracks[trackIndex]?.measures[measureIndex]?.beats[beatIndex]?.voices.flatMap((voice) => voice.notes) ?? [];
}
