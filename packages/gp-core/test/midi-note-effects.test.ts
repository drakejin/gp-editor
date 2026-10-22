import { describe, expect, it } from 'vitest';
import { readSong, renderMidi, type Song } from '../src/index';
import { loadFixture } from './helpers/fixtures';
import { eventsOf, type MidiFile, type PlayedNote, playedNotes, readMidi } from './helpers/midi-reader';
import { type BeatSpec, duration, type HeaderSpec, makeSong, note, type NoteSpec } from './helpers/midi-song';

function midi(song: Song): MidiFile {
  return readMidi(renderMidi(song).bytes);
}

function songOf(beats: readonly BeatSpec[], header: HeaderSpec = {}): Song {
  return makeSong({ headers: [header], tracks: [{ measures: [beats] }] });
}

function oneNote(spec: NoteSpec, beat: Partial<BeatSpec> = {}): Song {
  return songOf([{ notes: [note(spec)], ...beat }]);
}

/** [key, start, end, velocity, channel] of every note. */
function summary(notes: readonly PlayedNote[]): (number | undefined)[][] {
  return notes.map((played) => [played.key, played.start, played.end, played.velocity, played.channel]);
}

/** "tick:msb" of the pitch bends on one MIDI channel of track 1, skipping the initial centring. */
function bends(file: MidiFile, channel: number): string[] {
  return eventsOf(file, 1, 'pitchBend')
    .filter((event) => event.channel === channel)
    .map((event) => `${event.tick}:${event.msb}`);
}

describe('renderMidi bends (MidiSequenceParser.addBend)', () => {
  const file = midi(readSong(loadFixture('guitarpro5', 'bends.gp5')));

  it('plays a bent note on the second channel of the route', () => {
    // Act
    const notes = playedNotes(file);

    // Assert
    expect(summary(notes)).toEqual([
      [58, 0, 1920, 95, 1],
      [58, 1920, 3840, 95, 1],
      [65, 3840, 7680, 95, 1],
    ]);
  });

  it('turns the bend curve of bends.gp5 into one pitch-bend step per 2.75 units, then recentres', () => {
    // Act
    const firstNote = bends(file, 1)
      .filter((event) => Number(event.split(':')[0]) <= 1920)
      .slice(0, 15);

    // Assert: 0 → whole tone (4 quarter tones = 64 + 11) between positions 0 and 3 of 12, held to the end.
    expect(firstNote).toEqual([
      '0:64',
      '43:65',
      '86:66',
      '129:67',
      '172:68',
      '215:69',
      '258:70',
      '301:71',
      '344:72',
      '387:73',
      '430:74',
      '473:75',
      '480:75',
      '1920:75',
      '1920:64',
    ]);
  });

  it('leaves the first channel of the route centred', () => {
    // Act / Assert
    expect(bends(file, 0)).toEqual(['0:64']);
  });
});

describe('renderMidi tremolo bar, vibrato and slides', () => {
  it('dives with the tremolo bar in quarter tones like a bend', () => {
    // Arrange
    const song = oneNote({
      fret: 0,
      string: 1,
      effect: {
        tremoloBar: {
          points: [
            { position: 0, value: 0 },
            { position: 6, value: -2 },
            { position: 12, value: 0 },
          ],
        },
      },
    });

    // Act
    const events = bends(midi(song), 1);

    // Assert: -2 quarter tones = 64 - 5; width 480 / 5 = 96 ticks per step.
    expect(events).toEqual([
      '0:64',
      '96:63',
      '192:62',
      '288:61',
      '384:60',
      '480:59',
      '480:59',
      '576:60',
      '672:61',
      '768:62',
      '864:63',
      '960:64',
      '960:64',
      '960:64',
    ]);
  });

  it('wobbles a vibrato note by one step every 160 ticks', () => {
    // Arrange
    const song = oneNote({ fret: 0, string: 1, effect: { vibrato: true } });

    // Act / Assert
    expect(bends(midi(song), 1)).toEqual(['160:64', '320:65', '480:64', '640:65', '800:64', '960:65', '960:64']);
  });

  it('wobbles a wide vibrato note as TuxGuitar plays any vibrato', () => {
    // Arrange
    const song = oneNote({ fret: 0, string: 1, effect: { wideVibrato: true } });

    // Act / Assert
    expect(bends(midi(song), 1)).toEqual(['160:64', '320:65', '480:64', '640:65', '800:64', '960:65', '960:64']);
  });

  it('slides to the next note on the same string with pitch bends every 120 ticks', () => {
    // Arrange
    const song = songOf([
      { notes: [note({ fret: 5, string: 1, effect: { slides: ['shift'] } })] },
      { notes: [note({ fret: 7, string: 1 })] },
    ]);

    // Act
    const file = midi(song);

    // Assert: 2 frets over 960 ticks, 5.5 per semitone.
    expect(bends(file, 1)).toEqual([
      '120:65',
      '240:66',
      '360:68',
      '480:69',
      '600:70',
      '720:72',
      '840:73',
      '960:75',
      '960:64',
    ]);
    expect(summary(playedNotes(file))).toEqual([
      [69, 0, 960, 95, 1],
      [71, 960, 1920, 95, 0],
    ]);
  });

  it('does not slide into a rest', () => {
    // Arrange
    const song = songOf([{ notes: [note({ fret: 5, string: 1, effect: { slides: ['shift'] } })] }, { notes: [] }]);

    // Act / Assert
    expect(bends(midi(song), 1)).toEqual([]);
  });

  it('ignores pitch effects on percussion', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        { isPercussion: true, measures: [[{ notes: [note({ fret: 38, string: 1, effect: { vibrato: true } })] }]] },
      ],
    });

    // Act / Assert
    expect(bends(midi(song), 9)).toEqual(['0:64']);
  });
});

describe('renderMidi grace notes', () => {
  function graceSong(grace: Partial<NonNullable<NoteSpec['effect']>['grace']>, measures = 2): Song {
    const full = {
      fret: 3,
      duration: 3,
      velocity: 80,
      transition: 'none',
      onBeat: false,
      isDead: false,
      ...grace,
    } as const;
    const target = [{ notes: [note({ fret: 5, string: 1, effect: { grace: full } })] }];
    return makeSong({ tracks: [{ measures: measures === 2 ? [[{ notes: [] }], target] : [target] }] });
  }

  it('plays a grace note before the beat, on the bend channel', () => {
    // Act / Assert
    expect(summary(playedNotes(midi(graceSong({}))))).toEqual([
      [67, 3600, 3840, 80, 1],
      [69, 3840, 4800, 95, 1],
    ]);
  });

  it('plays an on-beat grace note on the beat and delays the main note', () => {
    // Act / Assert
    expect(summary(playedNotes(midi(graceSong({ onBeat: true, duration: 2 }))))).toEqual([
      [67, 3840, 3960, 80, 1],
      [69, 3960, 4800, 95, 1],
    ]);
  });

  it('moves a grace note on the beat when it would start before the song', () => {
    // Act / Assert
    expect(summary(playedNotes(midi(graceSong({ duration: 1 }, 1))))).toEqual([
      [67, 0, 60, 80, 1],
      [69, 60, 960, 95, 1],
    ]);
  });

  it('drops the main note when an on-beat grace note takes all of it', () => {
    // Arrange
    const grace = { fret: 3, duration: 3, velocity: 80, transition: 'none', onBeat: true, isDead: false } as const;
    const song = makeSong({
      tracks: [
        {
          measures: [
            [{ notes: [] }],
            [
              {
                notes: [note({ fret: 5, string: 1, effect: { grace, staccato: true, palmMute: true } })],
                duration: duration(16),
              },
            ],
          ],
        },
      ],
    });

    // Act / Assert: the 16th note lasts 120 ticks (palm mute), the grace note 240.
    expect(summary(playedNotes(midi(song)))).toEqual([[67, 3840, 4080, 80, 1]]);
  });

  it('shortens a dead grace note', () => {
    // Act / Assert
    expect(summary(playedNotes(midi(graceSong({ isDead: true }))))).toEqual([
      [67, 3600, 3660, 80, 1],
      [69, 3840, 4800, 95, 1],
    ]);
  });
});

describe('renderMidi strokes, tremolo picking and trills', () => {
  it('spreads a down stroke from the lowest string, shortening each note by its delay', () => {
    // Arrange
    const chord = [1, 2, 3].map((string) => note({ fret: 0, string }));
    const song = songOf([{ notes: chord, stroke: { direction: 'down', value: 16 } }]);

    // Act / Assert: 960 / 8 × 4 / 16 = 30 ticks between strings.
    expect(summary(playedNotes(midi(song)))).toEqual([
      [55, 0, 960, 95, 0],
      [59, 30, 960, 95, 0],
      [64, 60, 960, 95, 0],
    ]);
  });

  it('spreads an up stroke from the highest string', () => {
    // Arrange
    const chord = [1, 2, 3].map((string) => note({ fret: 0, string }));
    const song = songOf([{ notes: chord, stroke: { direction: 'up', value: 8 } }]);

    // Act / Assert
    expect(summary(playedNotes(midi(song)))).toEqual([
      [64, 0, 960, 95, 0],
      [59, 60, 960, 95, 0],
      [55, 120, 960, 95, 0],
    ]);
  });

  it('strikes all strings at once when the stroke has no speed', () => {
    // Arrange
    const chord = [1, 2].map((string) => note({ fret: 0, string }));
    const song = songOf([{ notes: chord, stroke: { direction: 'down', value: 0 } }]);

    // Act / Assert
    expect(summary(playedNotes(midi(song))).map(([key, start]) => [key, start])).toEqual([
      [59, 0],
      [64, 0],
    ]);
  });

  it('ignores tied notes when spreading a stroke', () => {
    // Arrange
    const song = songOf([
      { notes: [note({ fret: 0, string: 1 }), note({ fret: 0, string: 2 })] },
      {
        notes: [note({ fret: 0, string: 1, isTied: true }), note({ fret: 2, string: 2 })],
        stroke: { direction: 'down', value: 16 },
      },
    ]);

    // Act / Assert
    expect(summary(playedNotes(midi(song))).map(([key, start, end]) => [key, start, end])).toEqual([
      [59, 0, 960],
      [64, 0, 1920],
      [61, 960, 1920],
    ]);
  });

  it('repeats a tremolo-picked note at the tremolo duration, the last one cut to fit', () => {
    // Arrange
    const song = oneNote({ fret: 0, string: 1, effect: { tremoloPicking: { duration: duration(16) } } });

    // Act / Assert
    expect(summary(playedNotes(midi(song)))).toEqual([
      [64, 0, 240, 95, 0],
      [64, 240, 480, 95, 0],
      [64, 480, 720, 95, 0],
      [64, 720, 959, 95, 0],
    ]);
  });

  it('alternates a trill between the note and the trill fret', () => {
    // Arrange
    const song = oneNote({ fret: 5, string: 1, effect: { trill: { fret: 7, duration: duration(16) } } });

    // Act / Assert
    expect(summary(playedNotes(midi(song)))).toEqual([
      [69, 0, 240, 95, 0],
      [71, 240, 480, 95, 0],
      [69, 480, 720, 95, 0],
      [71, 720, 959, 95, 0],
    ]);
  });
});

describe('renderMidi harmonics', () => {
  function harmonic(spec: NoteSpec): (number | undefined)[][] {
    return summary(playedNotes(midi(oneNote(spec))));
  }

  it('plays a natural harmonic at the 12th fret an octave up, with a soft note an octave lower', () => {
    // Act / Assert
    expect(harmonic({ fret: 12, string: 1, effect: { harmonic: { type: 'natural', data: 0 } } })).toEqual([
      [64, 0, 960, 31, 0],
      [76, 0, 960, 95, 0],
    ]);
  });

  it('plays a natural harmonic at the 7th fret an octave and a fifth above the open string', () => {
    // Act / Assert
    expect(harmonic({ fret: 7, string: 1, effect: { harmonic: { type: 'natural', data: 0 } } })).toEqual([
      [71, 0, 960, 31, 0],
      [83, 0, 960, 95, 0],
    ]);
  });

  it('adds the artificial harmonic offset to the fretted note', () => {
    // Act / Assert
    expect(harmonic({ fret: 5, string: 1, effect: { harmonic: { type: 'artificial', data: 19 } } })).toEqual([
      [76, 0, 960, 31, 0],
      [88, 0, 960, 95, 0],
    ]);
  });

  it('derives a tapped harmonic from the distance between tapped and fretted fret', () => {
    // Act / Assert
    expect(harmonic({ fret: 5, string: 1, effect: { harmonic: { type: 'tapped', data: 10 } } })).toEqual([
      [81, 0, 960, 31, 0],
      [93, 0, 960, 95, 0],
    ]);
  });

  it('adds the fretted note to a semi harmonic', () => {
    // Act / Assert
    expect(harmonic({ fret: 5, string: 1, effect: { harmonic: { type: 'semi', data: 0 } } })).toEqual([
      [69, 0, 960, 47, 0],
      [69, 0, 960, 31, 0],
      [81, 0, 960, 95, 0],
    ]);
  });

  it('plays a pinch harmonic an octave up', () => {
    // Act / Assert
    expect(harmonic({ fret: 5, string: 1, effect: { harmonic: { type: 'pinch', data: 0 } } })).toEqual([
      [69, 0, 960, 31, 0],
      [81, 0, 960, 95, 0],
    ]);
  });
});

describe('renderMidi fade in and triplet feel', () => {
  it('ramps the expression controller from 31 to 127 over a fade-in note', () => {
    // Arrange
    const song = oneNote({ fret: 0, string: 1, effect: { fadeIn: true } }, { duration: duration(1) });

    // Act
    const ramp = eventsOf(midi(song), 1, 'controlChange').filter(
      (event) => event.controller === 11 && event.channel === 0,
    );

    // Assert: one step every 3840 / 96 = 40 ticks.
    expect(ramp.slice(1, 4).map((event) => [event.tick, event.value])).toEqual([
      [0, 31],
      [40, 32],
      [80, 33],
    ]);
    expect(ramp.at(-1)).toMatchObject({ tick: 3840, value: 127 });
    expect(ramp).toHaveLength(1 + 96 + 1);
  });

  it('swings straight eighths with an eighth triplet feel', () => {
    // Arrange
    const eighths = [0, 2, 4, 5].map((fret) => ({ notes: [note({ fret, string: 1 })], duration: duration(8) }));
    const song = songOf(eighths, { tripletFeel: 'eighth' });

    // Act / Assert
    expect(summary(playedNotes(midi(song))).map(([key, start, end]) => [key, start, end])).toEqual([
      [64, 0, 640],
      [66, 640, 960],
      [68, 960, 1600],
      [69, 1600, 1920],
    ]);
  });

  it('leaves an eighth unswung when its partner is not a plain eighth', () => {
    // Arrange: two sixteenths then an off-beat eighth; an on-beat eighth followed by a quarter.
    const song = songOf(
      [
        { notes: [note({ fret: 0, string: 1 })], duration: duration(16) },
        { notes: [note({ fret: 2, string: 1 })], duration: duration(16) },
        { notes: [note({ fret: 4, string: 1 })], duration: duration(8) },
        { notes: [note({ fret: 5, string: 1 })], duration: duration(8) },
        { notes: [note({ fret: 7, string: 1 })] },
      ],
      { tripletFeel: 'eighth' },
    );

    // Act / Assert
    expect(summary(playedNotes(midi(song))).map(([key, start, end]) => [key, start, end])).toEqual([
      [64, 0, 240],
      [66, 240, 480],
      [68, 480, 960],
      [69, 960, 1440],
      [71, 1440, 2400],
    ]);
  });

  it('swings straight sixteenths with a sixteenth triplet feel', () => {
    // Arrange
    const sixteenths = [0, 2].map((fret) => ({ notes: [note({ fret, string: 1 })], duration: duration(16) }));
    const song = songOf(sixteenths, { tripletFeel: 'sixteenth' });

    // Act / Assert
    expect(summary(playedNotes(midi(song))).map(([key, start, end]) => [key, start, end])).toEqual([
      [64, 0, 320],
      [66, 320, 480],
    ]);
  });
});
