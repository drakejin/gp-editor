import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FACTORY_DRUM_KIT } from '../src/formats/common/drum-kit';
import { drumArticulationIndex, drumKitFor } from '../src/write/gpif/drum-kit';
import { writeSong } from '../src/write/index';
import { buildNote, buildSong, buildVoice } from './helpers/write-song-builder';

/** A drum track with kit drums (kick, snare, closed hi-hat, ride bell) and one the factory kit lacks (27). */
const DRUM_SONG = buildSong({
  tracks: [
    {
      isPercussion: true,
      strings: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, tuning: 0 })),
      measures: [[{ voice: buildVoice([buildNote(1, 36), buildNote(2, 38), buildNote(3, 42), buildNote(4, 53), buildNote(5, 27)]) }]],
    },
  ],
});

function scoreDigest(bytes: Uint8Array): string {
  const entry = unzipSync(bytes)['Content/score.gpif'] ?? new Uint8Array();
  return createHash('sha256').update(entry).digest('hex');
}

describe('the factory drum kit in .gp files', () => {
  it('writes the same score.gpif as before the kit moved to formats/common', () => {
    // Arrange: the digest of v0.14.0's output for this song.
    const before = '7cc89b64184ee869d0724ee7865d7676568776add77f117cd7359e17fb4ec9ed';

    // Act
    const digest = scoreDigest(writeSong(DRUM_SONG, 'gp'));

    // Assert
    expect(digest).toBe(before);
  });

  it('is the shared kit, with an "Other" element only for notes it lacks', () => {
    // Arrange / Act
    const kit = drumKitFor([36, 38]);
    const withOther = drumKitFor([36, 27, 27, 28]);

    // Assert
    expect(kit).toBe(FACTORY_DRUM_KIT);
    expect(withOther.slice(0, -1)).toEqual(FACTORY_DRUM_KIT);
    expect(withOther.at(-1)?.articulations.map((articulation) => [articulation.name, articulation.staffLine, articulation.inputMidi])).toEqual([
      ['MIDI 27', 3, 27],
      ['MIDI 28', 3, 28],
    ]);
  });

  it('names a note by the first articulation taking its key', () => {
    // Arrange
    const kit = drumKitFor([27]);

    // Act / Assert
    expect(drumArticulationIndex(kit, 38)).toBe(0);
    expect(drumArticulationIndex(kit, 42)).toBe(3);
    expect(drumArticulationIndex(kit, 27)).toBe(kit.flatMap((element) => element.articulations).length - 1);
    expect(drumArticulationIndex(kit, 200)).toBe(0);
  });
});
