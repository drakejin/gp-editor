import { describe, expect, it } from 'vitest';
import { buildAudioTrack } from '../src/audio-track/audio-track';
import { setAudioTrack } from '../src/edit/audio-track';
import { setNoteFret } from '../src/edit/edit-song';
import { deleteMeasure, deleteMeasures, fillEmptyMeasure, insertMeasure } from '../src/edit/measures';
import type { Song } from '../src/model/song';
import { SONG_START, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { fromTux } from './helpers/ticks';

const WHOLE = fromTux(3840);

/** Three 4/4 measures in two tracks; measure 2 has a marker and repeat signs, track 2 uses the bass clef and two sharps. */
function makeSong(): Song {
  const song = buildSong({
    tempos: [100, 110, 120],
    tracks: [
      [[[play(1, n(1, 1))]], [[play(2, n(1, 2)), rest(2)]], [[play(1, n(1, 3))]]],
      [[[rest(1)]], [[play(1, n(6, 0))]], [[rest(1)]]],
    ],
  });
  const headers = song.measureHeaders.map((header, i) =>
    i === 1 ? { ...header, marker: { title: 'Verse', color: { r: 0, g: 0, b: 0 } }, repeatOpen: true, repeatClose: 2, repeatAlternative: 1, tripletFeel: 'eighth' as const } : header,
  );
  const bass = song.tracks[1]!;
  const tracks = [song.tracks[0]!, { ...bass, measures: bass.measures.map((measure) => ({ ...measure, clef: 'bass' as const, keySignature: 2 })) }];
  return deepFreeze({ ...song, measureHeaders: headers, tracks });
}

describe('insertMeasure', () => {
  it('inserts a measure after, copying the neighbour’s time signature, tempo and triplet feel but no marker or repeat', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = insertMeasure(song, 1, 'after');

    // Assert
    expect(edited.measureHeaders.map((header) => header.number)).toEqual([1, 2, 3, 4]);
    expect(edited.measureHeaders[2]).toEqual({
      number: 3,
      start: SONG_START + 2 * WHOLE,
      timeSignature: { numerator: 4, denominator: 4 },
      tempo: 110,
      repeatOpen: false,
      repeatClose: 0,
      repeatAlternative: 0,
      tripletFeel: 'eighth',
    });
    assertEditInvariants(edited);
  });

  it('gives every track a whole-measure rest with the neighbour’s clef and key', () => {
    const edited = insertMeasure(makeSong(), 1, 'after');
    expect(voiceLayout(edited, 0, 2, 0)).toEqual(['0:1:r']);
    expect(voiceLayout(edited, 1, 2, 0)).toEqual(['0:1:r']);
    expect(edited.tracks[1]?.measures[2]).toMatchObject({ headerIndex: 2, clef: 'bass', keySignature: 2 });
    expect(edited.tracks[0]?.measures[2]?.beats[0]?.voices).toHaveLength(2);
  });

  it('moves the following measures and their beats one measure later', () => {
    const song = makeSong();
    const edited = insertMeasure(song, 1, 'after');
    expect(edited.measureHeaders[3]).toMatchObject({ number: 4, start: SONG_START + 3 * WHOLE, tempo: 120 });
    expect(edited.tracks[0]?.measures[3]?.beats[0]?.start).toBe(SONG_START + 3 * WHOLE);
    expect(voiceLayout(edited, 0, 3, 0)).toEqual(['0:1:1/3']);
  });

  it('shares the measures before the new one', () => {
    const song = makeSong();
    const edited = insertMeasure(song, 1, 'after');
    expect(edited.measureHeaders[0]).toBe(song.measureHeaders[0]);
    expect(edited.measureHeaders[1]).toBe(song.measureHeaders[1]);
    expect(edited.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
  });

  it('inserts before the first measure, keeping the song start', () => {
    const edited = insertMeasure(makeSong(), 0, 'before');
    expect(edited.measureHeaders[0]).toMatchObject({ number: 1, start: SONG_START, tempo: 100 });
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:1:1/1']);
    assertEditInvariants(edited);
  });

  it('fills other time signatures with the fewest rests', () => {
    const threeFour = deepFreeze(buildSong({ timeSignatures: [{ numerator: 3, denominator: 4 }], tracks: [[[[rest(2), rest(4)]]]] }));
    expect(voiceLayout(insertMeasure(threeFour, 0, 'after'), 0, 1, 0)).toEqual(['0:2.:r']);
    const fiveFour = deepFreeze(buildSong({ timeSignatures: [{ numerator: 5, denominator: 4 }], tracks: [[[[rest(1), rest(4)]]]] }));
    expect(voiceLayout(insertMeasure(fiveFour, 0, 'before'), 0, 0, 0)).toEqual(['0:1:r', '3840:4:r']);
  });

  it('returns the same song for a measure that does not exist', () => {
    const song = makeSong();
    expect(insertMeasure(song, 3, 'after')).toBe(song);
    expect(insertMeasure(song, -1, 'before')).toBe(song);
  });
});

describe('deleteMeasure', () => {
  it('removes the measure from every track and moves the following ones back', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = deleteMeasure(song, 1);

    // Assert
    expect(edited.measureHeaders.map((header) => [header.number, header.start, header.tempo])).toEqual([
      [1, SONG_START, 100],
      [2, SONG_START + WHOLE, 120],
    ]);
    expect(edited.tracks.map((track) => track.measures.length)).toEqual([2, 2]);
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:1:1/3']);
    expect(edited.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
    assertEditInvariants(edited);
  });

  it('keeps the song start when the first measure goes', () => {
    const edited = deleteMeasure(makeSong(), 0);
    expect(edited.measureHeaders[0]).toMatchObject({ number: 1, start: SONG_START, tempo: 110 });
    assertEditInvariants(edited);
  });

  it('refuses to delete the last remaining measure', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[rest(1)]]]] }));
    expect(deleteMeasure(song, 0)).toBe(song);
  });

  it('returns the same song for a measure that does not exist', () => {
    const song = makeSong();
    expect(deleteMeasure(song, 3)).toBe(song);
    expect(deleteMeasure(song, -1)).toBe(song);
  });
});

describe('deleteMeasures', () => {
  it('removes a run of measures from every track in one edit, either order', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tempos: [100, 110, 120, 130], tracks: [[[[play(1, n(1, 1))]], [[play(1, n(1, 2))]], [[play(1, n(1, 3))]], [[play(1, n(1, 4))]]]] }));

    // Act
    const edited = deleteMeasures(song, 2, 1);

    // Assert
    expect(edited.measureHeaders.map((header) => [header.number, header.start, header.tempo])).toEqual([
      [1, SONG_START, 100],
      [2, SONG_START + WHOLE, 130],
    ]);
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:1:1/4']);
    expect(deleteMeasures(song, 1, 2)).toEqual(edited);
    assertEditInvariants(edited);
  });

  it('keeps the sync points of the bars left, those after the run moved back', () => {
    const song = setAudioTrack(makeSong(), buildAudioTrack({ assetId: 'take', syncPoints: [0, 1, 2].map((measureIndex) => ({ measureIndex, occurrence: 0, position: 0, seconds: measureIndex * 2 })) }));
    expect(deleteMeasures(song, 0, 1).audioTrack?.syncPoints).toEqual([{ measureIndex: 0, occurrence: 0, position: 0, seconds: 4 }]);
  });

  it('refuses to delete every measure, or a run past the song', () => {
    const song = makeSong();
    expect(deleteMeasures(song, 0, 2)).toBe(song);
    expect(deleteMeasures(song, 1, 3)).toBe(song);
    expect(deleteMeasures(song, -1, 0)).toBe(song);
    expect(deleteMeasures(song, 0.5, 1)).toBe(song);
  });
});

describe('fillEmptyMeasure', () => {
  /** Bar 2 of track 1 holds no beats (the track rests there), as many files leave it. */
  function withEmptyBar(): Song {
    const song = makeSong();
    const track = song.tracks[0]!;
    const measures = track.measures.map((measure, index) => (index === 1 ? { ...measure, beats: [], pedals: [{ offset: 0, action: 'down' as const }] } : measure));
    return deepFreeze({ ...song, tracks: [{ ...track, measures }, song.tracks[1]!] });
  }

  it('fills a measure without beats with rests to the bar line in its first voice, keeping its marks', () => {
    // Arrange
    const song = withEmptyBar();

    // Act
    const filled = fillEmptyMeasure(song, 0, 1);

    // Assert
    expect(voiceLayout(filled, 0, 1, 0)).toEqual(['0:1:r']);
    expect(filled.tracks[0]?.measures[1]?.beats[0]?.voices).toHaveLength(2);
    expect(filled.tracks[0]?.measures[1]?.pedals).toEqual([{ offset: 0, action: 'down' }]);
    expect(filled.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
    expect(filled.tracks[1]).toBe(song.tracks[1]);
    assertEditInvariants(filled);
  });

  it('fills other time signatures with the fewest rests', () => {
    const fiveFour = deepFreeze(buildSong({ timeSignatures: [{ numerator: 5, denominator: 4 }], tracks: [[[]]] }));
    expect(voiceLayout(fillEmptyMeasure(fiveFour, 0, 0), 0, 0, 0)).toEqual(['0:1:r', '3840:4:r']);
  });

  it('returns the same song for a measure with beats or one that does not exist', () => {
    const song = withEmptyBar();
    expect(fillEmptyMeasure(song, 0, 0)).toBe(song);
    expect(fillEmptyMeasure(song, 0, 3)).toBe(song);
    expect(fillEmptyMeasure(song, 2, 1)).toBe(song);
  });

  it('lets a fret typed into a bar without beats become the bar’s first beat', () => {
    const song = withEmptyBar();
    const typed = setNoteFret(fillEmptyMeasure(song, 0, 1), { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 2 }, 5);
    expect(voiceLayout(typed, 0, 1, 0)).toEqual(['0:1:2/5']);
    expect(setNoteFret(song, { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 2 }, 5)).toBe(song);
  });
});
