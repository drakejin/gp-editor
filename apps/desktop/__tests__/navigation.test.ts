import { adjacentNote, noteAddresses } from '../src/lib/navigation';
import { beat, makeSong, note } from '../test-support/songs';

describe('navigation', () => {
  const song = makeSong([[beat(960, [note(3, 0), note(1, 2)]), beat(1920, [note(6, 5)])]]);

  it('lists notes beat by beat, high string first', () => {
    expect(noteAddresses(song, 0).map((a) => `${a.beatIndex}:${a.noteIndex}`)).toEqual(['0:1', '0:0', '1:0']);
    expect(noteAddresses(song, 4)).toEqual([]);
  });

  it('moves to the adjacent note and stops at the ends', () => {
    const first = adjacentNote(song, 0, undefined, 1);
    expect(first).toMatchObject({ beatIndex: 0, noteIndex: 1 });
    expect(adjacentNote(song, 0, first, -1)).toEqual(first);
    expect(adjacentNote(song, 0, first, 1)).toMatchObject({ beatIndex: 0, noteIndex: 0 });
    expect(adjacentNote(song, 0, { trackIndex: 0, measureIndex: 9, beatIndex: 0, voiceIndex: 0, noteIndex: 0 }, 1)).toEqual(first);
  });
});
