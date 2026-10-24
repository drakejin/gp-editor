import { describe, expect, it } from 'vitest';
import type { Song } from '../src/model/song';
import type { BeatAddress } from '../src/edit/addresses';
import { moveNotesToVoice } from '../src/edit/voice-moves';
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
