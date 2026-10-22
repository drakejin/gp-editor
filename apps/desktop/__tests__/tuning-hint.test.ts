import { type Song, suggestTunings } from '@gp-editor/core';
import { neckTitle, retuneNotice, tuningHint } from '../src/lib/tuning-hint';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

const DROP_D = [64, 59, 55, 50, 45, 38];
const B_STANDARD = [59, 54, 50, 45, 40, 35];
const SEVEN_STRING = [64, 59, 55, 50, 45, 40, 35];

function adviseOn(song: Song) {
  const advice = suggestTunings(song, 0);
  const track = song.tracks[0];
  if (advice === undefined || track === undefined) {
    throw new Error('no track');
  }
  return { advice, track };
}

function hintFor(song: Song) {
  const { advice, track } = adviseOn(song);
  return tuningHint(advice, track);
}

describe('neckTitle', () => {
  it('names the instrument, string count and preset with its notes, lowest string first', () => {
    const { advice, track } = adviseOn(onStrings(makeSong([[beat(960, [note(6, 0)])]]), DROP_D));
    expect(neckTitle(advice, track)).toBe('Guitar · 6 strings · Drop D (D A D G B E)');
  });

  it('shows only the notes of a custom tuning, and the capo', () => {
    const { advice, track } = adviseOn(onStrings(makeSong([[]]), SEVEN_STRING, { offset: 2 }));
    expect(neckTitle(advice, track)).toBe('Guitar · 7 strings · B E A D G B E · capo 2');
  });

  it('calls a bass track a bass', () => {
    const { advice, track } = adviseOn(onStrings(makeSong([[]]), [43, 38, 33, 28], { program: 33 }));
    expect(neckTitle(advice, track)).toBe('Bass · 4 strings · Standard (E A D G)');
  });
});

describe('tuningHint', () => {
  it('has nothing to say when the track is on a preset that plays every note', () => {
    expect(hintFor(onStrings(makeSong([[beat(960, [note(6, 0)])]]), DROP_D))).toBeUndefined();
  });

  it('explains a note below standard tuning and suggests the best three tunings that reach it', () => {
    // Arrange: D2 at fret 3 of a 7-string's low B.
    const song = onStrings(makeSong([[beat(960, [note(7, 3)])]]), SEVEN_STRING);

    // Act
    const hint = hintFor(song);

    // Assert
    expect(hint?.message).toBe("Standard guitar tuning can't play this track (lowest note D2).");
    expect(hint?.lead).toBe('Suggested:');
    expect(hint?.presets.map((preset) => preset.name)).toEqual(['Drop D', 'Drop C♯', 'D standard']);
  });

  it('explains a note past fret 24, offering nothing when the track is already on the closest preset', () => {
    const hint = hintFor(makeSong([[beat(960, [note(1, 26)])]]));
    expect(hint?.message).toBe("Standard guitar tuning can't play this track (highest note F#6).");
    expect(hint?.lead).toBe('No preset plays every note within 24 frets.');
    expect(hint?.presets).toEqual([]);
  });

  it('offers the closest preset when none plays every note', () => {
    // Arrange: a low A1 on the 7th string and an E6 at fret 24: only standard reaches E6, and no preset reaches A1.
    const song = onStrings(makeSong([[beat(960, [note(7, 0)]), beat(1920, [note(1, 24)])]]), [64, 59, 55, 50, 45, 40, 33]);

    // Act
    const hint = hintFor(song);

    // Assert
    expect(hint?.message).toBe("Standard guitar tuning can't play this track (lowest note A1).");
    expect(hint?.lead).toBe('No preset plays every note; the closest leaves 1 note out of reach:');
    expect(hint?.presets.map((preset) => preset.name)).toEqual(['Standard']);
  });

  it('explains notes that need the same string at once', () => {
    // Arrange: E2 and F2 together; standard holds both only on its low E string.
    const song = onStrings(makeSong([[beat(960, [note(6, 0), note(7, 6)])]]), SEVEN_STRING);

    // Act
    const hint = hintFor(song);

    // Assert
    expect(hint?.message).toBe("Standard guitar tuning can't play this track (some notes need the same string at once).");
    expect(hint?.presets.map((preset) => preset.name)).toEqual(['C standard', 'B standard']);
  });

  it('asks to move a custom tuning or string count onto a preset, standard first when it fits', () => {
    const custom = hintFor(onStrings(makeSong([[beat(960, [note(1, 0)])]]), [64, 59, 55, 52, 45, 40]));
    const sevenStrings = hintFor(onStrings(makeSong([[beat(960, [note(1, 0)])]]), SEVEN_STRING));
    expect(custom?.message).toBe("This tuning (E A E G B E) isn't a guitar preset.");
    expect(custom?.presets[0]?.name).toBe('Standard');
    expect(sevenStrings?.message).toBe('This track has 7 strings; the guitar neck has 6.');
  });

  it('says when the current preset cannot reach every note on the neck', () => {
    const hint = hintFor(onStrings(makeSong([[beat(960, [note(1, 25)])]]), B_STANDARD));
    expect(hint?.message).toBe("B standard can't play every note of this track on a 24-fret neck.");
    expect(hint?.presets[0]?.name).toBe('Standard');
  });
});

describe('retuneNotice', () => {
  it('says nothing when every note kept its pitch', () => {
    expect(retuneNotice({ octaveShifted: 0, removed: 0 })).toBeUndefined();
  });

  it('counts notes moved by octaves and notes left out', () => {
    expect(retuneNotice({ octaveShifted: 1, removed: 0 })).toBe('Retuned: 1 note moved by an octave to fit the new tuning. ⌘Z restores the old tuning.');
    expect(retuneNotice({ octaveShifted: 3, removed: 2 })).toBe(
      'Retuned: 3 notes moved by an octave to fit the new tuning; 2 notes left out (more notes at once than strings). ⌘Z restores the old tuning.',
    );
  });
});
