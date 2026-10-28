import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { SMUFL } from '../src/score/draw';
import { rowGeometry } from '../src/score/geometry';
import { positionY } from '../src/score/notation/metrics';
import { trackTransposition, writtenMidi } from '../src/score/notation/pitch';
import { engraveRow, rowHeaderWidth } from '../src/score/row';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Middle C (MIDI 60): the B string's first fret. */
const MIDDLE_C = note(2, 1);

function songOn(program: number | undefined, isPercussion = false): Song {
  const song = makeSong([[beat(0, [MIDDLE_C])]]);
  return program === undefined ? song : { ...song, channels: [{ ...DEFAULT_CHANNEL, id: 1, program, isPercussion }] };
}

function engraveNotationRow(song: Song) {
  const track = song.tracks[0]!;
  const geometry = rowGeometry('notation', track.strings.length, { markLaneCount: 0, hasDynamics: false });
  const row = { measures: [layoutMeasure(song, 0, 0)] };
  const commands = engraveRow({ song, trackIndex: 0, row, headerWidth: rowHeaderWidth('notation', track), mode: 'notation', geometry, palette: PALETTE, markLanes: [] });
  return { commands, top: geometry.notationTop ?? 0 };
}

/** The y of every black notehead the notation row draws. */
function noteheadYs(song: Song): { readonly ys: number[]; readonly top: number } {
  const { commands, top } = engraveNotationRow(song);
  const ys = texts(commands)
    .filter((command) => command.text === SMUFL.noteheadBlack)
    .map((command) => command.y);
  return { ys, top };
}

const CLEFS: readonly string[] = [SMUFL.gClef, SMUFL.gClef8vb, SMUFL.fClef, SMUFL.fClef8vb, SMUFL.cClef, SMUFL.cClef8vb];

/** The clefs the notation row draws. */
function clefsOf(song: Song): string[] {
  return texts(engraveNotationRow(song).commands)
    .map((command) => command.text)
    .filter((text) => CLEFS.includes(text));
}

function withClef(song: Song, clef: 'treble' | 'bass' | 'alto'): Song {
  const track = song.tracks[0]!;
  return { ...song, tracks: [{ ...track, measures: track.measures.map((measure) => ({ ...measure, clef })) }] };
}

describe('trackTransposition', () => {
  it('writes guitars and basses an octave above their sound, and a track without a channel as a guitar', () => {
    expect([trackTransposition(songOn(25), 0), trackTransposition(songOn(33), 0), trackTransposition(songOn(undefined), 0)]).toEqual([12, 12, 12]);
  });

  it('writes a ukulele as it sounds: a guitar sound on four strings tuned G3 or higher', () => {
    const song = songOn(24);
    const ukulele = { ...song, tracks: [{ ...song.tracks[0]!, strings: [69, 64, 60, 67].map((tuning, i) => ({ number: i + 1, tuning })) }] };
    expect(trackTransposition(ukulele, 0)).toBe(0);
    expect(trackTransposition(song, 0)).toBe(12);
  });

  it('writes a piano, a voice, a violin and a drum kit as they sound', () => {
    expect([0, 53, 40].map((program) => trackTransposition(songOn(program), 0))).toEqual([0, 0, 0]);
    expect(trackTransposition(songOn(0, true), 0)).toBe(0);
  });

  it('writes a note its transposition above its sounding pitch', () => {
    const track = songOn(0).tracks[0]!;
    expect(writtenMidi(track, MIDDLE_C, 0)).toBe(60);
    expect(writtenMidi(track, MIDDLE_C, 12)).toBe(72);
  });
});

describe('notation: each instrument written as Guitar Pro writes it', () => {
  it('draws a piano’s middle C on the ledger line below the treble staff, where the page has it', () => {
    // Act
    const { ys, top } = noteheadYs(songOn(0));

    // Assert
    expect(ys).toEqual([positionY(top, -2)]);
  });

  it('draws a guitar’s middle C an octave higher, in the third space, as guitar music is written', () => {
    // Act
    const { ys, top } = noteheadYs(songOn(25));

    // Assert
    expect(ys).toEqual([positionY(top, 5)]);
  });
});

describe('notation: the clef says how the track sounds', () => {
  it('writes a guitar’s and a bass’s clefs with the 8 below: they sound an octave lower', () => {
    expect(clefsOf(songOn(25))).toEqual([SMUFL.gClef8vb]);
    expect(clefsOf(withClef(songOn(33), 'bass'))).toEqual([SMUFL.fClef8vb]);
  });

  it('writes a piano’s, a voice’s or a viola’s clef without it: they sound as written', () => {
    expect(clefsOf(songOn(0))).toEqual([SMUFL.gClef]);
    expect(clefsOf(withClef(songOn(0), 'bass'))).toEqual([SMUFL.fClef]);
    expect(clefsOf(songOn(53))).toEqual([SMUFL.gClef]);
    expect(clefsOf(withClef(songOn(41), 'alto'))).toEqual([SMUFL.cClef]);
  });
});
