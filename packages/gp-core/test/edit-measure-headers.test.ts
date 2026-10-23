import { describe, expect, it } from 'vitest';
import { setKeySignature, setMeasureMarker, setRepeat, setTempo, setTimeSignature, setTripletFeel } from '../src/edit/measure-headers';
import type { Marker, Song, TimeSignature, TripletFeel } from '../src/model/song';
import { SONG_START, type EventSpec, assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { fromTux, toTux } from './helpers/ticks';

const ts = (numerator: number, denominator: number): TimeSignature => ({ numerator, denominator });

/** Measures of whole rests in the given time signatures (a 3/4 measure holds a dotted-half rest). */
function restSong(signatures: readonly TimeSignature[], tracks = 1): Song {
  const measureRest = (signature: TimeSignature): EventSpec[] => (signature.numerator === 3 ? [rest(2), rest(4)] : [rest(1)]);
  const measures = signatures.map((signature) => [measureRest(signature)]);
  return deepFreeze(buildSong({ timeSignatures: signatures, tracks: Array.from({ length: tracks }, () => measures) }));
}

function signatures(song: Song): string[] {
  return song.measureHeaders.map((header) => `${header.timeSignature.numerator}/${header.timeSignature.denominator}`);
}

describe('setTimeSignature', () => {
  it('changes the measure and the following ones until the time signature changes', () => {
    // Arrange
    const song = restSong([ts(4, 4), ts(4, 4), ts(4, 4), ts(3, 4), ts(4, 4)]);

    // Act
    const edited = setTimeSignature(song, 1, ts(6, 8));

    // Assert
    expect(signatures(edited)).toEqual(['4/4', '6/8', '6/8', '3/4', '4/4']);
    assertEditInvariants(edited);
  });

  it('moves the following measures and their beats to the new starts', () => {
    const song = restSong([ts(4, 4), ts(4, 4), ts(3, 4), ts(4, 4)]);
    const edited = setTimeSignature(song, 0, ts(2, 4));
    expect(edited.measureHeaders.map((header) => toTux(header.start - SONG_START))).toEqual([0, 1920, 3840, 6720]);
    expect(edited.tracks[0]?.measures[3]?.beats[0]?.start).toBe(SONG_START + fromTux(6720));
    expect(voiceLayout(edited, 0, 3, 0)).toEqual(['0:1:r']);
    assertEditInvariants(edited);
  });

  it('shares the measures before the change', () => {
    const song = restSong([ts(4, 4), ts(4, 4), ts(4, 4)]);
    const edited = setTimeSignature(song, 2, ts(7, 8));
    expect(edited.measureHeaders[1]).toBe(song.measureHeaders[1]);
    expect(edited.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(voiceLayout(edited, 0, 2, 0)).toEqual(['0:2.:r', '2880:8:r']);
  });

  it('drops the rests that no longer fit and shortens the one that crosses the new end', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 2)), rest(2)]]], [[[rest(1)]]]] }));
    const edited = setTimeSignature(song, 0, ts(3, 4));
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(['0:4:1/0', '960:4:1/2', '1920:4:r']);
    expect(voiceLayout(edited, 1, 0, 0)).toEqual(['0:2.:r']);
    assertEditInvariants(edited);
  });

  it('keeps a note that starts inside the shorter measure', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0)), play(2, n(1, 2))]]]] }));
    expect(voiceLayout(setTimeSignature(song, 0, ts(3, 4)), 0, 0, 0)).toEqual(['0:2:1/0', '1920:2:1/2']);
  });

  it('refuses when a note of any track would start outside its shorter measure', () => {
    const song = deepFreeze(
      buildSong({ tracks: [[[[rest(1)]]], [[[play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))]]]] }),
    );
    expect(setTimeSignature(song, 0, ts(3, 4))).toBe(song);
  });

  it('pads the voices that filled the measure with rests when it grows', () => {
    const song = deepFreeze(
      buildSong({
        timeSignatures: [ts(3, 4)],
        tracks: [[[[play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2))], [play(4, n(4, 0))]]]],
      }),
    );
    const edited = setTimeSignature(song, 0, ts(4, 4));
    expect(voiceLayout(edited, 0, 0, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:r']);
    expect(voiceLayout(edited, 0, 0, 1)).toEqual(['0:4:4/0']);
    assertEditInvariants(edited);
  });

  it('clamps the numerator to 1…32 and the denominator to a note value', () => {
    const song = restSong([ts(4, 4)]);
    expect(signatures(setTimeSignature(song, 0, ts(0, 4)))).toEqual(['1/4']);
    expect(signatures(setTimeSignature(song, 0, ts(40, 4)))).toEqual(['32/4']);
    expect(signatures(setTimeSignature(song, 0, ts(4, 3)))).toEqual(['4/4']);
    expect(signatures(setTimeSignature(song, 0, ts(4, 100)))).toEqual(['4/64']);
    expect(signatures(setTimeSignature(song, 0, ts(4, 0)))).toEqual(['4/1']);
    expect(signatures(setTimeSignature(song, 0, ts(5.4, 8)))).toEqual(['5/8']);
  });

  it('returns the same song for the same time signature, a missing measure or a value that is not a number', () => {
    const song = restSong([ts(4, 4), ts(3, 4)]);
    expect(setTimeSignature(song, 0, ts(4, 4))).toBe(song);
    expect(setTimeSignature(song, 2, ts(2, 4))).toBe(song);
    expect(setTimeSignature(song, 0, ts(Number.NaN, 4))).toBe(song);
  });
});

describe('setTempo', () => {
  it('changes the tempo of the measure and the following ones until the tempo changes', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tempos: [120, 120, 90, 120], tracks: [[[[rest(1)]], [[rest(1)]], [[rest(1)]], [[rest(1)]]]] }));

    // Act
    const edited = setTempo(song, 0, 100);

    // Assert
    expect(edited.measureHeaders.map((header) => header.tempo)).toEqual([100, 100, 90, 120]);
    expect(edited.tracks).toBe(song.tracks);
    expect(edited.measureHeaders[2]).toBe(song.measureHeaders[2]);
  });

  it('clamps the tempo to 1…999', () => {
    const song = restSong([ts(4, 4)]);
    expect(setTempo(song, 0, 0).measureHeaders[0]?.tempo).toBe(1);
    expect(setTempo(song, 0, 2000).measureHeaders[0]?.tempo).toBe(999);
  });

  it('returns the same song for the same tempo, a missing measure or a value that is not a number', () => {
    const song = restSong([ts(4, 4)]);
    expect(setTempo(song, 0, 120)).toBe(song);
    expect(setTempo(song, 1, 90)).toBe(song);
    expect(setTempo(song, 0, Number.NaN)).toBe(song);
  });
});

describe('setKeySignature', () => {
  function keyed(keys: readonly (readonly number[])[]): Song {
    const song = restSong(keys[0]?.map(() => ts(4, 4)) ?? [], keys.length);
    return deepFreeze({
      ...song,
      tracks: song.tracks.map((track, t) => ({ ...track, measures: track.measures.map((measure, m) => ({ ...measure, keySignature: keys[t]?.[m] ?? 0 })) })),
    });
  }

  function keys(song: Song): number[][] {
    return song.tracks.map((track) => track.measures.map((measure) => measure.keySignature));
  }

  it('changes every track from the measure on until its key changes', () => {
    // Arrange
    const song = keyed([
      [0, 0, 0, 2, 0],
      [0, 0, 1, 1, 0],
    ]);

    // Act
    const edited = setKeySignature(song, 1, -3);

    // Assert
    expect(keys(edited)).toEqual([
      [0, -3, -3, 2, 0],
      [0, -3, 1, 1, 0],
    ]);
    expect(edited.tracks[0]?.measures[3]).toBe(song.tracks[0]?.measures[3]);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
  });

  it('clamps the key to -7…7', () => {
    expect(keys(setKeySignature(keyed([[0]]), 0, 9))).toEqual([[7]]);
    expect(keys(setKeySignature(keyed([[0]]), 0, -12))).toEqual([[-7]]);
  });

  it('returns the same song for the same key or a missing measure', () => {
    const song = keyed([[2, 2]]);
    expect(setKeySignature(song, 0, 2)).toBe(song);
    expect(setKeySignature(song, 2, 1)).toBe(song);
    expect(setKeySignature(song, 0, Number.NaN)).toBe(song);
  });
});

describe('setRepeat', () => {
  it('sets only the given repeat fields', () => {
    // Arrange
    const song = restSong([ts(4, 4), ts(4, 4)]);

    // Act
    const opened = setRepeat(song, 0, { repeatOpen: true });
    const closed = setRepeat(opened, 1, { repeatClose: 3, repeatAlternative: 0b101 });

    // Assert
    expect(closed.measureHeaders[0]).toMatchObject({ repeatOpen: true, repeatClose: 0, repeatAlternative: 0 });
    expect(closed.measureHeaders[1]).toMatchObject({ repeatOpen: false, repeatClose: 3, repeatAlternative: 5 });
    expect(closed.tracks).toBe(song.tracks);
  });

  it('keeps the repeat count and the alternative endings in range', () => {
    const song = restSong([ts(4, 4)]);
    expect(setRepeat(song, 0, { repeatClose: -2, repeatAlternative: -1 }).measureHeaders[0]).toMatchObject({ repeatClose: 0, repeatAlternative: 0 });
    expect(setRepeat(song, 0, { repeatClose: 500, repeatAlternative: 0x1ff }).measureHeaders[0]).toMatchObject({ repeatClose: 127, repeatAlternative: 0xff });
  });

  it('returns the same song when nothing changes or the measure does not exist', () => {
    const song = restSong([ts(4, 4)]);
    expect(setRepeat(song, 0, {})).toBe(song);
    expect(setRepeat(song, 0, { repeatOpen: false, repeatClose: 0 })).toBe(song);
    expect(setRepeat(song, 1, { repeatOpen: true })).toBe(song);
  });
});

describe('setMeasureMarker', () => {
  const VERSE: Marker = { title: 'Verse', color: { r: 0, g: 128, b: 255 } };

  it('sets the marker of one measure, title trimmed', () => {
    // Arrange
    const song = restSong([ts(4, 4), ts(4, 4)]);

    // Act
    const edited = setMeasureMarker(song, 1, { ...VERSE, title: '  Verse ' });

    // Assert
    expect(edited.measureHeaders[1]?.marker).toEqual(VERSE);
    expect(edited.measureHeaders[0]).toBe(song.measureHeaders[0]);
    expect(edited.tracks).toBe(song.tracks);
  });

  it('removes the marker for none or a blank title', () => {
    const marked = setMeasureMarker(restSong([ts(4, 4)]), 0, VERSE);
    expect(setMeasureMarker(marked, 0, undefined).measureHeaders[0]).not.toHaveProperty('marker');
    expect(setMeasureMarker(marked, 0, { ...VERSE, title: '  ' }).measureHeaders[0]).not.toHaveProperty('marker');
  });

  it('keeps the colour components in 0…255, rounded', () => {
    const edited = setMeasureMarker(restSong([ts(4, 4)]), 0, { title: 'Solo', color: { r: -4, g: 300, b: 12.6 } });
    expect(edited.measureHeaders[0]?.marker?.color).toEqual({ r: 0, g: 255, b: 13 });
  });

  it('returns the same song for the same marker, no marker to remove, a colour that is not a number or a missing measure', () => {
    const song = restSong([ts(4, 4)]);
    expect(setMeasureMarker(song, 0, undefined)).toBe(song);
    expect(setMeasureMarker(song, 0, { title: '', color: VERSE.color })).toBe(song);
    const marked = setMeasureMarker(song, 0, VERSE);
    expect(setMeasureMarker(marked, 0, { title: 'Verse', color: { ...VERSE.color } })).toBe(marked);
    expect(setMeasureMarker(song, 0, { title: 'Solo', color: { r: Number.NaN, g: 0, b: 0 } })).toBe(song);
    expect(setMeasureMarker(song, 3, VERSE)).toBe(song);
  });
});

describe('setTripletFeel', () => {
  function feels(song: Song): string[] {
    return song.measureHeaders.map((header) => header.tripletFeel);
  }

  it('changes the measure and the following ones until the triplet feel changes, as setTempo does', () => {
    // Arrange
    const song = restSong([ts(4, 4), ts(4, 4), ts(4, 4), ts(4, 4)]);
    const later = setTripletFeel(song, 3, 'sixteenth');

    // Act
    const edited = setTripletFeel(later, 1, 'eighth');

    // Assert
    expect(feels(later)).toEqual(['none', 'none', 'none', 'sixteenth']);
    expect(feels(edited)).toEqual(['none', 'eighth', 'eighth', 'sixteenth']);
    expect(edited.measureHeaders[0]).toBe(song.measureHeaders[0]);
    expect(edited.tracks).toBe(song.tracks);
  });

  it('returns the same song for the same feel, an unknown one or a missing measure', () => {
    const song = restSong([ts(4, 4)]);
    expect(setTripletFeel(song, 0, 'none')).toBe(song);
    expect(setTripletFeel(song, 0, 'shuffle' as TripletFeel)).toBe(song);
    expect(setTripletFeel(song, 2, 'eighth')).toBe(song);
  });
});
