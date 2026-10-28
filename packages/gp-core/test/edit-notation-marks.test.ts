import { describe, expect, it } from 'vitest';
import type { BeatAddress, StringAddress } from '../src/edit/addresses';
import { setTimeSignature } from '../src/edit/measure-headers';
import {
  setBeamGrouping,
  setNoteAccidentalDisplay,
  setNoteFinger,
  setTrackSlashNotation,
  setVoiceBeamToNext,
  setVoiceSlashed,
} from '../src/edit/notation-marks';
import { presetBeamGrouping } from '../src/model/beaming';
import type { AccidentalDisplay, BeamLink, Finger, Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

const AT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };
const ON_NOTE: StringAddress = { ...AT, string: 2 };

/** Bar 1: a chord on strings 1 and 2, then a rest; bars 2–4 rests; bar 4 in 3/4. */
function makeSong(): Song {
  return deepFreeze(
    buildSong({
      timeSignatures: [{ numerator: 4, denominator: 4 }, { numerator: 4, denominator: 4 }, { numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }],
      tracks: [[[[play(2, n(1, 0), n(2, 1)), rest(2)]], [[rest(1)]], [[rest(1)]], [[rest(2), rest(4)]]]],
    }),
  );
}

const noteOf = (song: Song, string = 2) => song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.find((note) => note.string === string);
const voiceOf = (song: Song, beatIndex = 0) => song.tracks[0]?.measures[0]?.beats[beatIndex]?.voices[0];

describe('setNoteFinger', () => {
  it('sets and clears a finger of either hand on the addressed note only', () => {
    // Arrange
    const song = makeSong();

    // Act
    const left = setNoteFinger(song, ON_NOTE, 'left', 'middle');
    const both = setNoteFinger(left, ON_NOTE, 'right', 'annular');
    const cleared = setNoteFinger(both, ON_NOTE, 'left', undefined);

    // Assert
    expect(noteOf(left)).toMatchObject({ leftFinger: 'middle' });
    expect(noteOf(both)).toMatchObject({ leftFinger: 'middle', rightFinger: 'annular' });
    expect(noteOf(cleared)).not.toHaveProperty('leftFinger');
    expect(noteOf(cleared)?.rightFinger).toBe('annular');
    expect(noteOf(both, 1)).toBe(noteOf(song, 1));
  });

  it('returns the same song for the same finger, an unknown one, or no note', () => {
    // Arrange
    const song = setNoteFinger(makeSong(), ON_NOTE, 'right', 'index');

    // Act / Assert
    expect(setNoteFinger(song, ON_NOTE, 'right', 'index')).toBe(song);
    expect(setNoteFinger(song, ON_NOTE, 'right', 'pinky' as Finger)).toBe(song);
    expect(setNoteFinger(song, ON_NOTE, 'middle' as 'left', 'thumb')).toBe(song);
    expect(setNoteFinger(song, { ...ON_NOTE, string: 5 }, 'left', 'thumb')).toBe(song);
  });
});

describe('setNoteAccidentalDisplay', () => {
  it.each<AccidentalDisplay>(['cautionary', 'forced'])('shows the %s accidental and takes it away again', (display) => {
    // Act
    const shown = setNoteAccidentalDisplay(makeSong(), ON_NOTE, display);
    const plain = setNoteAccidentalDisplay(shown, ON_NOTE, undefined);

    // Assert
    expect(noteOf(shown)?.accidentalDisplay).toBe(display);
    expect(noteOf(plain)).not.toHaveProperty('accidentalDisplay');
  });

  it('refuses an unknown display', () => {
    const song = makeSong();
    expect(setNoteAccidentalDisplay(song, ON_NOTE, 'loud' as AccidentalDisplay)).toBe(song);
  });
});

describe('setVoiceSlashed', () => {
  it('writes a beat as a slash and back, on a rest too', () => {
    // Act
    const slashed = setVoiceSlashed(makeSong(), AT, true);
    const restSlashed = setVoiceSlashed(slashed, { ...AT, beatIndex: 1 }, true);
    const plain = setVoiceSlashed(restSlashed, AT, false);

    // Assert
    expect(voiceOf(slashed)?.isSlashed).toBe(true);
    expect(voiceOf(restSlashed, 1)?.isSlashed).toBe(true);
    expect(voiceOf(plain)).not.toHaveProperty('isSlashed');
  });

  it('leaves an empty voice and a missing beat alone', () => {
    const song = makeSong();
    expect(setVoiceSlashed(song, { ...AT, voiceIndex: 1 }, true)).toBe(song);
    expect(setVoiceSlashed(song, { ...AT, beatIndex: 9 }, true)).toBe(song);
    expect(setVoiceSlashed(song, AT, false)).toBe(song);
  });
});

describe('setVoiceBeamToNext', () => {
  it.each<BeamLink>(['break', 'join', 'breakSecondary'])('sets a %s beam to the next beat and clears it', (link) => {
    // Act
    const linked = setVoiceBeamToNext(makeSong(), AT, link);
    const cleared = setVoiceBeamToNext(linked, AT, undefined);

    // Assert
    expect(voiceOf(linked)?.beamToNext).toBe(link);
    expect(voiceOf(cleared)).not.toHaveProperty('beamToNext');
  });

  it('refuses an unknown link and an empty voice', () => {
    const song = makeSong();
    expect(setVoiceBeamToNext(song, AT, 'glue' as BeamLink)).toBe(song);
    expect(setVoiceBeamToNext(song, { ...AT, voiceIndex: 1 }, 'join')).toBe(song);
  });
});

describe('setTrackSlashNotation', () => {
  it('writes the whole track in slashes and back', () => {
    // Act
    const on = setTrackSlashNotation(makeSong(), 0, true);
    const off = setTrackSlashNotation(on, 0, false);

    // Assert
    expect(on.tracks[0]?.hasSlashNotation).toBe(true);
    expect(off.tracks[0]).not.toHaveProperty('hasSlashNotation');
  });

  it('returns the same song for no change or a missing track', () => {
    const song = makeSong();
    expect(setTrackSlashNotation(song, 0, false)).toBe(song);
    expect(setTrackSlashNotation(song, 3, true)).toBe(song);
  });
});

describe('setBeamGrouping', () => {
  it('groups the bar and the bars after it that were grouped alike in the same time signature', () => {
    // Arrange
    const halves = { unit: 8, groups: [4, 4] } as const;

    // Act
    const song = setBeamGrouping(makeSong(), 0, halves);

    // Assert
    expect(song.measureHeaders.map((header) => header.beamGrouping)).toEqual([halves, halves, halves, undefined]);
  });

  it('stops at a bar grouped otherwise', () => {
    // Arrange
    const whole = { unit: 8, groups: [8] } as const;
    const halves = { unit: 8, groups: [4, 4] } as const;
    const grouped = setBeamGrouping(makeSong(), 1, whole);

    // Act
    const song = setBeamGrouping(grouped, 0, halves);

    // Assert
    expect(song.measureHeaders.map((header) => header.beamGrouping)).toEqual([halves, whole, whole, undefined]);
  });

  it('stores the time signature’s own grouping as none', () => {
    // Arrange
    const grouped = setBeamGrouping(makeSong(), 0, { unit: 8, groups: [8] });

    // Act
    const song = setBeamGrouping(grouped, 0, { unit: 16, groups: [4, 4, 4, 4] });

    // Assert
    expect(song.measureHeaders.map((header) => header.beamGrouping)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('refuses groups that do not fill the bar and returns the same song for no change', () => {
    const song = makeSong();
    expect(setBeamGrouping(song, 0, { unit: 8, groups: [3, 3] })).toBe(song);
    expect(setBeamGrouping(song, 0, { unit: 8, groups: [0, 8] })).toBe(song);
    expect(setBeamGrouping(song, 0, undefined)).toBe(song);
    expect(setBeamGrouping(song, 9, { unit: 8, groups: [8] })).toBe(song);
  });

  it('is dropped by a time signature change, which it no longer fits', () => {
    // Arrange
    const grouped = setBeamGrouping(makeSong(), 0, { unit: 8, groups: [8] });

    // Act
    const song = setTimeSignature(grouped, 0, { numerator: 3, denominator: 4 });

    // Assert
    expect(song.measureHeaders[0]).not.toHaveProperty('beamGrouping');
  });
});

describe('presetBeamGrouping', () => {
  it.each([
    ['byBeat', 4, 4, [2, 2, 2, 2]],
    ['byTwoBeats', 4, 4, [4, 4]],
    ['byTwoBeats', 3, 4, [4, 2]],
    ['byTwoBeats', 12, 8, [6, 6]],
    ['byTwoBeats', 7, 8, [4, 3]],
    ['byBar', 6, 8, [6]],
  ] as const)('%s in %i/%i', (preset, numerator, denominator, groups) => {
    // Act
    const grouping = presetBeamGrouping({ numerator, denominator }, preset);

    // Assert
    expect(grouping.groups).toEqual(groups);
  });
});
