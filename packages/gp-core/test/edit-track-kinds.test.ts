import { describe, expect, it } from 'vitest';
import { TRACK_KINDS, trackKindSpec, trackTuningChoices } from '../src/edit/track-kinds';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';

describe('TRACK_KINDS', () => {
  it('lists the instruments a new track can be, each with its default program and string counts', () => {
    // Arrange / Act
    const kinds = TRACK_KINDS.map((spec) => [spec.kind, spec.program, spec.stringCounts]);

    // Assert
    expect(kinds).toEqual([
      ['guitar', 25, [6, 7, 8]],
      ['bass', 33, [4, 5, 6]],
      ['banjo', 105, [5, 4]],
      ['ukulele', 24, [4]],
      ['drums', 0, []],
      ['keys', 0, [6]],
      ['other', 48, [6]],
    ]);
  });

  it('finds a kind’s spec, and none for a word that is not a kind', () => {
    expect(trackKindSpec('bass')?.name).toBe('Bass');
    expect(trackKindSpec('lute' as never)).toBeUndefined();
  });
});

describe('trackTuningChoices', () => {
  it('offers the 6-string guitar presets, standard first', () => {
    // Arrange / Act
    const choices = trackTuningChoices('guitar', 6);

    // Assert
    expect(choices[0]).toEqual({ id: 'guitar-standard', name: 'Standard', tuning: STANDARD_TUNING });
    expect(choices.map((choice) => choice.name)).toContain('Drop D');
    expect(choices.every((choice) => choice.tuning.length === 6)).toBe(true);
  });

  it('offers TuxGuitar’s 7- and 8-string guitar tunings', () => {
    expect(trackTuningChoices('guitar', 7).map((choice) => choice.tuning)).toEqual([
      [64, 59, 55, 50, 45, 40, 35],
      [64, 59, 55, 50, 45, 40, 33],
    ]);
    expect(trackTuningChoices('guitar', 8)[0]?.tuning).toEqual([64, 59, 55, 50, 45, 40, 35, 30]);
  });

  it('offers 4-, 5- and 6-string bass tunings', () => {
    expect(trackTuningChoices('bass', 4)[0]?.tuning).toEqual(STANDARD_BASS_TUNING);
    expect(trackTuningChoices('bass', 5).map((choice) => choice.tuning)).toEqual([
      [43, 38, 33, 28, 23],
      [48, 43, 38, 33, 28],
    ]);
    expect(trackTuningChoices('bass', 6)[0]?.tuning).toEqual([48, 43, 38, 33, 28, 23]);
  });

  it('offers the 5-string banjo’s and the 4-string banjos’ presets apart', () => {
    expect(trackTuningChoices('banjo', 5)[0]).toMatchObject({ name: 'Open G', tuning: [62, 59, 55, 50, 67] });
    expect(trackTuningChoices('banjo', 4).map((choice) => choice.name)).toEqual(['Tenor', 'Irish tenor', 'Plectrum']);
  });

  it('offers the ukulele’s re-entrant standard tuning first, then low G and baritone', () => {
    expect(trackTuningChoices('ukulele', 4).map((choice) => [choice.name, choice.tuning])).toEqual([
      ['Standard', [69, 64, 60, 67]],
      ['Low G', [69, 64, 60, 55]],
      ['Baritone', [64, 59, 55, 50]],
    ]);
  });

  it('puts keys and other instruments on a standard-tuned neck, and drums on none', () => {
    expect(trackTuningChoices('keys', 6)).toEqual([{ id: 'neck-standard', name: 'Standard', tuning: STANDARD_TUNING }]);
    expect(trackTuningChoices('other', 6)).toHaveLength(1);
    expect(trackTuningChoices('drums', 6)).toEqual([]);
  });

  it('offers nothing for a string count the kind does not have', () => {
    expect(trackTuningChoices('guitar', 5)).toEqual([]);
    expect(trackTuningChoices('ukulele', 6)).toEqual([]);
  });
});
