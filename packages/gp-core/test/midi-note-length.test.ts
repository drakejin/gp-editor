import { describe, expect, it } from 'vitest';
import { readSong, renderMidi, type Song } from '../src/index';
import { loadFixture } from './helpers/fixtures';
import { eventsOf, type PlayedNote, playedNotes, readMidi } from './helpers/midi-reader';
import { duration, makeSong, note } from './helpers/midi-song';

function render(song: Song): PlayedNote[] {
  return playedNotes(readMidi(renderMidi(song).bytes));
}

/** [key, start, end, velocity] of every note. */
function summary(notes: readonly PlayedNote[]): (number | undefined)[][] {
  return notes.map((played) => [played.key, played.start, played.end, played.velocity]);
}

describe('renderMidi notes of guitarpro5/notes.gp5', () => {
  const song = readSong(loadFixture('guitarpro5', 'notes.gp5'));
  const file = readMidi(renderMidi(song).bytes);

  it('plays tuning + fret on track 1, MIDI channel 0, from tick 0', () => {
    // Act
    const notes = playedNotes(file);

    // Assert
    expect(notes.every((played) => played.track === 1 && played.channel === 0)).toBe(true);
    expect(summary(notes.slice(0, 9))).toEqual([
      [41, 0, 3840, 95],
      [42, 3840, 7680, 95],
      [43, 7680, 11520, 95],
      [44, 11520, 15360, 95],
      [41, 19200, 21120, 95],
      [42, 21120, 23040, 95],
      [43, 23040, 24960, 95],
      [44, 24960, 26880, 95],
      [41, 28800, 29760, 95],
    ]);
    expect(notes).toHaveLength(28);
  });

  it('writes the tempo and time signature of the first measure in the conductor track', () => {
    // Act
    const tempos = eventsOf(file, 0, 'tempo');
    const signatures = eventsOf(file, 0, 'timeSignature');

    // Assert
    expect(tempos).toEqual([{ kind: 'tempo', tick: 0, usq: 500000 }]);
    expect(signatures).toEqual([
      { kind: 'timeSignature', tick: 0, numerator: 4, denominator: 4, clocks: 24, notated32nds: 8 },
    ]);
  });
});

describe('renderMidi pitches', () => {
  it('adds the capo (track offset) to tuning + fret', () => {
    // Arrange
    const song = makeSong({ tracks: [{ offset: 2, measures: [[{ notes: [note({ fret: 3, string: 2 })] }]] }] });

    // Act / Assert
    expect(render(song).map((played) => played.key)).toEqual([59 + 2 + 3]);
  });

  it('writes tempo and time signature changes where the played measures change them', () => {
    // Arrange
    const song = makeSong({
      headers: [
        { tempo: 120 },
        { tempo: 120, numerator: 3 },
        { tempo: 90, numerator: 3 },
        { tempo: 90, numerator: 6, denominator: 8 },
      ],
      tracks: [{ measures: [] }],
    });

    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    expect(eventsOf(file, 0, 'tempo').map((event) => [event.tick, event.usq])).toEqual([
      [0, 500000],
      [6720, 666666],
    ]);
    expect(
      eventsOf(file, 0, 'timeSignature').map((event) => [event.tick, event.numerator, event.denominator, event.clocks]),
    ).toEqual([
      [0, 4, 4, 24],
      [3840, 3, 4, 24],
      [9600, 6, 8, 12],
    ]);
  });
});

describe('renderMidi ties (getRealNoteDuration)', () => {
  it('extends the previous note through a tied note instead of striking again', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [
              { notes: [note({ fret: 5, string: 1 })] },
              { notes: [note({ fret: 5, string: 1, isTied: true })] },
              { notes: [note({ fret: 7, string: 1 })] },
            ],
          ],
        },
      ],
    });

    // Act / Assert
    expect(summary(render(song))).toEqual([
      [69, 0, 1920, 95],
      [71, 1920, 2880, 95],
    ]);
  });

  it('extends a tie across the bar line and across beats on other strings', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [{ notes: [note({ fret: 0, string: 1 })], duration: duration(1) }],
            [{ notes: [note({ fret: 0, string: 2 })] }, { notes: [note({ fret: 0, string: 1, isTied: true })] }],
          ],
        },
      ],
    });

    // Act / Assert
    expect(summary(render(song))).toEqual([
      [64, 0, 5760, 95],
      [59, 3840, 4800, 95],
    ]);
  });

  it('stops at a rest', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [
              { notes: [note({ fret: 0, string: 1 })] },
              { notes: [] },
              { notes: [note({ fret: 0, string: 1, isTied: true })] },
            ],
          ],
        },
      ],
    });

    // Act / Assert
    expect(summary(render(song))).toEqual([[64, 0, 960, 95]]);
  });
});

describe('renderMidi durations (applyDurationEffects)', () => {
  function single(effect: Parameters<typeof note>[0]['effect'], tempo = 120): (number | undefined)[][] {
    return summary(
      render(
        makeSong({
          headers: [{ tempo }],
          tracks: [{ measures: [[{ notes: [note({ fret: 0, string: 1, effect })] }]] }],
        }),
      ),
    );
  }

  it('shortens a dead note to tempo × 30 / 60 ticks', () => {
    // Act / Assert
    expect(single({ deadNote: true })).toEqual([[64, 0, 60, 95]]);
    expect(single({ deadNote: true }, 90)).toEqual([[64, 0, 45, 95]]);
  });

  it('shortens a palm-muted note to tempo × 60 / 60 ticks', () => {
    // Act / Assert
    expect(single({ palmMute: true })).toEqual([[64, 0, 120, 95]]);
  });

  it('halves a staccato note', () => {
    // Act / Assert
    expect(single({ staccato: true })).toEqual([[64, 0, 480, 95]]);
  });

  it('lets a let-ring note ring over the following let-ring beats and the first beat without let ring', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [
              { notes: [note({ fret: 0, string: 1, effect: { letRing: true } })] },
              { notes: [note({ fret: 0, string: 2, effect: { letRing: true } })] },
              { notes: [note({ fret: 0, string: 3 })] },
              { notes: [note({ fret: 0, string: 4 })] },
            ],
          ],
        },
      ],
    });

    // Act / Assert
    expect(summary(render(song))).toEqual([
      [64, 0, 2880, 95],
      [59, 960, 2880, 95],
      [55, 1920, 2880, 95],
      [50, 2880, 3840, 95],
    ]);
  });

  it('does not let a let-ring note ring past a repeat close', () => {
    // Arrange
    const song = makeSong({
      headers: [{ repeatClose: 1 }],
      tracks: [
        { measures: [[{ notes: [note({ fret: 0, string: 1, effect: { letRing: true } })], duration: duration(1) }]] },
      ],
    });

    // Act / Assert
    expect(summary(render(song))).toEqual([
      [64, 0, 3840, 95],
      [64, 3840, 7680, 95],
    ]);
  });
});

describe('renderMidi velocities (getRealVelocity)', () => {
  function velocity(effect: Parameters<typeof note>[0]['effect'], base = 95): number | undefined {
    const song = makeSong({
      tracks: [{ measures: [[{ notes: [note({ fret: 0, string: 1, velocity: base, effect })] }]] }],
    });
    return render(song)[0]?.velocity;
  }

  it.each([
    ['ghost note', { ghostNote: true }, 95, 79],
    ['accent', { accentuatedNote: true }, 95, 111],
    ['heavy accent', { heavyAccentuatedNote: true }, 95, 127],
    ['heavy accent above 127', { heavyAccentuatedNote: true }, 111, 127],
    ['ghost note below the minimum', { ghostNote: true }, 20, 15],
  ] as const)('applies a %s', (_, effect, base, expected) => {
    // Act / Assert
    expect(velocity(effect, base)).toBe(expected);
  });

  it('plays the note after a hammer-on 25 softer', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [
              { notes: [note({ fret: 5, string: 1, effect: { hammer: true } })] },
              { notes: [note({ fret: 0, string: 2 })] },
              { notes: [note({ fret: 7, string: 1 })] },
            ],
          ],
        },
      ],
    });

    // Act / Assert
    expect(render(song).map((played) => played.velocity)).toEqual([95, 95, 70]);
  });
});
