import { describe, expect, it } from 'vitest';
import type { Song } from '../src/model/song';
import { type BeatAddress, findNote } from '../src/edit/addresses';
import { deleteRunNotes } from '../src/edit/run-notes';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';

/** Four quarters on string 1, the second a chord with string 6. */
const quarters = (): EventSpec[] => [play(4, n(1, 0)), play(4, n(1, 2), n(6, 3)), play(4, n(1, 3)), play(4, n(1, 5))];
const twoBars = (voice2: EventSpec[] = []): Song => deepFreeze(buildSong({ tracks: [[[quarters(), voice2], [quarters()]]] }));
const tied = { ...n(1, 2), isTied: true };

const at = (measureIndex: number, beatIndex: number, voiceIndex = 0): BeatAddress => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex });

describe('deleteRunNotes', () => {
  it('turns every beat of a run across a bar line into a rest of the same length', () => {
    // Act: from bar 1's third beat to bar 2's second
    const deleted = deleteRunNotes(twoBars(), at(0, 2), at(1, 1));

    // Assert
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(['0:4:1/0', '960:4:1/2,6/3', '1920:4:r', '2880:4:r']);
    expect(voiceLayout(deleted, 0, 1, 0)).toEqual(['0:4:r', '960:4:r', '1920:4:1/3', '2880:4:1/5']);
    assertEditInvariants(deleted);
  });

  it('takes the run in either order', () => {
    const song = twoBars();
    expect(deleteRunNotes(song, at(1, 1), at(0, 2))).toEqual(deleteRunNotes(song, at(0, 2), at(1, 1)));
  });

  it('keeps the beats, so the bar keeps its beat count and the bars after it stay as they were', () => {
    // Arrange
    const song = twoBars();

    // Act
    const deleted = deleteRunNotes(song, at(0, 0), at(0, 3));

    // Assert
    expect(deleted.tracks[0]?.measures[0]?.beats).toHaveLength(4);
    expect(deleted.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
  });

  it('deletes only the run’s voice, the other voice playing on', () => {
    // Arrange: voice 2 holds a whole note under bar 1
    const song = twoBars([play(1, n(5, 7))]);

    // Act
    const deleted = deleteRunNotes(song, at(0, 0), at(0, 3));

    // Assert
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(['0:4:r', '960:4:r', '1920:4:r', '2880:4:r']);
    expect(voiceLayout(deleted, 0, 0, 1)).toEqual(['0:1:5/7']);
  });

  it('deletes voice 2’s notes when the run is in voice 2, voice 1 staying', () => {
    // Arrange
    const song = twoBars([play(2, n(5, 7)), play(2, n(4, 9))]);

    // Act: the run's beats hold voice 2's events at beats 0 and 2
    const deleted = deleteRunNotes(song, at(0, 0, 1), at(0, 3, 1));

    // Assert
    expect(voiceLayout(deleted, 0, 0, 1)).toEqual(['0:2:r', '1920:2:r']);
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
  });

  it('unties the note after the run that was tied to a deleted note, in the next bar too', () => {
    // Arrange: bar 1 ends on 1/2, bar 2 starts with it tied
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 0)), play(4, n(1, 0)), play(4, n(1, 2))]], [[play(4, tied), play(4, tied), play(2, n(1, 5))]]]] }));

    // Act: bar 1's last beat goes
    const deleted = deleteRunNotes(song, at(0, 3), at(0, 3));

    // Assert: bar 2's first note sounds again; the second still continues it
    expect(findNote(deleted, { ...at(1, 0), string: 1 })?.isTied).toBe(false);
    expect(findNote(deleted, { ...at(1, 1), string: 1 })?.isTied).toBe(true);
    assertEditInvariants(deleted);
  });

  it('leaves a tie it did not break: one on a string the run had no note on', () => {
    // Arrange: the beat after the run is tied on string 6, which the run's last beat never played
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 2)), play(4, { ...n(6, 3), isTied: true }), rest(4)]]]] }));

    // Act
    const deleted = deleteRunNotes(song, at(0, 1), at(0, 1));

    // Assert
    expect(findNote(deleted, { ...at(0, 2), string: 6 })?.isTied).toBe(true);
  });

  it('keeps the ties of notes before the run', () => {
    // Arrange: 1/2, 1/2 tied, then two more quarters
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 2)), play(4, tied), play(4, n(1, 3)), play(4, n(1, 5))]]]] }));

    // Act
    const deleted = deleteRunNotes(song, at(0, 2), at(0, 3));

    // Assert
    expect(findNote(deleted, { ...at(0, 1), string: 1 })?.isTied).toBe(true);
  });

  it('deletes only the notes on the given strings, a chord keeping its others (D on one note)', () => {
    // Act: string 6 of the second beat's chord
    const deleted = deleteRunNotes(twoBars(), at(0, 1), at(0, 1), [6]);

    // Assert
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(['0:4:1/0', '960:4:1/2', '1920:4:1/3', '2880:4:1/5']);
    expect(deleteRunNotes(twoBars(), at(0, 0), at(0, 0), [1])).toEqual(deleteRunNotes(twoBars(), at(0, 0), at(0, 0)));
  });

  it('unties the note tied to a single deleted note, as over a run', () => {
    // Arrange: 1/2, then 1/2 tied, then 1/5
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 2)), play(4, tied), play(2, n(1, 5))]]]] }));

    // Act
    const deleted = deleteRunNotes(song, at(0, 0), at(0, 0), [1]);

    // Assert
    expect(voiceLayout(deleted, 0, 0, 0)).toEqual(['0:4:r', '960:4:1/2', '1920:2:1/5']);
    expect(findNote(deleted, { ...at(0, 1), string: 1 })?.isTied).toBe(false);
  });

  it('returns the same song for a run of rests, an empty voice slot, a missing track or beats', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[rest(2), rest(2)]], [quarters()]]] }));

    // Act / Assert
    expect(deleteRunNotes(song, at(0, 0), at(0, 1))).toBe(song);
    // Voices 3–4 of beats read from GP3–GP5 have no slot
    expect(deleteRunNotes(song, at(1, 0, 2), at(1, 3, 2))).toBe(song);
    expect(deleteRunNotes(song, { ...at(0, 0), trackIndex: 3 }, { ...at(0, 1), trackIndex: 3 })).toBe(song);
    expect(deleteRunNotes(song, at(5, 0), at(6, 0))).toBe(song);
    // No note on the given string
    expect(deleteRunNotes(song, at(1, 0), at(1, 0), [4])).toBe(song);
  });
});
