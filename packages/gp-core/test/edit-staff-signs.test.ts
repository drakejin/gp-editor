import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { deleteBeat, insertBeat, setBeatDuration } from '../src/edit/beats';
import { setMeasureClef, setOttava } from '../src/edit/staff-signs';
import { OTTAVAS, isOttava, ottavaOctaves } from '../src/model/defaults';
import type { Clef, Ottava, Song } from '../src/model/song';
import { buildSong, deepFreeze, dur, n, play, rest } from './helpers/edit-songs';

/** Three bars of four quarter notes on string 1, the last beat of each a rest (voice 2 empty). */
function makeSong(): Song {
  const bar = [[play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), rest(4)]];
  return deepFreeze(buildSong({ tracks: [[bar, bar, bar]] }));
}

const at = (measureIndex: number, beatIndex: number, voiceIndex = 0): BeatAddress => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex });
const ottavas = (song: Song, measureIndex: number): readonly (Ottava | undefined)[] => (song.tracks[0]?.measures[measureIndex]?.beats ?? []).map((beat) => beat.ottava);
const clefs = (song: Song): readonly Clef[] => (song.tracks[0]?.measures ?? []).map((measure) => measure.clef);

function withClefs(song: Song, values: readonly Clef[]): Song {
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, measures: track.measures.map((measure, index) => ({ ...measure, clef: values[index] ?? measure.clef })) })) };
}

describe('octave signs (model helpers)', () => {
  it('lists Guitar Pro’s four octave signs and the octaves each moves the written notes', () => {
    expect(OTTAVAS).toEqual(['8va', '8vb', '15ma', '15mb']);
    expect(OTTAVAS.map(ottavaOctaves)).toEqual([1, -1, 2, -2]);
    expect(ottavaOctaves(undefined)).toBe(0);
  });

  it('knows an octave sign from anything else', () => {
    expect(OTTAVAS.every(isOttava)).toBe(true);
    expect(['8VA', 'Regular', '', 8, undefined, '22ma'].some(isOttava)).toBe(false);
  });
});

describe('setOttava', () => {
  it('puts an octave sign on every beat from one beat to another, in either order, rests included', () => {
    // Arrange
    const original = makeSong();

    // Act
    const song = setOttava(original, at(1, 1), at(0, 2), '8va');

    // Assert
    expect(ottavas(song, 0)).toEqual([undefined, undefined, '8va', '8va']);
    expect(ottavas(song, 1)).toEqual(['8va', '8va', undefined, undefined]);
    expect(song.tracks[0]?.measures[2]).toBe(original.tracks[0]?.measures[2]);
  });

  it('replaces another sign and removes the sign with undefined, leaving no property', () => {
    // Arrange
    const above = setOttava(makeSong(), at(0, 0), at(0, 3), '15ma');

    // Act
    const below = setOttava(above, at(0, 1), at(0, 2), '8vb');
    const removed = setOttava(below, at(0, 0), at(0, 3), undefined);

    // Assert
    expect(ottavas(below, 0)).toEqual(['15ma', '8vb', '8vb', '15ma']);
    expect(ottavas(removed, 0)).toEqual([undefined, undefined, undefined, undefined]);
    expect(removed.tracks[0]?.measures[0]?.beats[0]).not.toHaveProperty('ottava');
  });

  it('puts no octave sign on a drum track (its staff has no pitches to move)', () => {
    const song = makeSong();
    const drums: Song = { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) };
    expect(setOttava(drums, at(0, 0), at(0, 1), '8va')).toBe(drums);
  });

  it('returns the same song when nothing changes, the range has no beat or the sign is unknown', () => {
    const song = makeSong();
    expect(setOttava(song, at(0, 0), at(0, 1), undefined)).toBe(song);
    expect(setOttava(song, at(7, 0), at(7, 2), '8va')).toBe(song);
    expect(setOttava(song, at(0, 0), at(0, 0), '22ma' as Ottava)).toBe(song);
    const signed = setOttava(song, at(0, 0), at(0, 1), '8vb');
    expect(setOttava(signed, at(0, 0), at(0, 1), '8vb')).toBe(signed);
  });

  it('puts the rests an edit adds inside a signed run under the sign, so its line runs on', () => {
    // Arrange: the whole first bar under an 8va
    const signed = setOttava(makeSong(), at(0, 0), at(0, 3), '8va');

    // Act
    const shorter = setBeatDuration(signed, at(0, 0), dur(8));
    const inserted = insertBeat(signed, at(0, 0), 'after');
    const deleted = deleteBeat(signed, at(0, 1));
    const longer = setBeatDuration(setBeatDuration(signed, at(0, 2), dur(8)), at(0, 1), dur(2));

    // Assert
    expect(ottavas(shorter, 0).every((sign) => sign === '8va')).toBe(true);
    expect(ottavas(inserted, 0).every((sign) => sign === '8va')).toBe(true);
    expect(ottavas(deleted, 0).every((sign) => sign === '8va')).toBe(true);
    expect(ottavas(longer, 0).every((sign) => sign === '8va')).toBe(true);
  });

  it('adds no sign to the rests of an edit outside a signed run', () => {
    expect(ottavas(insertBeat(makeSong(), at(0, 0), 'after'), 0).every((sign) => sign === undefined)).toBe(true);
  });

  it('keeps the octave sign of a beat whose duration an edit changes', () => {
    // Arrange
    const signed = setOttava(makeSong(), at(0, 0), at(0, 0), '8va');

    // Act
    const longer = setBeatDuration(signed, at(0, 0), dur(2));

    // Assert
    expect(longer.tracks[0]?.measures[0]?.beats[0]?.ottava).toBe('8va');
  });
});

describe('setMeasureClef', () => {
  it('sets the clef of a bar and of the bars after it that had the same clef, up to the next clef change', () => {
    // Arrange
    const song = withClefs(makeSong(), ['treble', 'treble', 'alto']);

    // Act
    const bass = setMeasureClef(song, 0, 0, 'bass');
    const fromSecond = setMeasureClef(song, 0, 1, 'tenor');

    // Assert
    expect(clefs(bass)).toEqual(['bass', 'bass', 'alto']);
    expect(clefs(fromSecond)).toEqual(['treble', 'tenor', 'alto']);
    expect(fromSecond.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
  });

  it('returns the same song for the clef the bar has, a bar or track that does not exist, a drum track or the neutral clef', () => {
    const song = makeSong();
    const drums: Song = { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true, measures: track.measures.map((measure) => ({ ...measure, clef: 'neutral' })) })) };
    expect(setMeasureClef(song, 0, 0, 'treble')).toBe(song);
    expect(setMeasureClef(song, 0, 9, 'bass')).toBe(song);
    expect(setMeasureClef(song, 3, 0, 'bass')).toBe(song);
    expect(setMeasureClef(drums, 0, 0, 'bass')).toBe(drums);
    expect(setMeasureClef(song, 0, 0, 'neutral')).toBe(song);
    expect(setMeasureClef(song, 0, 0, 'mezzo' as Clef)).toBe(song);
  });
});
