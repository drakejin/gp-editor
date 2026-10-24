import { describe, expect, it } from 'vitest';
import type { Song } from '../src/model/song';
import type { BeatAddress } from '../src/edit/addresses';
import { findNote } from '../src/edit/addresses';
import { moveBeatsToVoice, moveNotesToVoice } from '../src/edit/voice-moves';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';

/** Voice 1: four quarters on string 1, the second a chord with string 6. */
const quarters = (): EventSpec[] => [play(4, n(1, 0)), play(4, n(1, 2), n(6, 3)), play(4, n(1, 3)), play(4, n(1, 5))];
const song1 = (voice2: EventSpec[] = []): Song => deepFreeze(buildSong({ tracks: [[[quarters(), voice2]]] }));

const SECOND_BEAT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 };

describe('moveNotesToVoice', () => {
  it('moves a beat’s notes to voice 3, which plays them as long, voice 1 resting there', () => {
    // Act
    const moved = moveNotesToVoice(song1(), SECOND_BEAT, 2);

    // Assert
    expect(voiceLayout(moved, 0, 0, 2)).toEqual(['0:4:r', '960:4:1/2,6/3', '1920:2:r']);
    expect(voiceLayout(moved, 0, 0, 0)).toEqual(['0:4:1/0', '960:4:r', '1920:4:1/3', '2880:4:1/5']);
    assertEditInvariants(moved);
  });

  it('moves only the notes on the given strings, the chord’s other notes staying', () => {
    // Act
    const moved = moveNotesToVoice(song1(), SECOND_BEAT, 1, [6]);

    // Assert
    expect(voiceLayout(moved, 0, 0, 1)).toEqual(['0:4:r', '960:4:6/3', '1920:2:r']);
    expect(voiceLayout(moved, 0, 0, 0)[1]).toBe('960:4:1/2');
    assertEditInvariants(moved);
  });

  it('takes the time from a free rest of the target voice', () => {
    // Act: voice 2 rests for a whole bar
    const moved = moveNotesToVoice(song1([rest(1)]), SECOND_BEAT, 1, [1]);

    // Assert: the whole rest cut around the note
    expect(voiceLayout(moved, 0, 0, 1)).toEqual(['0:4:r', '960:4:1/2', '1920:4:r', '2880:4:r']);
    assertEditInvariants(moved);
  });

  it('joins an event of the same length the target voice plays there', () => {
    // Act: voice 2 plays string 5 on the second quarter
    const moved = moveNotesToVoice(song1([rest(4), play(4, n(5, 7)), rest(2)]), SECOND_BEAT, 1, [1]);

    // Assert
    expect(voiceLayout(moved, 0, 0, 1)).toEqual(['0:4:r', '960:4:1/2,5/7', '1920:2:r']);
  });

  it('moves the notes back where they came from', () => {
    const song = song1();
    const there = moveNotesToVoice(song, SECOND_BEAT, 3);
    const back = moveNotesToVoice(there, { ...SECOND_BEAT, voiceIndex: 3 }, 0);
    expect(voiceLayout(back, 0, 0, 0)).toEqual(voiceLayout(song, 0, 0, 0));
    expect(voiceLayout(back, 0, 0, 3).every((event) => event.endsWith(':r'))).toBe(true);
  });

  it('refuses where the target voice plays something else, or the string is taken', () => {
    const halfNote = song1([play(2, n(5, 7)), rest(2)]);
    expect(moveNotesToVoice(halfNote, SECOND_BEAT, 1)).toBe(halfNote);
    const taken = song1([rest(4), play(4, n(1, 9)), rest(2)]);
    expect(moveNotesToVoice(taken, SECOND_BEAT, 1, [1])).toBe(taken);
  });

  it('refuses the same voice, a voice past the fourth, a rest, a missing beat and strings without notes', () => {
    const song = song1();
    expect(moveNotesToVoice(song, SECOND_BEAT, 0)).toBe(song);
    expect(moveNotesToVoice(song, SECOND_BEAT, 4)).toBe(song);
    expect(moveNotesToVoice(song, { ...SECOND_BEAT, voiceIndex: 1 }, 2)).toBe(song);
    expect(moveNotesToVoice(song, { ...SECOND_BEAT, beatIndex: 9 }, 2)).toBe(song);
    expect(moveNotesToVoice(song, SECOND_BEAT, 2, [4])).toBe(song);
  });
});

describe('moveNotesToVoice and ties', () => {
  const tied = { ...n(1, 2), isTied: true };

  it('unties a moved note whose tie has nothing to continue in its new voice, and the note tied to it that stays', () => {
    // Arrange: voice 1 plays 1/2, then 1/2 tied, then 1/2 tied again
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 2)), play(4, tied), play(4, tied), play(4, n(1, 5))]]]] }));

    // Act: the middle note moves to voice 2
    const moved = moveNotesToVoice(song, SECOND_BEAT, 1);

    // Assert
    expect(findNote(moved, { ...SECOND_BEAT, voiceIndex: 1, string: 1 })?.isTied).toBe(false);
    expect(findNote(moved, { ...SECOND_BEAT, beatIndex: 2, string: 1 })?.isTied).toBe(false);
    assertEditInvariants(moved);
  });

  it('keeps the ties of a tied run moved together', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 2)), play(4, tied), play(4, tied), play(4, n(1, 5))]]]] }));

    // Act
    const moved = moveBeatsToVoice(song, { ...SECOND_BEAT, beatIndex: 0 }, { ...SECOND_BEAT, beatIndex: 2 }, 1);

    // Assert
    expect([1, 2].map((beatIndex) => findNote(moved, { ...SECOND_BEAT, beatIndex, voiceIndex: 1, string: 1 })?.isTied)).toEqual([true, true]);
    expect(voiceLayout(moved, 0, 0, 1)).toEqual(['0:4:1/2', '960:4:1/2', '1920:4:1/2', '2880:4:r']);
  });
});

describe('moveBeatsToVoice', () => {
  it('moves every note of a run of beats across a bar line', () => {
    // Arrange: two bars of quarters
    const song = deepFreeze(buildSong({ tracks: [[[quarters()], [quarters()]]] }));

    // Act: from bar 1's fourth beat to bar 2's first
    const moved = moveBeatsToVoice(song, { ...SECOND_BEAT, beatIndex: 3 }, { ...SECOND_BEAT, measureIndex: 1, beatIndex: 0 }, 2);

    // Assert
    expect(voiceLayout(moved, 0, 0, 2)).toEqual(['0:2.:r', '2880:4:1/5']);
    expect(voiceLayout(moved, 0, 1, 2)).toEqual(['0:4:1/0', '960:2.:r']);
    assertEditInvariants(moved);
  });

  it('moves nothing when one beat of the run cannot move', () => {
    // Arrange: voice 2 plays a half note under the second beat
    const song = song1([rest(4), play(2, n(5, 7)), rest(4)]);

    // Act / Assert
    expect(moveBeatsToVoice(song, { ...SECOND_BEAT, beatIndex: 0 }, { ...SECOND_BEAT, beatIndex: 3 }, 1)).toBe(song);
  });

  it('keeps a slashed beat slashed in its new voice', () => {
    // Arrange
    const song = song1();
    const track = song.tracks[0]!;
    const measure = track.measures[0]!;
    const slashed: Song = {
      ...song,
      tracks: [{ ...track, measures: [{ ...measure, beats: measure.beats.map((beat, i) => (i === 1 ? { ...beat, voices: beat.voices.map((voice, v) => (v === 0 ? { ...voice, isSlashed: true } : voice)) } : beat)) }] }],
    };

    // Act
    const moved = moveNotesToVoice(slashed, SECOND_BEAT, 1);

    // Assert
    expect(moved.tracks[0]?.measures[0]?.beats[1]?.voices[1]?.isSlashed).toBe(true);
  });
});
