import { describe, expect, it } from 'vitest';
import { MAX_FRET_SPAN } from '../src/chords/creator';
import { tabFret } from '../src/edit/banjo';
import { NECK_FRETS } from '../src/edit/edit-song';
import { previousNoteForTie } from '../src/edit/ties';
import { fingeringCost, refinger } from '../src/fingering/refinger';
import { EMPTY_NOTE_EFFECT, STANDARD_TUNING, durationTicks } from '../src/model/defaults';
import type { Note, NoteEffect, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { beatPitches, songOnStrings } from './helpers/tuning-songs';

const SONG = { kind: 'song' } as const;
/** Banjo, string 1 first: D4 B3 G3 D3 and the short 5th string's G4. */
const BANJO = [62, 59, 55, 50, 67];

function withEffect(note: Note, effect: Partial<NoteEffect>): Note {
  return { ...note, effect: { ...EMPTY_NOTE_EFFECT, ...effect } };
}

function tied(note: Note): Note {
  return { ...note, isTied: true };
}

/** Each note of a track as `measure:start:voice:duration:pitch:tie`, sorted — what a refingering must keep. */
function playedNotes(song: Song, trackIndex = 0): string[] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  return track.measures
    .flatMap((measure, measureIndex) =>
      measure.beats.flatMap((beat) =>
        beat.voices.flatMap((voice, voiceIndex) =>
          voice.notes.map((note) => {
            const pitch = (track.strings[note.string - 1]?.tuning ?? Number.NaN) + note.fret;
            return `${measureIndex}:${beat.start}:${voiceIndex}:${durationTicks(voice.duration)}:${pitch}:${note.isTied ? 't' : ''}`;
          }),
        ),
      ),
    )
    .sort();
}

/** Each note's effects with the frets that sit on its string turned into pitches, so a moved note's effects compare equal. */
function effectMeanings(song: Song, trackIndex = 0): string[] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  return track.measures
    .flatMap((measure) =>
      measure.beats.flatMap((beat) =>
        beat.voices.flatMap((voice) =>
          voice.notes.map((note) => {
            const open = track.strings[note.string - 1]?.tuning ?? Number.NaN;
            const { grace, trill, harmonic, ...rest } = note.effect;
            const meaning = {
              ...rest,
              grace: grace === undefined ? undefined : { ...grace, fret: open + grace.fret },
              trill: trill === undefined ? undefined : { ...trill, fret: open + trill.fret },
              harmonic: harmonic === undefined ? undefined : { ...harmonic, data: harmonic.type === 'tapped' ? open + harmonic.data : harmonic.data },
            };
            return `${beat.start}:${open + note.fret}:${JSON.stringify(meaning)}`;
          }),
        ),
      ),
    )
    .sort();
}

/** Problems a fingering must not have: two notes sounding on one string, a tie off its note's string, a fret off the neck. */
function fingeringProblems(song: Song, trackIndex = 0): string[] {
  const track = song.tracks[trackIndex];
  if (track === undefined || track.isPercussion) {
    return [];
  }
  const tuning = track.strings.map((string) => string.tuning);
  const neck = Math.max(0, NECK_FRETS - track.offset);
  const problems: string[] = [];
  const sounding = new Map<number, { readonly end: number; readonly where: string }>();
  track.measures.forEach((measure, measureIndex) =>
    measure.beats.forEach((beat, beatIndex) =>
      beat.voices.forEach((voice, voiceIndex) =>
        voice.notes.forEach((note) => {
          const where = `${measureIndex}:${beatIndex}:${voiceIndex}:${note.string}`;
          const ringing = sounding.get(note.string);
          if (ringing !== undefined && ringing.end > beat.start && !note.isTied) {
            problems.push(`${where} sounds over ${ringing.where}`);
          }
          sounding.set(note.string, { end: Math.max(ringing?.end ?? 0, beat.start + durationTicks(voice.duration)), where });
          if (note.fret < 0 || tabFret(tuning, note.string, note.fret) > neck) {
            problems.push(`${where} fret ${note.fret} off the neck`);
          }
          if (note.isTied) {
            const previous = previousNoteForTie(song, { trackIndex, measureIndex, beatIndex, voiceIndex, string: note.string });
            if (previous === undefined || previous.fret !== note.fret) {
              problems.push(`${where} tie continues nothing`);
            }
          }
        }),
      ),
    ),
  );
  return problems;
}

/** Each hammer-on / legato or shift slide as `pitch>pitch of the next note on its string` (as the score links them), sorted. */
function linkPitches(song: Song, trackIndex = 0): string[] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  const pitch = (note: Note) => (track.strings[note.string - 1]?.tuning ?? Number.NaN) + note.fret;
  const nextOn = (measureIndex: number, beatIndex: number, voiceIndex: number, string: number): Note | undefined => {
    for (const m of [measureIndex, measureIndex + 1]) {
      const beats = track.measures[m]?.beats ?? [];
      for (let b = m === measureIndex ? beatIndex + 1 : 0; b < beats.length; b++) {
        const voice = beats[b]?.voices[voiceIndex];
        if (voice !== undefined && !voice.isEmpty) {
          if (voice.notes.length === 0) {
            return undefined;
          }
          const found = voice.notes.find((note) => note.string === string);
          if (found !== undefined) {
            return found;
          }
        }
      }
    }
    return undefined;
  };
  return track.measures
    .flatMap((measure, m) =>
      measure.beats.flatMap((beat, b) =>
        beat.voices.flatMap((voice, v) =>
          voice.notes
            .filter((note) => note.effect.hammer || note.effect.slides.some((slide) => slide === 'legato' || slide === 'shift'))
            .map((note) => {
              const next = nextOn(m, b, v, note.string);
              return `${m}:${beat.start}:${v}:${pitch(note)}>${next === undefined ? '-' : pitch(next)}`;
            }),
        ),
      ),
    )
    .sort();
}

/** Fretted positions of each beat, for the span check: highest − lowest fretted fret (open strings left out). */
function beatSpans(song: Song, trackIndex = 0): number[] {
  const track = song.tracks[trackIndex];
  const tuning = track?.strings.map((string) => string.tuning) ?? [];
  return (track?.measures ?? []).flatMap((measure) =>
    measure.beats.map((beat) => {
      const frets = beat.voices.flatMap((voice) => voice.notes).filter((note) => note.fret > 0 && !note.effect.deadNote).map((note) => tabFret(tuning, note.string, note.fret));
      return frets.length === 0 ? 0 : Math.max(...frets) - Math.min(...frets);
    }),
  );
}

describe('refinger: what it keeps', () => {
  it('leaves a drum track, an empty scope and a missing track as they were', () => {
    // Arrange
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36))]]], { isPercussion: true });
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(1, 0))]]]);

    // Act + Assert
    expect(refinger(drums, SONG).song).toBe(drums);
    expect(refinger(song, { kind: 'track', trackIndex: 4 }).song).toBe(song);
    expect(refinger(song, SONG)).toMatchObject({ song, restrung: 0 });
  });

  it('keeps every pitch, rhythm, tie and effect of a song, and never mutates it', () => {
    // Arrange
    const song = deepFreeze(
      songOnStrings(STANDARD_TUNING, [
        [[play(4, n(2, 5), n(3, 4)), play(4, tied(n(2, 5))), play(8, n(3, 9)), play(8, n(4, 7)), rest(4)]],
        [[play(2, withEffect(n(2, 8), { vibrato: true })), play(2, n(5, 7), n(4, 9), n(3, 9))]],
      ]),
    );

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(playedNotes(result.song)).toEqual(playedNotes(song));
    expect(effectMeanings(result.song)).toEqual(effectMeanings(song));
    expect(fingeringProblems(result.song)).toEqual([]);
    assertEditInvariants(result.song);
  });
});

describe('refinger: easier fingerings', () => {
  it('plays a note on the open string that sounds it', () => {
    // Arrange: E4 at the 5th fret of the B string is the open high E.
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(2, 5))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:1:1/0']);
    expect(result.restrung).toBe(1);
    expect(result.after.total).toBeLessThan(result.before.total);
  });

  it('keeps the hand in one position instead of jumping between the 12th and the 1st fret', () => {
    // Arrange: E5 at the 12th fret of string 1 against C4 at the 1st fret of string 2, four times.
    const song = songOnStrings(STANDARD_TUNING, [[[play(8, n(1, 12)), play(8, n(2, 1)), play(8, n(1, 12)), play(8, n(2, 1)), play(8, n(1, 12)), play(8, n(2, 1)), play(8, n(1, 12)), play(8, n(2, 1))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(beatPitches(result.song)).toEqual(beatPitches(song));
    expect(result.before.handTravel).toBeGreaterThan(40);
    expect(result.after.handTravel).toBeLessThanOrEqual(3);
    expect(result.after.total).toBeLessThan(result.before.total);
  });

  it('keeps a chord within the hand: its fretted notes less than MAX_FRET_SPAN frets apart', () => {
    // Arrange: A2 at the 5th fret of the low E with E3 and A3 at the 2nd fret: the open A string takes A2.
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(6, 5), n(4, 2), n(3, 2))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:1:3/2,4/2,5/0']);
    expect(Math.max(...beatSpans(result.song))).toBeLessThan(MAX_FRET_SPAN);
  });

  it('reports the cost it lowered, the same as fingeringCost before and after', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 9)), play(4, n(1, 0)), play(4, n(3, 9)), play(4, n(2, 5))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(fingeringCost(song, SONG)).toEqual(result.before);
    expect(fingeringCost(result.song, SONG)).toEqual(result.after);
    expect(result.after.total).toBeLessThanOrEqual(result.before.total);
  });
});

describe('refinger: notes that stay together', () => {
  it('moves a tied note with the note it continues', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(2, n(2, 5)), play(2, tied(n(2, 5)))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:2:1/0', '1920:2:1/0']);
    expect(result.song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes[0]?.isTied).toBe(true);
    expect(fingeringProblems(result.song)).toEqual([]);
  });

  it('keeps a tie that continues nothing where it is, and puts no note before it on its string', () => {
    // Arrange: C4 at the 5th fret of the G string, then a tied B3 on the open B string the C4 is not on.
    const song = songOnStrings(STANDARD_TUNING, [[[play(2, n(3, 5)), play(2, tied(n(2, 0)))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert: C4 would sit lower at the 1st fret of the B string, where the tie would then continue it.
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:2:3/5', '1920:2:2/0']);
  });

  it('keeps a hammer-on and its note on one string, where an unlinked pair would split', () => {
    // Arrange: A3 then B3 on the G string; alone, B3 would take the open B string.
    const linked = songOnStrings(STANDARD_TUNING, [[[play(2, withEffect(n(3, 2), { hammer: true })), play(2, n(3, 4))]]]);
    const unlinked = songOnStrings(STANDARD_TUNING, [[[play(2, n(3, 2)), play(2, n(3, 4))]]]);

    // Act
    const together = refinger(linked, SONG);
    const apart = refinger(unlinked, SONG);

    // Assert
    const strings = voiceLayout(together.song, 0, 0, 0).map((event) => event.split(':')[2]?.split('/')[0]);
    expect(new Set(strings).size).toBe(1);
    expect(voiceLayout(apart.song, 0, 0, 0)[1]).toBe('1920:2:2/0');
    expect(together.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.effect.hammer).toBe(true);
  });

  it('keeps a legato slide across a bar line on one string', () => {
    // Arrange: a legato slide from G3 at the 15th fret of the low E into A3 in the next bar (the open G string cannot slide).
    const song = songOnStrings(STANDARD_TUNING, [[[rest(2), play(2, withEffect(n(6, 15), { slides: ['legato'] }))]], [[play(1, n(6, 17))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    const first = voiceLayout(result.song, 0, 0, 0)[1]?.split(':')[2]?.split('/')[0];
    const second = voiceLayout(result.song, 0, 1, 0)[0]?.split(':')[2]?.split('/')[0];
    expect(first).toBe(second);
    expect(playedNotes(result.song)).toEqual(playedNotes(song));
  });

  it('never puts a note on a string another voice still sounds', () => {
    // Arrange: voice 2 holds B3 on the open B string for a half note while voice 1 plays C4 then E4.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(3, 5)), play(4, n(2, 5)), rest(2)], [play(2, n(2, 0)), rest(2)]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(fingeringProblems(result.song)).toEqual([]);
    expect(playedNotes(result.song)).toEqual(playedNotes(song));
  });
});

describe('refinger: effects that hold a note in place', () => {
  it('keeps a bent note off the open string', () => {
    // Arrange
    const bend = { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] };
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, withEffect(n(2, 5), { bend }))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(result.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.fret).toBeGreaterThan(0);
  });

  it('keeps a natural harmonic where it is', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, withEffect(n(2, 12), { harmonic: { type: 'natural', data: 0 } }))]]]);

    // Act + Assert
    expect(refinger(song, SONG).song).toBe(song);
  });

  it('moves a grace note’s fret with its note, never below the nut', () => {
    // Arrange: E4 at the 5th fret of string 2 from a grace D4 (fret 3): the open E string has no fret for the grace.
    const grace = { fret: 3, duration: 3, velocity: 95, transition: 'hammer' as const, onBeat: false, isDead: false };
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, withEffect(n(2, 5), { grace }))]]]);

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(effectMeanings(result.song)).toEqual(effectMeanings(song));
    expect(voiceLayout(result.song, 0, 0, 0)).not.toEqual(['0:1:1/0']);
  });
});

describe('refinger: a 5-string banjo', () => {
  it('plays G4 on the open short 5th string and never puts a lower pitch on it', () => {
    // Arrange: G4 at the 5th fret of string 1, then D4 open, B3 open.
    const song = songOnStrings(BANJO, [[[play(4, n(1, 5)), play(4, n(1, 0)), play(4, n(2, 0)), play(4, n(1, 5))]]], { program: 105 });

    // Act
    const result = refinger(song, SONG);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:5/0', '960:4:1/0', '1920:4:2/0', '2880:4:5/0']);
    expect(fingeringProblems(result.song)).toEqual([]);
  });
});

describe('refinger: a scope', () => {
  it('re-fingers only the selected beats of the selected voice', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 5)), play(4, n(2, 5)), play(4, n(2, 5)), play(4, n(2, 5))]]]);
    const scope = { kind: 'beats', from: { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 }, to: { trackIndex: 0, measureIndex: 0, beatIndex: 2, voiceIndex: 0 } } as const;

    // Act
    const result = refinger(song, scope);

    // Assert
    expect(voiceLayout(result.song, 0, 0, 0)).toEqual(['0:4:2/5', '960:4:1/0', '1920:4:1/0', '2880:4:2/5']);
    expect(result.restrung).toBe(2);
  });
});

const SWEEP: readonly (readonly [FixtureFolder, string])[] = (['guitarpro5', 'guitarpro7', 'guitarpro8'] as const).flatMap((folder) =>
  listFixtures(folder).map((name): [FixtureFolder, string] => [folder, name]),
);

describe('refinger: every Guitar Pro 5, 7 and 8 fixture', () => {
  it.each(SWEEP)('%s/%s keeps its pitches, rhythm, ties and effects, and lowers or keeps the cost', (folder, name) => {
    // Arrange
    const song = readSong(loadFixture(folder, name));

    // Act
    const result = refinger(song, SONG);

    // Assert
    song.tracks.forEach((track, trackIndex) => {
      expect(playedNotes(result.song, trackIndex)).toEqual(playedNotes(song, trackIndex));
      expect(effectMeanings(result.song, trackIndex)).toEqual(effectMeanings(song, trackIndex));
      expect(linkPitches(result.song, trackIndex)).toEqual(linkPitches(song, trackIndex));
      const before = new Set(fingeringProblems(song, trackIndex));
      expect(fingeringProblems(result.song, trackIndex).filter((problem) => !before.has(problem))).toEqual([]);
      const spansBefore = beatSpans(song, trackIndex);
      beatSpans(result.song, trackIndex).forEach((span, beat) => expect(span < MAX_FRET_SPAN || span <= (spansBefore[beat] ?? 0)).toBe(true));
    });
    expect(result.after.total).toBeLessThanOrEqual(result.before.total);
    expect(result.song.tracks.filter((track) => track.isPercussion)).toEqual(song.tracks.filter((track) => track.isPercussion));
  });
});
