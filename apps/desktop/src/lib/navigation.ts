import type { NoteAddress, Song } from '@gp-editor/core';

/** Every note address of one track, in score order (measure, beat, voice, string order within the beat). */
export function noteAddresses(song: Song, trackIndex: number): NoteAddress[] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  return track.measures.flatMap((measure, measureIndex) =>
    measure.beats.flatMap((beat, beatIndex) =>
      beat.voices.flatMap((voice, voiceIndex) =>
        voice.notes
          .map((note, noteIndex) => ({ note, noteIndex }))
          .sort((a, b) => a.note.string - b.note.string)
          .map(({ noteIndex }) => ({ track: trackIndex, measure: measureIndex, beat: beatIndex, voice: voiceIndex, note: noteIndex })),
      ),
    ),
  );
}

function sameAddress(a: NoteAddress, b: NoteAddress): boolean {
  return a.track === b.track && a.measure === b.measure && a.beat === b.beat && a.voice === b.voice && a.note === b.note;
}

/** The note before (-1) or after (+1) `from`; the first note when nothing is selected. */
export function adjacentNote(song: Song, trackIndex: number, from: NoteAddress | undefined, step: -1 | 1): NoteAddress | undefined {
  const addresses = noteAddresses(song, trackIndex);
  if (from === undefined) {
    return addresses[0];
  }
  const index = addresses.findIndex((address) => sameAddress(address, from));
  if (index < 0) {
    return addresses[0];
  }
  return addresses[Math.min(addresses.length - 1, Math.max(0, index + step))];
}
