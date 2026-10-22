import { describe, expect, it } from 'vitest';
import { type StringAddress, findNote } from '../src/edit/edit-song';
import { setNoteGrace, setNoteTremoloPicking, setNoteTrill } from '../src/edit/ornaments';
import { EMPTY_NOTE_EFFECT, plainDuration } from '../src/model/defaults';
import type { Duration, Grace, NoteValue, Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

const AT: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };

/** String 1 fret 5 and string 2 fret 7, then a rest. */
function makeSong(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 5), n(2, 7)), rest(4), rest(2)]]]] }));
}

const GRACE: Grace = { fret: 3, duration: 2, velocity: 95, transition: 'hammer', onBeat: false, isDead: false };

describe('setNoteGrace', () => {
  it('sets and clears a grace note, leaving the other note alone', () => {
    // Arrange
    const song = makeSong();

    // Act
    const graced = setNoteGrace(song, AT, GRACE);
    const cleared = setNoteGrace(graced, AT, undefined);

    // Assert
    expect(findNote(graced, AT)?.effect.grace).toEqual(GRACE);
    expect(findNote(graced, { ...AT, string: 2 })).toBe(findNote(song, { ...AT, string: 2 }));
    expect(findNote(cleared, AT)?.effect).toEqual(EMPTY_NOTE_EFFECT);
  });

  it('keeps the grace velocity between ppp and fff, rounded', () => {
    expect(findNote(setNoteGrace(makeSong(), AT, { ...GRACE, velocity: 3 }), AT)?.effect.grace?.velocity).toBe(15);
    expect(findNote(setNoteGrace(makeSong(), AT, { ...GRACE, velocity: 78.7 }), AT)?.effect.grace?.velocity).toBe(79);
  });

  it.each<[string, Partial<Grace>]>([
    ['a fret below 0', { fret: -1 }],
    ['a fret above MAX_FRET', { fret: 30 }],
    ['a fraction of a fret', { fret: 2.5 }],
    ['a duration below 1 (64th)', { duration: 0 }],
    ['a duration above 3 (16th)', { duration: 4 }],
    ['an unknown transition', { transition: 'glide' as Grace['transition'] }],
    ['a velocity that is not a number', { velocity: Number.NaN }],
  ])('refuses %s', (_name, change) => {
    const song = makeSong();
    expect(setNoteGrace(song, AT, { ...GRACE, ...change })).toBe(song);
  });

  it('returns the same song for the same grace note, nothing to clear or a missing note', () => {
    const song = makeSong();
    expect(setNoteGrace(song, AT, undefined)).toBe(song);
    const graced = setNoteGrace(song, AT, GRACE);
    expect(setNoteGrace(graced, AT, { ...GRACE })).toBe(graced);
    expect(setNoteGrace(song, { ...AT, beatIndex: 1 }, GRACE)).toBe(song);
  });
});

describe('setNoteTrill', () => {
  it('sets a trill at a plain note value and clears it', () => {
    // Arrange
    const dotted: Duration = { ...plainDuration(32), dotted: true };

    // Act
    const trilled = setNoteTrill(makeSong(), AT, { fret: 7, duration: dotted });

    // Assert
    expect(findNote(trilled, AT)?.effect.trill).toEqual({ fret: 7, duration: plainDuration(32) });
    expect(findNote(setNoteTrill(trilled, AT, undefined), AT)?.effect.trill).toBeUndefined();
  });

  it('refuses a fret off the neck or a duration that is not a note value', () => {
    const song = makeSong();
    expect(setNoteTrill(song, AT, { fret: 30, duration: plainDuration(16) })).toBe(song);
    expect(setNoteTrill(song, AT, { fret: -2, duration: plainDuration(16) })).toBe(song);
    expect(setNoteTrill(song, AT, { fret: 7, duration: { ...plainDuration(16), value: 12 as NoteValue } })).toBe(song);
  });

  it('returns the same song for the same trill or a missing note', () => {
    const song = makeSong();
    const trilled = setNoteTrill(song, AT, { fret: 7, duration: plainDuration(16) });
    expect(setNoteTrill(trilled, AT, { fret: 7, duration: plainDuration(16) })).toBe(trilled);
    expect(setNoteTrill(song, AT, undefined)).toBe(song);
    expect(setNoteTrill(song, { ...AT, string: 3 }, { fret: 7, duration: plainDuration(16) })).toBe(song);
  });
});

describe('setNoteTremoloPicking', () => {
  it('sets tremolo picking at a plain note value and clears it', () => {
    // Act
    const picked = setNoteTremoloPicking(makeSong(), AT, { duration: { ...plainDuration(16), tuplet: { enters: 3, times: 2 } } });

    // Assert
    expect(findNote(picked, AT)?.effect.tremoloPicking).toEqual({ duration: plainDuration(16) });
    expect(findNote(setNoteTremoloPicking(picked, AT, undefined), AT)?.effect.tremoloPicking).toBeUndefined();
  });

  it('returns the same song for the same speed, a speed that is not a note value or a missing note', () => {
    const song = makeSong();
    const picked = setNoteTremoloPicking(song, AT, { duration: plainDuration(8) });
    expect(setNoteTremoloPicking(picked, AT, { duration: plainDuration(8) })).toBe(picked);
    expect(setNoteTremoloPicking(song, AT, { duration: { ...plainDuration(8), value: 3 as NoteValue } })).toBe(song);
    expect(setNoteTremoloPicking(song, { ...AT, beatIndex: 2 }, { duration: plainDuration(8) })).toBe(song);
  });
});
