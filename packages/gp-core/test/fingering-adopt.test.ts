import { describe, expect, it } from 'vitest';
import { type FingeringAdoption, adoptFingering } from '../src/fingering/adopt';
import { EMPTY_NOTE_EFFECT, STANDARD_TUNING } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { songOnStrings } from './helpers/tuning-songs';

const SONG = { kind: 'song' } as const;

function tied(note: Note): Note {
  return { ...note, isTied: true };
}

/** Four quarter notes on string 3: C4 D4 E4 F4 at frets 5, 7, 9, 10. */
const LINE = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 5)), play(4, n(3, 7)), play(4, n(3, 9)), play(4, n(3, 10))]]]);

describe('adoptFingering: Claude’s positions, checked note by note', () => {
  it('takes every position that keeps the pitch and the rhythm', () => {
    // Arrange: the same line on string 2 (frets 1, 3, 5, 6).
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 1)), play(4, n(2, 3)), play(4, n(2, 5)), play(4, n(2, 6))]]]);

    // Act
    const result = adoptFingering(deepFreeze(LINE), proposal, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:2/1', '960:4:2/3', '1920:4:2/5', '2880:4:2/6']);
    expect(result).toMatchObject({ suggested: 4, taken: 4, rejected: 0 });
  });

  it('rejects a note whose pitch differs and keeps its own position', () => {
    // Arrange: the third note one semitone off (fret 6 = D#4 instead of E4).
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 1)), play(4, n(2, 3)), play(4, n(2, 4)), play(4, n(2, 6))]]]);

    // Act
    const result = adoptFingering(LINE, proposal, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:2/1', '960:4:2/3', '1920:4:3/9', '2880:4:2/6']);
    expect(result).toMatchObject({ suggested: 3, taken: 3, rejected: 1 });
  });

  it('rejects notes whose rhythm differs', () => {
    // Arrange: the first two notes as eighths.
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(8, n(2, 1)), play(8, n(2, 3)), rest(4), play(4, n(2, 5)), play(4, n(2, 6))]]]);

    // Act
    const result = adoptFingering(LINE, proposal, SONG);

    // Assert: the last two notes start and last as before; the first two do not.
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:3/5', '960:4:3/7', '1920:4:2/5', '2880:4:2/6']);
    expect(result).toMatchObject({ suggested: 2, taken: 2, rejected: 2 });
  });

  it('does not take a position that would cut a tie off its note', () => {
    // Arrange: a tied E4 on string 2; Claude moves only the first half to string 1.
    const song = songOnStrings(STANDARD_TUNING, [[[play(2, n(2, 5)), play(2, tied(n(2, 5)))]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(2, n(1, 0)), play(2, tied(n(2, 5)))]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(result.song).toBe(song);
    expect(result).toMatchObject({ suggested: 1, taken: 0, rejected: 0, notTaken: { linked: 1 } });
  });

  it('does not take a position on a string another voice still sounds', () => {
    // Arrange: voice 2 holds B3 on the open B string; Claude puts voice 1's E4 at its 5th fret.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 5)), play(4, n(1, 0)), rest(2)], [play(2, n(2, 0)), rest(2)]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 5)), play(4, n(2, 5)), rest(2)], [play(2, n(2, 0)), rest(2)]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(result.song).toBe(song);
    expect(result).toMatchObject({ suggested: 1, taken: 0, notTaken: { occupied: 1 } });
  });

  it('does not take a position between a hammer-on and the note it leads to on their string', () => {
    // Arrange: E3 hammers on to F#3 on the D string; Claude puts the A3 between them on the D string too.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, { ...n(4, 2), effect: { ...EMPTY_NOTE_EFFECT, hammer: true } }), play(4, n(3, 2)), play(4, n(4, 4)), rest(4)]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(4, 2)), play(4, n(4, 7)), play(4, n(4, 4)), rest(4)]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(result.song).toBe(song);
    expect(result).toMatchObject({ suggested: 1, taken: 0, notTaken: { occupied: 1 } });
  });

  it('changes nothing outside the scope', () => {
    // Arrange: only beats 3–4 are selected.
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 1)), play(4, n(2, 3)), play(4, n(2, 5)), play(4, n(2, 6))]]]);
    const scope = { kind: 'beats', from: { trackIndex: 0, measureIndex: 0, beatIndex: 2, voiceIndex: 0 }, to: { trackIndex: 0, measureIndex: 0, beatIndex: 3, voiceIndex: 0 } } as const;

    // Act
    const result = adoptFingering(LINE, proposal, scope);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:3/5', '960:4:3/7', '1920:4:2/5', '2880:4:2/6']);
    expect(result).toMatchObject({ suggested: 2, taken: 2, rejected: 0 });
  });

  it('keeps the note’s effects and moves its grace note’s fret with it', () => {
    // Arrange
    const grace = { fret: 7, duration: 3, velocity: 95, transition: 'slide' as const, onBeat: false, isDead: false };
    const song: Song = songOnStrings(STANDARD_TUNING, [[[play(1, { ...n(3, 9), effect: { ...EMPTY_NOTE_EFFECT, grace, palmMute: true } })]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[{ duration: dur(1), notes: [n(2, 5)] }]]]);

    // Act
    const note = adoptFingering(song, proposal, SONG).song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0];

    // Assert
    expect(note).toMatchObject({ string: 2, fret: 5, effect: { palmMute: true, grace: { fret: 3 } } });
  });
});

/** Suggested = taken + every reason a suggestion was not. */
function isAccounted(result: FingeringAdoption): boolean {
  return result.suggested === result.taken + Object.values(result.notTaken).reduce((sum, count) => sum + count, 0);
}

describe('adoptFingering: shapes moved together', () => {
  it('takes a chord moved down a string whole, whatever order its notes come in', () => {
    // Arrange: E3 and A2 (D string 2nd fret, open A) → A string 7th fret and low E 5th fret.
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(4, 2), n(5, 0))]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(1, n(5, 7), n(6, 5))]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:1:5/7,6/5']);
    expect(result).toMatchObject({ suggested: 2, taken: 2 });
    expect(isAccounted(result)).toBe(true);
  });

  it('takes a three-note shape moved whole, which no one of its notes could take alone within the hand’s span', () => {
    // Arrange: A3, E3, B2 at the 2nd fret of strings 3–5 → the 7th fret of strings 4–6.
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(3, 2), n(4, 2), n(5, 2))]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(1, n(4, 7), n(5, 7), n(6, 7))]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:1:4/7,5/7,6/7']);
    expect(result).toMatchObject({ suggested: 3, taken: 3 });
  });

  it('takes a position once the note holding its string has moved on, in a later beat', () => {
    // Arrange: beat 1's E4 moves from string 2 to string 1 only after beat 2's... (a tied B3 holds string 1? no:) —
    // a half-note A4 on string 1 (fret 5) moves to string 2 (fret 10), freeing string 1 for the E4 struck under it.
    const song = songOnStrings(STANDARD_TUNING, [[[play(2, n(1, 5)), rest(2)], [play(4, n(3, 9)), play(4, n(2, 5)), rest(2)]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(2, n(2, 10)), rest(2)], [play(4, n(3, 9)), play(4, n(1, 0)), rest(2)]]]);

    // Act
    const result = adoptFingering(song, proposal, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:2:2/10', '1920:2:r']);
    expect(voiceLayout(result.song, 0, 0, 1)).toEqual(['0:4:3/9', '960:4:1/0', '1920:2:r']);
    expect(result).toMatchObject({ suggested: 2, taken: 2 });
  });
});

describe('adoptFingering: harder positions', () => {
  it('refuses, when asked to, a track’s positions that make it harder to play, and says so', () => {
    // Arrange: E4 on the open E string, four times; Claude puts them at the 5th and 9th frets.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0)), play(4, n(1, 0)), play(4, n(1, 0)), play(4, n(1, 0))]]]);
    const proposal = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 5)), play(4, n(3, 9)), play(4, n(2, 5)), play(4, n(3, 9))]]]);

    // Act
    const guarded = adoptFingering(song, proposal, SONG, { refusesHarder: true });
    const unguarded = adoptFingering(song, proposal, SONG);

    // Assert
    expect(guarded.song).toBe(song);
    expect(guarded).toMatchObject({ suggested: 4, taken: 0, notTaken: { harder: 4 } });
    expect(isAccounted(guarded)).toBe(true);
    expect(unguarded.taken).toBe(4);
  });

  it('takes, when asked to, positions that make the track easier', () => {
    expect(adoptFingering(LINE, songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 1)), play(4, n(2, 3)), play(4, n(2, 5)), play(4, n(2, 6))]]]), SONG, { refusesHarder: true })).toMatchObject({
      taken: 4,
      notTaken: { harder: 0 },
    });
  });
});

describe('adoptFingering: a long song', () => {
  it('checks 25,600 suggested positions in well under a second', () => {
    // Arrange: 1,600 bars of sixteenth-note E4s at the 5th fret of string 2; Claude puts them all on the open E string.
    const bar = (string: number, fret: number) => [Array.from({ length: 16 }, () => play(16, n(string, fret)))];
    const song = songOnStrings(STANDARD_TUNING, Array.from({ length: 1600 }, () => bar(2, 5)));
    const proposal = songOnStrings(STANDARD_TUNING, Array.from({ length: 1600 }, () => bar(1, 0)));

    // Act
    const started = performance.now();
    const result = adoptFingering(song, proposal, SONG);
    const elapsed = performance.now() - started;

    // Assert
    expect(result.taken).toBe(25600);
    expect(elapsed).toBeLessThan(1000);
  });
});
