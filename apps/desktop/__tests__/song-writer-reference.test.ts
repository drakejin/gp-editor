import { describeReference } from '../src/song-writer/reference';
import { beat, makeSong, note } from '../test-support/songs';

describe('describeReference', () => {
  it('describes the shown track’s bars that have notes: durations, sounding pitches and tab positions', () => {
    // Arrange: bar 1 empty, bar 2 with E4 (string 1 open) then a B3–E4 dyad
    const song = makeSong([[], [beat(4800, [note(1, 0)]), beat(5760, [note(2, 0), note(1, 0)])]]);

    // Act
    const text = describeReference(song, 0) ?? '';

    // Assert
    expect(text).toContain('Bar 2: q:E4@1/0 q:B3@2/0,E4@1/0');
    expect(text).not.toContain('Bar 1:');
  });

  it('has nothing to say about a track without notes', () => {
    expect(describeReference(makeSong([[]]), 0)).toBeUndefined();
  });

  it('keeps to a few bars of a long track', () => {
    const song = makeSong(Array.from({ length: 40 }, (_, index) => [beat(960 + index * 3840, [note(1, index % 12)])]));
    const text = describeReference(song, 0) ?? '';
    expect(text.match(/^Bar /gm)).toHaveLength(16);
  });
});
