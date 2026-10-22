import { describe, expect, it } from 'vitest';
import { setTrackTuning } from '../src/edit/retune';
import { canPlayOnTuning } from '../src/edit/tuning-fit';
import { EMPTY_NOTE_EFFECT, STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import type { Beat, Note, Song, Track } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';
import { beatPitches, songOnStrings } from './helpers/tuning-songs';

const DROP_D = [64, 59, 55, 50, 45, 38];
const D_STANDARD = [62, 57, 53, 48, 43, 38];
const OPEN_G = [62, 59, 55, 50, 43, 38];
/** Strings ensemble of nightwish.gp5: standard plus a low A string. */
const SEVEN_STRING_LOW_A = [64, 59, 55, 50, 45, 40, 33];
const FIVE_STRING_BASS = [43, 38, 33, 28, 23];

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

function firstBeat(song: Song, measureIndex = 0, beatIndex = 0): Beat {
  const beat = track(song).measures[measureIndex]?.beats[beatIndex];
  if (beat === undefined) {
    throw new Error(`no beat ${measureIndex}:${beatIndex}`);
  }
  return beat;
}

/** Pitches of every beat with octave moves undone: a pitch that moved by octaves still matches its pitch class. */
function pitchClasses(song: Song, trackIndex: number): string[] {
  return beatPitches(song, trackIndex).map((entry) => {
    const [where, pitches = ''] = entry.split(/:(?=[^:]*$)/);
    const classes = pitches === '' ? [] : pitches.split(',').map((pitch) => Number(pitch) % 12).sort((a, b) => a - b);
    return `${where}:${classes.join(',')}`;
  });
}

describe('setTrackTuning: unchanged songs', () => {
  it('returns the same song for the same tuning, a percussion track, a bad tuning or a missing track', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0))]]]);
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36))]]], { isPercussion: true });
    const unchanged = { song, octaveShifted: 0, removed: 0 };

    // Act + Assert
    expect(setTrackTuning(song, 0, [...STANDARD_TUNING])).toEqual(unchanged);
    expect(setTrackTuning(song, 0, [...STANDARD_TUNING]).song).toBe(song);
    expect(setTrackTuning(drums, 0, STANDARD_TUNING).song).toBe(drums);
    expect(setTrackTuning(song, 0, []).song).toBe(song);
    expect(setTrackTuning(song, 0, [64, 59.5]).song).toBe(song);
    expect(setTrackTuning(song, 0, [64, 128]).song).toBe(song);
    expect(setTrackTuning(song, 4, DROP_D).song).toBe(song);
  });
});

describe('setTrackTuning: re-fretting', () => {
  it('drops the low string to D and re-frets its notes, leaving the original song untouched', () => {
    // Arrange: F#2 on string 6 and an open E4 on string 1.
    const song = deepFreeze(songOnStrings(STANDARD_TUNING, [[[play(4, n(6, 2), n(1, 0))]]]));

    // Act
    const { song: retuned, octaveShifted } = setTrackTuning(song, 0, DROP_D);

    // Assert
    expect(track(retuned).strings).toEqual(DROP_D.map((tuning, i) => ({ number: i + 1, tuning })));
    expect(voiceLayout(retuned, 0, 0, 0)).toEqual(['0:4:1/0,6/4']);
    expect(octaveShifted).toBe(0);
    expect(track(song).strings[5]?.tuning).toBe(40);
    assertEditInvariants(retuned);
  });

  it('keeps the pitch of every note of every beat, all voices together', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [
      [[play(4, n(1, 3), n(2, 3), n(3, 0)), play(4, n(5, 2), n(6, 3)), rest(2)], [play(2, n(4, 5)), play(2, n(4, 7))]],
      [[play(1, n(6, 0), n(5, 2), n(4, 2), n(3, 1), n(2, 0), n(1, 0))]],
    ]);

    // Act
    const results = [DROP_D, D_STANDARD, OPEN_G].map((tuning) => setTrackTuning(song, 0, tuning));

    // Assert
    for (const result of results) {
      expect(beatPitches(result.song)).toEqual(beatPitches(song));
      expect(result).toMatchObject({ octaveShifted: 0, removed: 0 });
      assertEditInvariants(result.song);
    }
  });

  it('moves a note to the nearest free string when its own string cannot reach it', () => {
    // Arrange: open G2 on string 5 of open G; standard's A string starts above it.
    const song = songOnStrings(OPEN_G, [[[play(4, n(5, 0))]]]);

    // Act
    const { song: retuned } = setTrackTuning(song, 0, STANDARD_TUNING);

    // Assert
    expect(voiceLayout(retuned, 0, 0, 0)).toEqual(['0:4:6/3']);
  });

  it('keeps the capo and counts frets from it', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(6, 1))]]], { offset: 3 });
    const { song: retuned } = setTrackTuning(song, 0, DROP_D);
    expect(track(retuned).offset).toBe(3);
    expect(voiceLayout(retuned, 0, 0, 0)).toEqual(['0:4:6/3']);
    expect(beatPitches(retuned)).toEqual(beatPitches(song));
  });

  it('moves grace, trill and tapped-harmonic frets with their note', () => {
    // Arrange
    const effect = {
      ...EMPTY_NOTE_EFFECT,
      grace: { fret: 0, duration: 1, velocity: 95, transition: 'none' as const, onBeat: false, isDead: false },
      trill: { fret: 4, duration: { value: 16 as const, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } } },
      harmonic: { type: 'tapped' as const, data: 14 },
    };
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, { ...n(6, 2), effect })]]]);

    // Act
    const note = firstBeat(setTrackTuning(song, 0, DROP_D).song).voices[0]?.notes[0];

    // Assert
    expect(note).toMatchObject({ string: 6, fret: 4 });
    expect(note?.effect.grace?.fret).toBe(2);
    expect(note?.effect.trill?.fret).toBe(6);
    expect(note?.effect.harmonic).toEqual({ type: 'tapped', data: 16 });
  });

  it('re-frets chord diagrams for the new strings', () => {
    // Arrange: G major (3 0 0 0 2 3, string 1 first).
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(6, 3))]]]);
    const withChord: Song = {
      ...song,
      tracks: [
        {
          ...track(song),
          measures: track(song).measures.map((measure) => ({
            ...measure,
            beats: measure.beats.map((beat) => ({ ...beat, chord: { name: 'G', firstFret: 1, frets: [3, 0, 0, 0, 2, 3] } })),
          })),
        },
      ],
    };

    // Act
    const chord = firstBeat(setTrackTuning(withChord, 0, DROP_D).song).chord;
    const onBass = firstBeat(setTrackTuning(withChord, 0, [52, 47, 43, 38]).song).chord;

    // Assert
    expect(chord).toEqual({ name: 'G', firstFret: 1, frets: [3, 0, 0, 0, 2, 5] });
    expect(onBass?.frets).toHaveLength(4);
    expect(onBass?.name).toBe('G');
  });
});

describe('setTrackTuning: string count changes', () => {
  it('moves a 7-string part onto 6 strings, the low A string onto the low E string', () => {
    // Arrange: F#2 at fret 9 of the low A string, E4 open.
    const song = songOnStrings(SEVEN_STRING_LOW_A, [[[play(4, n(7, 9), n(1, 0))]]]);

    // Act
    const result = setTrackTuning(song, 0, STANDARD_TUNING);

    // Assert
    expect(track(result.song).strings).toHaveLength(6);
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:1/0,6/2']);
    expect(result).toMatchObject({ octaveShifted: 0, removed: 0 });
  });

  it('moves a 5-string bass part onto 4 strings, low B notes up an octave', () => {
    // Arrange: E1 at fret 5 of the B string, then the open B0.
    const song = songOnStrings(FIVE_STRING_BASS, [[[play(4, n(5, 5)), play(4, n(5, 0))]]], { program: 33 });

    // Act
    const result = setTrackTuning(song, 0, STANDARD_BASS_TUNING);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:4/0', '960:4:4/7']);
    expect(result.octaveShifted).toBe(1);
    expect(beatPitches(result.song)).toEqual(['0:0:28', '0:1:35']);
  });

  it('leaves out notes of a beat that has more notes than the new tuning has strings, and counts them', () => {
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(6, 0), n(5, 0), n(4, 0), n(3, 0), n(2, 0))]]]);
    const result = setTrackTuning(song, 0, STANDARD_BASS_TUNING);
    expect(result.removed).toBe(1);
    expect(firstBeat(result.song).voices[0]?.notes).toHaveLength(4);
    assertEditInvariants(result.song);
  });
});

describe('setTrackTuning: octaves and ties', () => {
  it('moves a note no string can hold by an octave and counts it', () => {
    // Arrange: open D2 of drop D; standard tuning cannot go below E2.
    const song = songOnStrings(DROP_D, [[[play(4, n(6, 0)), play(4, n(1, 5))]]]);

    // Act
    const result = setTrackTuning(song, 0, STANDARD_TUNING);

    // Assert
    expect(result.octaveShifted).toBe(1);
    expect(beatPitches(result.song)).toEqual(['0:0:50', '0:1:69']);
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:6/10', '960:4:1/5']);
    expect(canPlayOnTuning(track(song), STANDARD_TUNING)).toBe(false);
  });

  it('keeps a tied note on the string of the note it continues, across the bar line', () => {
    // Arrange: open G2 on string 5 of open G, tied into the next bar where a C3 on string 6 joins it.
    const song = songOnStrings(OPEN_G, [[[rest(2), rest(4), play(4, n(5, 0))]], [[play(4, tied(n(5, 0)), n(6, 10))]]]);

    // Act
    const { song: retuned } = setTrackTuning(song, 0, STANDARD_TUNING);

    // Assert
    expect(voiceLayout(retuned, 0, 0, 0)).toEqual(['0:2:r', '1920:4:r', '2880:4:6/3']);
    const notes = firstBeat(retuned, 1).voices[0]?.notes ?? [];
    expect(notes.find((note) => note.isTied)).toMatchObject({ string: 6, fret: 3 });
    expect(beatPitches(retuned)).toEqual(beatPitches(song));
  });

  it('moves a tied note by the octaves the note it continues was moved', () => {
    const song = songOnStrings(DROP_D, [[[play(2, n(6, 0)), play(2, tied(n(6, 0)))]]]);
    const result = setTrackTuning(song, 0, STANDARD_TUNING);
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:2:6/10', '1920:2:6/10']);
    expect(firstBeat(result.song, 0, 1).voices[0]?.notes[0]?.isTied).toBe(true);
    expect(result.octaveShifted).toBe(2);
  });

  it('unties a tied note that has to leave the string of the note it continues', () => {
    // Arrange: a B2 on string 6 of B standard is tied; the next beat adds an F2 that only string 6 of standard holds.
    const song = songOnStrings([59, 54, 50, 45, 40, 35], [[[play(2, n(6, 12)), play(2, tied(n(6, 12)), n(5, 1))]]]);

    // Act
    const { song: retuned } = setTrackTuning(song, 0, STANDARD_TUNING);

    // Assert: B2 stays on string 6 (fret 7) in beat 1; F2 needs string 6 in beat 2, so the tied B2 moves to string 5.
    expect(voiceLayout(retuned, 0, 0, 0)).toEqual(['0:2:6/7', '1920:2:5/2,6/1']);
    expect(firstBeat(retuned, 0, 1).voices[0]?.notes.find((note) => note.string === 5)?.isTied).toBe(false);
    expect(beatPitches(retuned)).toEqual(beatPitches(song));
  });
});

describe('setTrackTuning: a real file', () => {
  it('moves the 7-string strings ensemble of nightwish.gp5 onto six strings, keeping pitch classes and counting octave moves', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const trackIndex = song.tracks.findIndex((candidate) => candidate.name === 'Strings ensemble');

    // Act
    const result = setTrackTuning(song, trackIndex, STANDARD_TUNING);

    // Assert
    expect(track(result.song, trackIndex).strings).toHaveLength(6);
    expect(result.removed).toBe(0);
    expect(pitchClasses(result.song, trackIndex)).toEqual(pitchClasses(song, trackIndex));
    const moved = beatPitches(result.song, trackIndex).filter((entry, i) => entry !== beatPitches(song, trackIndex)[i]);
    expect(result.octaveShifted).toBeGreaterThan(0);
    expect(moved.length).toBeLessThanOrEqual(result.octaveShifted);
    expect(result.song.tracks.filter((_, i) => i !== trackIndex)).toEqual(song.tracks.filter((_, i) => i !== trackIndex));
    assertEditInvariants(result.song);
  });

  it('moves the custom-tuned choirs of nightwish.gp5 to standard without changing a pitch', () => {
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const trackIndex = song.tracks.findIndex((candidate) => candidate.name === 'Choirs');
    const result = setTrackTuning(song, trackIndex, STANDARD_TUNING);
    expect(result).toMatchObject({ octaveShifted: 0, removed: 0 });
    expect(beatPitches(result.song, trackIndex)).toEqual(beatPitches(song, trackIndex));
  });
});
