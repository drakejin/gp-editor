import { describe, expect, it } from 'vitest';
import type { StringAddress } from '../src/edit/edit-song';
import { findNote } from '../src/edit/edit-song';
import {
  BEND_PRESETS,
  type BendPresetName,
  TREMOLO_BAR_PRESETS,
  type ToggleableEffect,
  type TremoloBarPresetName,
  buildHarmonic,
  setNoteBend,
  setNoteHarmonic,
  setNoteSlides,
  setNoteTied,
  setNoteTremoloBar,
  setNoteVibrato,
  toggleNoteEffect,
} from '../src/edit/effects';
import { EMPTY_NOTE_EFFECT, vibratoOf } from '../src/model/defaults';
import type { Harmonic, Note, Song, VibratoKind } from '../src/model/song';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

const AT: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };

const TOGGLEABLE: readonly ToggleableEffect[] = [
  'hammer',
  'palmMute',
  'letRing',
  'vibrato',
  'deadNote',
  'ghostNote',
  'accentuatedNote',
  'heavyAccentuatedNote',
  'staccato',
  'tapping',
  'slapping',
  'popping',
  'fadeIn',
];

/** Measure 1: string 1 fret 5 + string 2 fret 7, then a rest, then string 1 fret 9. Measure 2: string 1 fret 3. */
function makeSong(): Song {
  return deepFreeze(
    buildSong({
      tracks: [
        [
          [[play(4, n(1, 5), n(2, 7)), rest(4), play(2, n(1, 9))]],
          [[play(1, n(1, 3), n(3, 0))]],
        ],
        [[[rest(1)]], [[rest(1)]]],
      ],
    }),
  );
}

function withNote(song: Song, at: StringAddress, change: (note: Note) => Note): Song {
  const track = song.tracks[at.trackIndex]!;
  const measures = track.measures.map((measure, measureIndex) =>
    measureIndex !== at.measureIndex
      ? measure
      : {
          ...measure,
          beats: measure.beats.map((beat, beatIndex) =>
            beatIndex !== at.beatIndex
              ? beat
              : { ...beat, voices: beat.voices.map((voice, v) => (v !== at.voiceIndex ? voice : { ...voice, notes: voice.notes.map((note) => (note.string === at.string ? change(note) : note)) })) },
          ),
        },
  );
  return deepFreeze({ ...song, tracks: song.tracks.map((t, i) => (i === at.trackIndex ? { ...t, measures } : t)) });
}

describe('toggleNoteEffect', () => {
  it.each(TOGGLEABLE)('turns %s on, and off again', (effect) => {
    // Arrange
    const song = makeSong();

    // Act
    const on = toggleNoteEffect(song, AT, effect);
    const off = toggleNoteEffect(on, AT, effect);

    // Assert
    expect(findNote(on, AT)?.effect[effect]).toBe(true);
    expect(findNote(off, AT)?.effect).toEqual(EMPTY_NOTE_EFFECT);
    expect(findNote(song, AT)?.effect[effect]).toBe(false);
  });

  it('turns slight vibrato on over a wide vibrato, and off again', () => {
    // Arrange
    const wide = withNote(makeSong(), AT, (note) => ({ ...note, effect: { ...note.effect, wideVibrato: true } }));

    // Act
    const slight = toggleNoteEffect(wide, AT, 'vibrato');
    const off = toggleNoteEffect(slight, AT, 'vibrato');

    // Assert
    expect(findNote(slight, AT)?.effect).toMatchObject({ vibrato: true, wideVibrato: false });
    expect(findNote(off, AT)?.effect).toEqual(EMPTY_NOTE_EFFECT);
  });

  it('unties a note that becomes a dead note', () => {
    const tied = withNote(makeSong(), AT, (note) => ({ ...note, isTied: true }));
    expect(findNote(toggleNoteEffect(tied, AT, 'deadNote'), AT)).toMatchObject({ isTied: false, effect: { deadNote: true } });
  });

  it('keeps tapping, slapping and popping exclusive', () => {
    const tapped = toggleNoteEffect(makeSong(), AT, 'tapping');
    const slapped = toggleNoteEffect(tapped, AT, 'slapping');
    expect(findNote(slapped, AT)?.effect).toMatchObject({ tapping: false, slapping: true, popping: false });
    expect(findNote(toggleNoteEffect(slapped, AT, 'popping'), AT)?.effect).toMatchObject({ tapping: false, slapping: false, popping: true });
  });

  it('changes only the addressed note and shares everything else', () => {
    const song = makeSong();
    const edited = toggleNoteEffect(song, AT, 'vibrato');
    expect(findNote(edited, { ...AT, string: 2 })).toBe(findNote(song, { ...AT, string: 2 }));
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
  });

  it('returns the same song when there is no note at the address', () => {
    const song = makeSong();
    expect(toggleNoteEffect(song, { ...AT, string: 4 }, 'vibrato')).toBe(song);
    expect(toggleNoteEffect(song, { ...AT, beatIndex: 1 }, 'vibrato')).toBe(song);
    expect(toggleNoteEffect(song, { ...AT, trackIndex: 5 }, 'vibrato')).toBe(song);
  });
});

describe('setNoteVibrato', () => {
  it.each([
    ['slight', { vibrato: true, wideVibrato: false }],
    ['wide', { vibrato: false, wideVibrato: true }],
    ['none', { vibrato: false, wideVibrato: false }],
  ] as const)('gives the note %s vibrato, whatever it had', (kind, flags) => {
    // Arrange
    const starts = [makeSong(), setNoteVibrato(makeSong(), AT, 'slight'), setNoteVibrato(makeSong(), AT, 'wide')];

    // Act
    const edited = starts.map((song) => setNoteVibrato(song, AT, kind));

    // Assert
    edited.forEach((song) => expect(findNote(song, AT)?.effect).toEqual({ ...EMPTY_NOTE_EFFECT, ...flags }));
  });

  it('returns the same song for the vibrato the note has, or a missing note', () => {
    // Arrange
    const song = makeSong();
    const wide = setNoteVibrato(song, AT, 'wide');

    // Act / Assert
    expect(setNoteVibrato(song, AT, 'none')).toBe(song);
    expect(setNoteVibrato(wide, AT, 'wide')).toBe(wide);
    expect(setNoteVibrato(song, { ...AT, string: 4 }, 'wide')).toBe(song);
  });
});

describe('vibratoOf', () => {
  it.each([
    [{ vibrato: false, wideVibrato: false }, 'none'],
    [{ vibrato: true, wideVibrato: false }, 'slight'],
    [{ vibrato: false, wideVibrato: true }, 'wide'],
  ] as const)('reads %o as %s', (flags, kind) => {
    // Act
    const read: VibratoKind = vibratoOf({ ...EMPTY_NOTE_EFFECT, ...flags });

    // Assert
    expect(read).toBe(kind);
  });
});

describe('setNoteTied', () => {
  const SECOND_MEASURE: StringAddress = { ...AT, measureIndex: 1 };

  it('ties a note to the previous note on its string, taking its fret', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setNoteTied(song, SECOND_MEASURE, true);

    // Assert
    expect(findNote(edited, SECOND_MEASURE)).toMatchObject({ isTied: true, fret: 9 });
  });

  it('looks back only to the previous event of the same voice', () => {
    const song = makeSong();
    expect(setNoteTied(song, { ...AT, beatIndex: 2 }, true)).toBe(song);
    expect(setNoteTied(song, AT, true)).toBe(song);
    expect(setNoteTied(song, { ...SECOND_MEASURE, string: 3 }, true)).toBe(song);
  });

  it('adds a tied note on an empty string of a played beat or a rest', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(2, 7)), play(4, n(1, 0)), rest(2)]]]] }));
    const onPlayedBeat: StringAddress = { ...AT, beatIndex: 1, string: 2 };

    // Act
    const added = setNoteTied(song, onPlayedBeat, true);
    const onRest = setNoteTied(added, { ...AT, beatIndex: 2, string: 1 }, true);

    // Assert
    expect(findNote(added, onPlayedBeat)).toMatchObject({ string: 2, fret: 7, isTied: true, velocity: 95 });
    expect(added.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes.map((note) => note.string)).toEqual([1, 2]);
    expect(onRest.tracks[0]?.measures[0]?.beats[2]?.voices[0]).toMatchObject({ isEmpty: false, notes: [{ string: 1, fret: 0, isTied: true }] });
  });

  it('copies the harmonic of the previous note and clears a dead note', () => {
    const harmonic: Harmonic = { type: 'natural', data: 0 };
    const song = withNote(withNote(makeSong(), { ...AT, beatIndex: 2 }, (note) => ({ ...note, effect: { ...note.effect, harmonic } })), SECOND_MEASURE, (note) => ({
      ...note,
      effect: { ...note.effect, deadNote: true },
    }));
    const tied = findNote(setNoteTied(song, SECOND_MEASURE, true), SECOND_MEASURE);
    expect(tied?.effect).toMatchObject({ harmonic, deadNote: false });
  });

  it('unties a note and keeps its fret', () => {
    const song = setNoteTied(makeSong(), SECOND_MEASURE, true);
    expect(findNote(setNoteTied(song, SECOND_MEASURE, false), SECOND_MEASURE)).toMatchObject({ isTied: false, fret: 9 });
  });

  it('returns the same song when nothing changes or there is nothing to change', () => {
    const song = makeSong();
    expect(setNoteTied(song, SECOND_MEASURE, false)).toBe(song);
    const tied = setNoteTied(song, SECOND_MEASURE, true);
    expect(setNoteTied(tied, SECOND_MEASURE, true)).toBe(tied);
    expect(setNoteTied(song, { ...AT, beatIndex: 1, string: 3 }, true)).toBe(song);
    expect(setNoteTied(song, { ...AT, beatIndex: 9 }, true)).toBe(song);
    expect(setNoteTied(song, { ...SECOND_MEASURE, string: 7 }, true)).toBe(song);
    expect(setNoteTied(song, { ...SECOND_MEASURE, voiceIndex: 1 }, true)).toBe(song);
  });
});

describe('setNoteSlides', () => {
  it('sets the slides, without duplicates, in a fixed order', () => {
    const edited = setNoteSlides(makeSong(), AT, ['outDownwards', 'shift', 'shift']);
    expect(findNote(edited, AT)?.effect.slides).toEqual(['shift', 'outDownwards']);
  });

  it('clears the slides with an empty list', () => {
    const slid = setNoteSlides(makeSong(), AT, ['legato']);
    expect(findNote(setNoteSlides(slid, AT, []), AT)?.effect.slides).toEqual([]);
  });

  it('returns the same song for the same slides or a missing note', () => {
    const song = makeSong();
    expect(setNoteSlides(song, AT, [])).toBe(song);
    const slid = setNoteSlides(song, AT, ['legato', 'intoFromBelow']);
    expect(setNoteSlides(slid, AT, ['intoFromBelow', 'legato'])).toBe(slid);
    expect(setNoteSlides(song, { ...AT, string: 5 }, ['legato'])).toBe(song);
  });
});

describe('setNoteBend', () => {
  it('offers the usual Guitar Pro bends in quarter tones', () => {
    expect(BEND_PRESETS.half.points).toEqual([{ position: 0, value: 0 }, { position: 6, value: 2 }, { position: 12, value: 2 }]);
    expect(BEND_PRESETS.full.points).toEqual([{ position: 0, value: 0 }, { position: 6, value: 4 }, { position: 12, value: 4 }]);
    expect(BEND_PRESETS.bendRelease.points.map((point) => point.value)).toEqual([0, 4, 4, 0, 0]);
    expect(BEND_PRESETS.preBend.points).toEqual([{ position: 0, value: 4 }, { position: 12, value: 4 }]);
  });

  it('sets and clears a bend', () => {
    const bent = setNoteBend(makeSong(), AT, BEND_PRESETS.full);
    expect(findNote(bent, AT)?.effect.bend).toEqual(BEND_PRESETS.full);
    expect(findNote(setNoteBend(bent, AT, undefined), AT)?.effect.bend).toBeUndefined();
  });

  it('sorts the points and keeps them on the 0…12 grid', () => {
    const bent = setNoteBend(makeSong(), AT, { points: [{ position: 14, value: 30 }, { position: -1, value: -2 }, { position: 5.6, value: 2.4 }] });
    expect(findNote(bent, AT)?.effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: 2 },
      { position: 12, value: 12 },
    ]);
  });

  it('clears the bend when it has no points', () => {
    const bent = setNoteBend(makeSong(), AT, BEND_PRESETS.half);
    expect(findNote(setNoteBend(bent, AT, { points: [] }), AT)?.effect.bend).toBeUndefined();
  });

  it('returns the same song for the same bend or a missing note', () => {
    const song = makeSong();
    expect(setNoteBend(song, AT, undefined)).toBe(song);
    const bent = setNoteBend(song, AT, BEND_PRESETS.preBend);
    expect(setNoteBend(bent, AT, { points: [...BEND_PRESETS.preBend.points] })).toBe(bent);
    expect(setNoteBend(song, { ...AT, string: 6 }, BEND_PRESETS.full)).toBe(song);
  });
});

describe('bend presets', () => {
  it('adds TuxGuitar’s bend–release–bend and pre-bend–release to the bend presets', () => {
    expect(BEND_PRESETS.bendReleaseBend.points).toEqual([
      { position: 0, value: 0 },
      { position: 2, value: 4 },
      { position: 4, value: 4 },
      { position: 6, value: 0 },
      { position: 8, value: 0 },
      { position: 10, value: 4 },
      { position: 12, value: 4 },
    ]);
    expect(BEND_PRESETS.preBendRelease.points).toEqual([
      { position: 0, value: 4 },
      { position: 4, value: 4 },
      { position: 8, value: 0 },
      { position: 12, value: 0 },
    ]);
  });

  it('names every bend preset, in TuxGuitar’s order', () => {
    const names: readonly BendPresetName[] = ['half', 'full', 'bendRelease', 'bendReleaseBend', 'preBend', 'preBendRelease'];
    expect(Object.keys(BEND_PRESETS)).toEqual(names);
  });

  it('offers TuxGuitar’s tremolo bar presets in quarter tones (its ±2 semitones are ±4 here)', () => {
    // Act
    const curves = Object.entries(TREMOLO_BAR_PRESETS).map(([name, bar]) => [name, bar.points.map((point) => [point.position, point.value])]);

    // Assert
    expect(curves).toEqual([
      ['dip', [[0, 0], [6, -4], [12, 0]]],
      ['dive', [[0, 0], [9, -4], [12, -4]]],
      ['releaseUp', [[0, -4], [9, -4], [12, 0]]],
      ['invertedDip', [[0, 0], [6, 4], [12, 0]]],
      ['return', [[0, 0], [9, 4], [12, 4]]],
      ['releaseDown', [[0, 4], [9, 4], [12, 0]]],
    ]);
    const names: readonly TremoloBarPresetName[] = ['dip', 'dive', 'releaseUp', 'invertedDip', 'return', 'releaseDown'];
    expect(Object.keys(TREMOLO_BAR_PRESETS)).toEqual(names);
  });
});

describe('setNoteTremoloBar', () => {
  it('sets and clears a tremolo bar curve', () => {
    // Arrange
    const song = makeSong();

    // Act
    const dipped = setNoteTremoloBar(song, AT, TREMOLO_BAR_PRESETS.dip);
    const cleared = setNoteTremoloBar(dipped, AT, undefined);

    // Assert
    expect(findNote(dipped, AT)?.effect.tremoloBar).toEqual(TREMOLO_BAR_PRESETS.dip);
    expect(findNote(cleared, AT)?.effect).toEqual(EMPTY_NOTE_EFFECT);
    expect(findNote(song, AT)?.effect.tremoloBar).toBeUndefined();
  });

  it('keeps the points on the 0…12 grid and the values within an octave either way (±24 quarter tones)', () => {
    const edited = setNoteTremoloBar(makeSong(), AT, { points: [{ position: 13, value: 40 }, { position: 0.4, value: -30 }, { position: 6, value: -2.6 }] });
    expect(findNote(edited, AT)?.effect.tremoloBar?.points).toEqual([
      { position: 0, value: -24 },
      { position: 6, value: -3 },
      { position: 12, value: 24 },
    ]);
  });

  it('returns the same song for the same curve, no curve to clear or a missing note', () => {
    const song = makeSong();
    expect(setNoteTremoloBar(song, AT, undefined)).toBe(song);
    expect(setNoteTremoloBar(song, AT, { points: [] })).toBe(song);
    const dived = setNoteTremoloBar(song, AT, TREMOLO_BAR_PRESETS.dive);
    expect(setNoteTremoloBar(dived, AT, { points: [...TREMOLO_BAR_PRESETS.dive.points] })).toBe(dived);
    expect(setNoteTremoloBar(song, { ...AT, string: 6 }, TREMOLO_BAR_PRESETS.dip)).toBe(song);
  });
});

describe('setNoteHarmonic', () => {
  it('sets and clears a harmonic', () => {
    const song = setNoteHarmonic(makeSong(), AT, { type: 'natural', data: 0 });
    expect(findNote(song, AT)?.effect.harmonic).toEqual({ type: 'natural', data: 0 });
    expect(findNote(setNoteHarmonic(song, AT, undefined), AT)?.effect.harmonic).toBeUndefined();
  });

  it('keeps data only for artificial and tapped harmonics', () => {
    expect(findNote(setNoteHarmonic(makeSong(), AT, { type: 'pinch', data: 5 }), AT)?.effect.harmonic).toEqual({ type: 'pinch', data: 0 });
    expect(findNote(setNoteHarmonic(makeSong(), AT, { type: 'artificial', data: 12.4 }), AT)?.effect.harmonic).toEqual({ type: 'artificial', data: 12 });
    expect(findNote(setNoteHarmonic(makeSong(), AT, { type: 'tapped', data: 17 }), AT)?.effect.harmonic).toEqual({ type: 'tapped', data: 17 });
  });

  it('returns the same song for the same harmonic, an unknown type or a missing note', () => {
    const song = setNoteHarmonic(makeSong(), AT, { type: 'semi', data: 0 });
    expect(setNoteHarmonic(song, AT, { type: 'semi', data: 0 })).toBe(song);
    expect(setNoteHarmonic(song, AT, { type: 'bogus' as 'semi', data: 0 })).toBe(song);
    expect(setNoteHarmonic(song, { ...AT, string: 4 }, { type: 'natural', data: 0 })).toBe(song);
  });
});

describe('buildHarmonic', () => {
  it('gives a new harmonic TuxGuitar’s default data: the 12th-fret harmonic', () => {
    // Act
    const harmonics = (['natural', 'artificial', 'tapped', 'pinch', 'semi'] as const).map((type) => buildHarmonic(type, 5));

    // Assert
    expect(harmonics).toEqual([
      { type: 'natural', data: 0 },
      { type: 'artificial', data: 12 },
      { type: 'tapped', data: 17 },
      { type: 'pinch', data: 0 },
      { type: 'semi', data: 0 },
    ]);
  });

  it('taps a harmonic no higher than the last fret', () => {
    expect(buildHarmonic('tapped', 20)).toEqual({ type: 'tapped', data: 29 });
  });
});
