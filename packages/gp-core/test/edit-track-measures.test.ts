import { describe, expect, it } from 'vitest';
import { deleteTrackMeasure, deleteTrackMeasures, insertTrackMeasure } from '../src/edit/track-measures';
import { isMeasureOverfull } from '../src/model/defaults';
import type { Measure, Note, Song, Track } from '../src/model/song';
import { SONG_START, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { fromTux } from './helpers/ticks';

const WHOLE = fromTux(3840);

const tied = (note: Note): Note => ({ ...note, isTied: true });

/** The song with track `trackIndex`'s measures changed by `change`. */
function withMeasures(song: Song, trackIndex: number, change: (measure: Measure, index: number) => Measure): Song {
  const tracks = song.tracks.map((track, index): Track => (index === trackIndex ? { ...track, measures: track.measures.map(change) } : track));
  return { ...song, tracks };
}

/**
 * Three 4/4 bars in two tracks. Track 1: a whole note (fret 1), a half note (fret 2) and a half rest, a whole note
 * (fret 3). Track 2: rests, a whole note on string 6, rests. Bar 2 has a marker and repeat signs, tempos 100 / 110 / 120.
 */
function makeSong(): Song {
  const song = buildSong({
    tempos: [100, 110, 120],
    tracks: [
      [[[play(1, n(1, 1))]], [[play(2, n(1, 2)), rest(2)]], [[play(1, n(1, 3))]]],
      [[[rest(1)]], [[play(1, n(6, 0))]], [[rest(1)]]],
    ],
  });
  const headers = song.measureHeaders.map((header, i) => (i === 1 ? { ...header, marker: { title: 'Verse', color: { r: 0, g: 0, b: 0 } }, repeatOpen: true, repeatClose: 2 } : header));
  return deepFreeze({ ...song, measureHeaders: headers });
}

describe('insertTrackMeasure', () => {
  it('moves the track’s bars from the bar one bar later, a bar of rests in its place, the song one bar longer', () => {
    // Act
    const edited = insertTrackMeasure(makeSong(), 0, 1);

    // Assert
    expect(edited.measureHeaders).toHaveLength(4);
    expect([0, 1, 2, 3].map((measureIndex) => voiceLayout(edited, 0, measureIndex, 0))).toEqual([['0:1:1/1'], ['0:1:r'], ['0:2:1/2', '1920:2:r'], ['0:1:1/3']]);
    assertEditInvariants(edited);
  });

  it('leaves the other tracks as they were, with a bar of rests at the end', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = insertTrackMeasure(song, 0, 1);

    // Assert
    const other = edited.tracks[1]!;
    expect(other.measures.slice(0, 3)).toEqual(song.tracks[1]!.measures);
    expect(voiceLayout(edited, 1, 3, 0)).toEqual(['0:1:r']);
  });

  it('keeps every bar’s header where it is: tempo, marker and repeats stay on their bar; the new last bar copies the last meter and tempo', () => {
    const edited = insertTrackMeasure(makeSong(), 0, 0);
    expect(edited.measureHeaders.map((header) => header.tempo)).toEqual([100, 110, 120, 120]);
    expect(edited.measureHeaders[1]).toMatchObject({ marker: { title: 'Verse' }, repeatOpen: true, repeatClose: 2 });
    expect(edited.measureHeaders[3]).toMatchObject({ number: 4, start: SONG_START + 3 * WHOLE, repeatOpen: false, repeatClose: 0 });
    expect(edited.measureHeaders[3]?.marker).toBeUndefined();
  });

  it('keeps the key on its bar and moves the clef and the pedal marks with the music', () => {
    // Arrange: a key change to two sharps at bar 3, a bass clef and a pedal press in track 1's bar 3.
    const keyed = withMeasures(makeSong(), 0, (measure, index) => (index === 2 ? { ...measure, keySignature: 2, clef: 'bass', pedals: [{ offset: 0, action: 'down' }] } : measure));

    // Act
    const edited = insertTrackMeasure(keyed, 0, 1);

    // Assert
    const measures = edited.tracks[0]!.measures;
    expect(measures.map((measure) => measure.keySignature)).toEqual([0, 0, 2, 2]);
    expect(measures.map((measure) => measure.clef)).toEqual(['treble', 'treble', 'treble', 'bass']);
    expect(measures[2]?.pedals).toBeUndefined();
    expect(measures[3]?.pedals).toEqual([{ offset: 0, action: 'down' }]);
  });

  it('undoes a tie the bar of rests leaves with nothing to continue, and keeps the ties inside the moved bars', () => {
    // Arrange: bar 2's note tied to bar 1's, bar 3's to bar 2's.
    const song = deepFreeze(
      buildSong({ tracks: [[[[play(1, n(1, 5))]], [[play(1, tied(n(1, 5)))]], [[play(1, tied(n(1, 5)))]]]] }),
    );

    // Act
    const edited = insertTrackMeasure(song, 0, 1);

    // Assert
    const isTiedAt = (measureIndex: number) => edited.tracks[0]!.measures[measureIndex]!.beats[0]!.voices[0]!.notes[0]!.isTied;
    expect(isTiedAt(2)).toBe(false);
    expect(isTiedAt(3)).toBe(true);
  });

  it('fits a moved bar to its new bar’s time signature: rests to a longer bar line; notes past a shorter one kept (over-full)', () => {
    // Arrange: 4/4, 3/4, 4/4; track 1 plays four quarters, three quarters and a whole note.
    const four = { numerator: 4, denominator: 4 };
    const three = { numerator: 3, denominator: 4 };
    const song = deepFreeze(
      buildSong({
        timeSignatures: [four, three, four],
        tracks: [[[[1, 2, 3, 4].map((fret) => play(4, n(1, fret)))], [[1, 2, 3].map((fret) => play(4, n(2, fret)))], [[play(1, n(3, 0))]]]],
      }),
    );

    // Act
    const edited = insertTrackMeasure(song, 0, 0);

    // Assert
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:4:1/4']);
    expect(isMeasureOverfull(edited.tracks[0]!.measures[1]!, edited.measureHeaders[1]!)).toBe(true);
    expect(voiceLayout(edited, 0, 2, 0)).toEqual(['0:4:2/1', '960:4:2/2', '1920:4:2/3', '2880:4:r']);
    expect(voiceLayout(edited, 0, 3, 0)).toEqual(['0:1:3/0']);
  });

  it('shortens the free rests at the end of a bar moved into a shorter one', () => {
    const song = deepFreeze(buildSong({ timeSignatures: [{ numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }], tracks: [[[[play(2, n(1, 2)), rest(2)]], [[rest(2), rest(4)]]]] }));
    const edited = insertTrackMeasure(song, 0, 0);
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:2:1/2', '1920:4:r']);
  });

  it('moves the lyrics’ first bar with the music when they start at or after the bar', () => {
    // Arrange
    const song = makeSong();
    const withLyrics = (from: number): Song => ({ ...song, tracks: [{ ...song.tracks[0]!, lyrics: { from, text: 'la la' } }, song.tracks[1]!] });

    // Act
    const later = insertTrackMeasure(withLyrics(2), 0, 1);
    const before = insertTrackMeasure(withLyrics(1), 0, 1);

    // Assert
    expect(later.tracks[0]?.lyrics).toEqual({ from: 3, text: 'la la' });
    expect(before.tracks[0]?.lyrics).toEqual({ from: 1, text: 'la la' });
  });

  it('returns the same song for a track or a bar the song does not have', () => {
    const song = makeSong();
    expect(insertTrackMeasure(song, 5, 0)).toBe(song);
    expect(insertTrackMeasure(song, 0, 3)).toBe(song);
    expect(insertTrackMeasure(song, 0, -1)).toBe(song);
    expect(insertTrackMeasure(song, 0, 3, 'after')).toBe(song);
  });

  it('puts the bar of rests after the bar with position “after”: the track’s bars after it move one bar later', () => {
    // Act
    const edited = insertTrackMeasure(makeSong(), 0, 1, 'after');

    // Assert
    expect(edited.measureHeaders).toHaveLength(4);
    expect([0, 1, 2, 3].map((measureIndex) => voiceLayout(edited, 0, measureIndex, 0))).toEqual([['0:1:1/1'], ['0:2:1/2', '1920:2:r'], ['0:1:r'], ['0:1:1/3']]);
    expect(edited.tracks[1]!.measures.slice(0, 3)).toEqual(makeSong().tracks[1]!.measures);
    assertEditInvariants(edited);
  });

  it('adds a bar of rests at the end of the track after its last bar, with that bar’s clef and key', () => {
    // Arrange: a bass clef and two sharps in track 1's last bar.
    const keyed = withMeasures(makeSong(), 0, (measure, index) => (index === 2 ? { ...measure, keySignature: 2, clef: 'bass' } : measure));

    // Act
    const edited = insertTrackMeasure(keyed, 0, 2, 'after');

    // Assert
    expect([2, 3].map((measureIndex) => voiceLayout(edited, 0, measureIndex, 0))).toEqual([['0:1:1/3'], ['0:1:r']]);
    expect(edited.tracks[0]!.measures[3]).toMatchObject({ clef: 'bass', keySignature: 2 });
    expect(voiceLayout(edited, 1, 3, 0)).toEqual(['0:1:r']);
    assertEditInvariants(edited);
  });

  it('gives a bar of rests put after a bar the key of its own bar', () => {
    // Arrange: a key change to one flat at bar 3 (every track).
    const keyed = withMeasures(withMeasures(makeSong(), 0, (measure, index) => (index === 2 ? { ...measure, keySignature: -1 } : measure)), 1, (measure, index) => (index === 2 ? { ...measure, keySignature: -1 } : measure));

    // Act
    const edited = insertTrackMeasure(keyed, 0, 1, 'after');

    // Assert
    expect(edited.tracks[0]!.measures.map((measure) => measure.keySignature)).toEqual([0, 0, -1, -1]);
  });
});

describe('deleteTrackMeasure', () => {
  it('takes the track’s bar out, its later bars one bar earlier and its last bar rests; the song keeps its length', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = deleteTrackMeasure(song, 0, 1);

    // Assert
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    expect([0, 1, 2].map((measureIndex) => voiceLayout(edited, 0, measureIndex, 0))).toEqual([['0:1:1/1'], ['0:1:1/3'], ['0:1:r']]);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    assertEditInvariants(edited);
  });

  it('turns the only bar into rests, and the last bar too', () => {
    const one = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 7))]]]] }));
    expect(voiceLayout(deleteTrackMeasure(one, 0, 0), 0, 0, 0)).toEqual(['0:1:r']);
    expect(voiceLayout(deleteTrackMeasure(makeSong(), 0, 2), 0, 2, 0)).toEqual(['0:1:r']);
  });

  it('undoes a tie to a note that is gone or another fret, and keeps one the previous note still continues', () => {
    // Arrange: bar 3's notes tied to bar 2's; bar 1 ends on fret 5 of string 1 and fret 7 of string 2.
    const song = deepFreeze(
      buildSong({
        tracks: [[[[play(1, n(1, 5), n(2, 7))]], [[play(1, n(1, 5), n(2, 9))]], [[play(1, tied(n(1, 5)), tied(n(2, 9)))]]]],
      }),
    );

    // Act
    const edited = deleteTrackMeasure(song, 0, 1);

    // Assert
    const notes = edited.tracks[0]!.measures[1]!.beats[0]!.voices[0]!.notes;
    expect(notes.map((note) => [note.string, note.isTied])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('fits the moved bars to their new bars’ time signatures', () => {
    const song = deepFreeze(
      buildSong({ timeSignatures: [{ numerator: 3, denominator: 4 }, { numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }], tracks: [[[[rest(2), rest(4)]], [[play(2, n(1, 1)), rest(2)]], [[play(2, n(1, 3)), play(4, n(1, 4))]]]] }),
    );
    const edited = deleteTrackMeasure(song, 0, 0);
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(['0:2:1/1', '1920:4:r']);
    expect(voiceLayout(edited, 0, 1, 0)).toEqual(['0:2:1/3', '1920:4:1/4', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('moves the lyrics’ first bar back when they start after the bar', () => {
    const song = makeSong();
    const lyrics = (from: number): Song => ({ ...song, tracks: [{ ...song.tracks[0]!, lyrics: { from, text: 'la' } }, song.tracks[1]!] });
    expect(deleteTrackMeasure(lyrics(3), 0, 0).tracks[0]?.lyrics?.from).toBe(2);
    expect(deleteTrackMeasure(lyrics(1), 0, 0).tracks[0]?.lyrics?.from).toBe(1);
  });

  it('returns the same song when the bar and the bars after it in the track hold only rests (nothing would change)', () => {
    // Arrange: track 2 rests in bar 3.
    const song = makeSong();

    // Act / Assert
    expect(deleteTrackMeasure(song, 1, 2)).toBe(song);
    expect(deleteTrackMeasure(song, 1, 1)).not.toBe(song);
  });

  it('takes a run of bars out of the track (the selection, either order): the later bars move that many bars earlier', () => {
    // Arrange: four bars, frets 1 to 4.
    const song = deepFreeze(buildSong({ tracks: [[1, 2, 3, 4].map((fret) => [[play(1, n(1, fret))]])] }));

    // Act
    const edited = deleteTrackMeasures(song, 0, 2, 1);

    // Assert
    expect([0, 1, 2, 3].map((measureIndex) => voiceLayout(edited, 0, measureIndex, 0))).toEqual([['0:1:1/1'], ['0:1:1/4'], ['0:1:r'], ['0:1:r']]);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    assertEditInvariants(edited);
  });

  it('moves the lyrics’ first bar back by the bars deleted before it, to the run’s first bar when they started in it', () => {
    const song = deepFreeze(buildSong({ tracks: [[1, 2, 3, 4].map((fret) => [[play(1, n(1, fret))]])] }));
    const lyrics = (from: number): Song => ({ ...song, tracks: [{ ...song.tracks[0]!, lyrics: { from, text: 'la' } }] });
    expect(deleteTrackMeasures(lyrics(4), 0, 1, 2).tracks[0]?.lyrics?.from).toBe(2);
    expect(deleteTrackMeasures(lyrics(3), 0, 1, 2).tracks[0]?.lyrics?.from).toBe(2);
  });

  it('returns the same song for a track or a bar the song does not have', () => {
    const song = makeSong();
    expect(deleteTrackMeasures(song, 0, 0, 3)).toBe(song);
    expect(deleteTrackMeasure(song, 2, 0)).toBe(song);
    expect(deleteTrackMeasure(song, 0, 3)).toBe(song);
  });
});
