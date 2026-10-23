import { describe, expect, it } from 'vitest';
import { type TranspositionOptions, type TranspositionScope, transpose } from '../src/edit/transpose';
import { EMPTY_NOTE_EFFECT, STANDARD_TUNING } from '../src/model/defaults';
import type { Beat, Chord, Note, Song, Track } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';
import { beatPitches, songOnStrings } from './helpers/tuning-songs';

const SONG: TranspositionScope = { kind: 'song' };
const UP_TWO: TranspositionOptions = { mode: 'chromatic', amount: 2 };

function tied(note: Note): Note {
  return { ...note, isTied: true };
}

function track(song: Song, trackIndex = 0): Track {
  const found = song.tracks[trackIndex];
  if (found === undefined) {
    throw new Error(`no track ${trackIndex}`);
  }
  return found;
}

function beatAt(song: Song, measureIndex: number, beatIndex: number, trackIndex = 0): Beat {
  const beat = track(song, trackIndex).measures[measureIndex]?.beats[beatIndex];
  if (beat === undefined) {
    throw new Error(`no beat ${measureIndex}:${beatIndex}`);
  }
  return beat;
}

/** The song with every measure of track 0 in `keySignature` and the first beat of each measure holding `chord`. */
function withKeyAndChord(song: Song, keySignature: number, chord?: Chord): Song {
  const measures = track(song).measures.map((measure) => ({
    ...measure,
    keySignature,
    beats: measure.beats.map((beat, beatIndex) => (beatIndex === 0 && chord !== undefined ? { ...beat, chord } : beat)),
  }));
  return { ...song, tracks: [{ ...track(song), measures }, ...song.tracks.slice(1)] };
}

function shifted(pitches: readonly string[], semitones: number): string[] {
  return pitches.map((entry) => {
    const [where, list = ''] = entry.split(/:(?=[^:]*$)/);
    return `${where}:${list === '' ? '' : list.split(',').map((pitch) => Number(pitch) + semitones).join(',')}`;
  });
}

describe('transpose: songs left as they were', () => {
  it('returns the same song for no amount, a fractional amount, a missing track or a drum track', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0))]]]);
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36))]]], { isPercussion: true });
    const unchanged = { song, moved: 0, unplaced: 0, chords: 0, unplacedChords: 0 };

    // Act + Assert
    expect(transpose(song, SONG, { mode: 'chromatic', amount: 0 })).toEqual(unchanged);
    expect(transpose(song, SONG, { mode: 'chromatic', amount: 12, octaves: -1 }).song).toBe(song);
    expect(transpose(song, SONG, { mode: 'chromatic', amount: 1.5 }).song).toBe(song);
    expect(transpose(song, SONG, { mode: 'diatonic', amount: Number.NaN }).song).toBe(song);
    expect(transpose(song, { kind: 'track', trackIndex: 3 }, UP_TWO).song).toBe(song);
    expect(transpose(drums, SONG, UP_TWO).song).toBe(drums);
  });
});

describe('transpose: chromatic', () => {
  it('moves every note of the song by the amount on its own string, and the key signature with it', () => {
    // Arrange
    const song = deepFreeze(
      songOnStrings(STANDARD_TUNING, [
        [[play(4, n(1, 3), n(2, 3), n(3, 0)), play(4, n(5, 2), n(6, 3)), rest(2)], [play(2, n(4, 5)), play(2, n(4, 7))]],
        [[play(1, n(6, 0), n(5, 2), n(4, 2), n(3, 1), n(2, 0), n(1, 0))]],
      ]),
    );

    // Act
    const result = transpose(song, SONG, UP_TWO);

    // Assert
    expect(beatPitches(result.song)).toEqual(shifted(beatPitches(song), 2));
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:1/5,2/5,3/2', '960:4:5/4,6/5', '1920:2:r']);
    expect(track(result.song).measures.map((measure) => measure.keySignature)).toEqual([2, 2]);
    expect(result).toMatchObject({ moved: 13, unplaced: 0 });
    assertEditInvariants(result.song);
  });

  it('moves a note to the nearest string that holds its new pitch when its own fret leaves the neck', () => {
    // Arrange: B3 open on string 2 goes down to B flat; F#5 at fret 23 of string 2 goes up past fret 24.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 0)), play(4, n(2, 23))]]]);

    // Act
    const down = transpose(song, SONG, { mode: 'chromatic', amount: -1 });
    const up = transpose(song, SONG, UP_TWO);

    // Assert
    expect(voiceLayout(down.song, 0, 0, 0)).toEqual(['0:4:3/3', '960:4:2/22']);
    expect(voiceLayout(up.song, 0, 0, 0)).toEqual(['0:4:2/2', '960:4:1/20']);
  });

  it('leaves a note no free string can hold as it was, and counts it', () => {
    // Arrange: low E2 and A2 down two semitones: D2 is below every string; G2 needs the low E string, which E2 keeps.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(6, 0), n(5, 1))]]]);

    // Act
    const result = transpose(song, SONG, { mode: 'chromatic', amount: -2 });

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:6/0,5/1']);
    expect(result).toMatchObject({ moved: 0, unplaced: 2 });
    assertEditInvariants(result.song);
  });

  it('counts frets from the capo: the neck above it is shorter', () => {
    // Arrange: capo 2, B3 + 21 on string 2 up two: fret 23 is past the 22 frets above the capo.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 21))]]], { offset: 2 });
    const result = transpose(song, SONG, UP_TWO);
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:1/18']);
    expect(beatPitches(result.song)).toEqual(shifted(beatPitches(song), 2));
  });

  it('moves by whole octaves too', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 0))]]]);
    const result = transpose(song, SONG, { mode: 'chromatic', amount: 0, octaves: 1 });
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:3/12']);
    expect(track(result.song).measures[0]?.keySignature).toBe(0);
  });

  it('keeps a tied note on the string of the note it continues', () => {
    // Arrange: F#5 at fret 23 of string 2, tied into the next bar.
    const song = songOnStrings(STANDARD_TUNING, [[[rest(2), rest(4), play(4, n(2, 23))]], [[play(4, tied(n(2, 23))), rest(4), rest(2)]]]);

    // Act
    const result = transpose(song, SONG, UP_TWO);

    // Assert
    expect(beatAt(result.song, 1, 0).voices[0]?.notes).toEqual([{ ...tied(n(1, 20)) }]);
  });

  it('moves grace, trill and tapped-harmonic frets with their note', () => {
    // Arrange
    const effect = {
      ...EMPTY_NOTE_EFFECT,
      grace: { fret: 2, duration: 1, velocity: 95, transition: 'none' as const, onBeat: false, isDead: false },
      harmonic: { type: 'tapped' as const, data: 15 },
    };
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, { ...n(3, 3), effect })]]]);

    // Act
    const note = beatAt(transpose(song, SONG, UP_TWO).song, 0, 0).voices[0]?.notes[0];

    // Assert
    expect(note).toMatchObject({ string: 3, fret: 5 });
    expect(note?.effect.grace?.fret).toBe(4);
    expect(note?.effect.harmonic).toEqual({ type: 'tapped', data: 17 });
  });

  it('never moves a drum track, and transposes only the track asked for', () => {
    // Arrange: a guitar track and a drum track.
    const guitar = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0))]]]);
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36))]]], { isPercussion: true });
    const song: Song = { ...guitar, tracks: [track(guitar), { ...track(drums), number: 2 }] };

    // Act
    const all = transpose(song, SONG, UP_TWO);
    const drumsOnly = transpose(song, { kind: 'track', trackIndex: 1 }, UP_TWO);

    // Assert
    expect(beatPitches(all.song, 0)).toEqual(['0:0:66']);
    expect(all.song.tracks[1]).toBe(song.tracks[1]);
    expect(drumsOnly.song).toBe(song);
  });
});

describe('transpose: a selection', () => {
  // Two bars of quarter notes on string 3, voice 1; a tie runs from beat 4 of bar 1 into bar 2.
  const song = deepFreeze(
    withKeyAndChord(
      songOnStrings(STANDARD_TUNING, [
        [[play(4, n(3, 0)), play(4, n(3, 1)), play(4, n(3, 2)), play(4, n(3, 3))]],
        [[play(4, tied(n(3, 3))), play(4, n(3, 4)), play(4, n(3, 5)), play(4, tied(n(3, 5)))]],
      ]),
      0,
      { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] },
    ),
  );

  it('moves the selected beats of the selected voice, and the chords on them; the key signature stays', () => {
    // Act: beats 2–4 of bar 1.
    const scope: TranspositionScope = {
      kind: 'beats',
      from: { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 },
      to: { trackIndex: 0, measureIndex: 0, beatIndex: 3, voiceIndex: 0 },
    };
    const result = transpose(song, scope, UP_TWO);

    // Assert: the tied note after the selection follows the note it continues.
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:3/0', '960:4:3/3', '1920:4:3/4', '2880:4:3/5']);
    expect(voiceLayout(result.song, 0, 1, 0)).toEqual(['0:4:3/5', '960:4:3/4', '1920:4:3/5', '2880:4:3/5']);
    expect(beatAt(result.song, 1, 0).voices[0]?.notes[0]?.isTied).toBe(true);
    expect(beatAt(result.song, 0, 0).chord?.name).toBe('C');
    expect(track(result.song).measures.map((measure) => measure.keySignature)).toEqual([0, 0]);
    expect(result).toMatchObject({ moved: 4, unplaced: 0, chords: 0 });
  });

  it('starts a tied note at the selection’s first beat afresh, its tie gone, and moves the chord of a selected beat', () => {
    // Act: bar 2, given last-to-first (the cursor before the anchor), up to its third beat.
    const scope: TranspositionScope = {
      kind: 'beats',
      from: { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 0 },
      to: { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0 },
    };
    const result = transpose(song, scope, UP_TWO);

    // Assert
    expect(voiceLayout(result.song, 0, 1, 0)).toEqual(['0:4:3/5', '960:4:3/6', '1920:4:3/7', '2880:4:3/7']);
    expect(beatAt(result.song, 1, 0).voices[0]?.notes[0]?.isTied).toBe(false);
    expect(beatAt(result.song, 1, 0).chord?.name).toBe('D');
    expect(result).toMatchObject({ moved: 4, chords: 1 });
  });

  it('leaves the song as it was for a selection across two tracks', () => {
    const scope: TranspositionScope = {
      kind: 'beats',
      from: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 },
      to: { trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0 },
    };
    expect(transpose(song, scope, UP_TWO).song).toBe(song);
  });
});

describe('transpose: diatonic', () => {
  it('moves notes along the key’s scale and keeps the key signature', () => {
    // Arrange: E4 and B3 open, C major.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0), n(2, 0))]]]);

    // Act
    const result = transpose(song, SONG, { mode: 'diatonic', amount: 1 });

    // Assert: F4 and C4.
    expect(beatPitches(result.song)).toEqual(['0:0:60,65']);
    expect(track(result.song).measures[0]?.keySignature).toBe(0);
  });

  it('moves a track a step down in C minor, the raised 7th staying raised', () => {
    // Arrange: C4, E flat 4, G4, B natural 4 in C minor (three flats).
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 1)), play(4, n(2, 4)), play(4, n(1, 3)), play(4, n(1, 7))]]]), -3);

    // Act
    const result = transpose(song, { kind: 'track', trackIndex: 0 }, { mode: 'diatonic', amount: -1 });

    // Assert: B flat 3, D4, F4, A natural 4.
    expect(beatPitches(result.song)).toEqual(['0:0:58', '0:1:62', '0:2:65', '0:3:69']);
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:3/3', '960:4:2/3', '1920:4:1/1', '2880:4:1/5']);
    expect(track(result.song).measures[0]?.keySignature).toBe(-3);
  });

  it('moves a whole octave by seven steps', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 2))]]]);
    const result = transpose(song, SONG, { mode: 'diatonic', amount: 0, octaves: 1 });
    expect(beatPitches(result.song)).toEqual(['0:0:69']);
  });

  it('moves a chord by its root along the scale, keeping its type', () => {
    // Arrange: C major, a C chord over a C3.
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[play(4, n(5, 3))]]]), 0, { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] });

    // Act
    const chord = beatAt(transpose(song, SONG, { mode: 'diatonic', amount: 1 }).song, 0, 0).chord;

    // Assert
    expect(chord).toEqual({ name: 'D', firstFret: 2, frets: [2, 3, 2, 4, 5, -1] });
  });
});

describe('transpose: chords', () => {
  const C_OPEN: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };

  it('moves chord names and diagrams with the notes, spelled in the new key', () => {
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[play(4, n(5, 3))]]]), 0, C_OPEN);
    const result = transpose(song, SONG, { mode: 'chromatic', amount: -2 });
    expect(beatAt(result.song, 0, 0).chord).toEqual({ name: 'Bb', firstFret: 10, frets: [10, 11, 10, 12, 13, -1] });
    expect(result).toMatchObject({ chords: 1, unplacedChords: 0 });
  });

  it('moves only the chords when asked, the notes and the key signature staying', () => {
    // Arrange
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[play(4, n(5, 3))]]]), 0, C_OPEN);

    // Act
    const result = transpose(song, SONG, { mode: 'chromatic', amount: 2, isChordsOnly: true });

    // Assert
    expect(beatPitches(result.song)).toEqual(beatPitches(song));
    expect(beatAt(result.song, 0, 0).chord).toEqual({ name: 'D', firstFret: 2, frets: [2, 3, 2, 4, 5, -1] });
    expect(track(result.song).measures[0]?.keySignature).toBe(0);
    expect(result).toMatchObject({ moved: 0, chords: 1 });
  });

  it('moves a diagram without a name by the amount, or diatonically by its lowest note', () => {
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[play(4, n(5, 3))]]]), 0, { name: '', firstFret: 1, frets: [-1, -1, -1, -1, 3, -1] });
    expect(beatAt(transpose(song, SONG, UP_TWO).song, 0, 0).chord?.frets[4]).toBe(5);
    expect(beatAt(transpose(song, SONG, { mode: 'diatonic', amount: 2 }).song, 0, 0).chord?.frets[4]).toBe(7);
  });

  it('keeps a chord whose diagram fits no octave of the shift, and counts it', () => {
    const song = withKeyAndChord(songOnStrings(STANDARD_TUNING, [[[rest(4)]]]), 0, { name: 'C', firstFret: 1, frets: [0, 20, -1, -1, -1, -1] });
    const result = transpose(song, SONG, { mode: 'chromatic', amount: 5, isChordsOnly: true });
    expect(beatAt(result.song, 0, 0).chord?.name).toBe('C');
    expect(result).toMatchObject({ chords: 0, unplacedChords: 1 });
  });

  it('moves the chords of chords.gp a whole tone, notes untouched', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro7', 'chords.gp'));

    // Act
    const result = transpose(song, SONG, { mode: 'chromatic', amount: 2, isChordsOnly: true });

    // Assert
    const names = track(result.song).measures.flatMap((measure) => measure.beats.flatMap((beat) => (beat.chord === undefined ? [] : [beat.chord.name])));
    expect(names.slice(0, 8)).toEqual(['D', 'Dm', 'D', 'Dm', 'E', 'Em', 'E', 'Em']);
    expect(beatPitches(result.song)).toEqual(beatPitches(song));
    expect(beatAt(result.song, 0, 0).chord?.frets).toEqual([2, 3, 2, 4, 5, -1]);
  });
});

describe('transpose: real files', () => {
  const FILES = [
    ['guitarpro5', 'nightwish.gp5'],
    ['guitarpro5', 'chords.gp5'],
    ['guitarpro7', 'tuplets.gp'],
    ['guitarpro7', 'grace.gp'],
    ['guitarpro8', 'custom-beaming.gp'],
  ] as const;

  it('moves every placed note by the amount and leaves the others as they were, mutating nothing', () => {
    for (const [folder, name] of FILES) {
      // Arrange
      const song = deepFreeze(readSong(loadFixture(folder, name)));

      for (const amount of [3, -5]) {
        // Act
        const result = transpose(song, SONG, { mode: 'chromatic', amount });

        // Assert
        assertEditInvariants(result.song);
        const before = song.tracks.flatMap((_, trackIndex) => beatPitches(song, trackIndex));
        const after = result.song.tracks.flatMap((_, trackIndex) => beatPitches(result.song, trackIndex));
        const changed = after.filter((entry, i) => entry !== before[i]).length;
        expect(changed, `${name} ${amount}`).toBeGreaterThan(0);
        expect(result.moved + result.unplaced, `${name} ${amount}`).toBeGreaterThan(0);
      }
    }
  });

  it('builds songs whose notes never share a string in a beat', () => {
    const song = buildSong({ tracks: [[[[play(1, n(1, 22), n(2, 23), n(3, 24))]]]] });
    const result = transpose(song, SONG, UP_TWO);
    const strings = beatAt(result.song, 0, 0).voices[0]?.notes.map((note) => note.string) ?? [];
    expect(new Set(strings).size).toBe(strings.length);
    expect(result.unplaced).toBeGreaterThan(0);
  });
});
