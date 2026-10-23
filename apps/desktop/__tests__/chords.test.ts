import { type Beat, type Chord, type Song, readSong } from '@gp-editor/core';
import type { MeasureLayout } from '../src/lib/layout';
import { CHORD_NAME, type ChordDisplay, DEFAULT_CHORD_DISPLAY, chordBands, chordBeatWidth, engraveChords, hasChords } from '../src/score/chords';
import { readFixture } from '../test-support/fixtures';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const C_MAJOR: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };
const NAME_ONLY: Chord = { name: 'N.C.', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] };
const NAMES: ChordDisplay = { showsNames: true, showsDiagrams: false };
const DIAGRAMS: ChordDisplay = { showsNames: false, showsDiagrams: true };
const NOTHING: ChordDisplay = { showsNames: false, showsDiagrams: false };

const withChord = (target: Beat, chord: Chord): Beat => ({ ...target, chord });

/** Bar 1: a chord on beat 1, nothing on beat 2. */
function chordSong(chord: Chord = C_MAJOR): Song {
  return makeSong([[withChord(beat(960, [note(2, 1)]), chord), beat(1920, [note(1, 0)])]]);
}

const layout: MeasureLayout = {
  measureIndex: 0,
  width: 200,
  beats: [
    { beatIndex: 0, x: 40 },
    { beatIndex: 1, x: 120 },
  ],
  showTimeSignature: false,
  showTempo: false,
  showTripletFeel: false,
};

describe('hasChords', () => {
  it('is true when a beat of the track has a chord', () => {
    expect(hasChords(chordSong().tracks[0]!.measures)).toBe(true);
    expect(hasChords(makeSong([[beat(960, [note(1, 0)])]]).tracks[0]!.measures)).toBe(false);
  });
});

describe('chordBands', () => {
  it('makes room for the names and diagrams shown, none without chords', () => {
    // Arrange
    const measures = chordSong().tracks[0]!.measures;

    // Act + Assert
    expect(chordBands(measures, DEFAULT_CHORD_DISPLAY)).toEqual({ hasChordNames: true, hasChordDiagrams: true });
    expect(chordBands(measures, NAMES)).toEqual({ hasChordNames: true, hasChordDiagrams: false });
    expect(chordBands(measures, DIAGRAMS)).toEqual({ hasChordNames: false, hasChordDiagrams: true });
    expect(chordBands(measures, NOTHING)).toEqual({ hasChordNames: false, hasChordDiagrams: false });
    expect(chordBands(makeSong([[beat(960, [])]]).tracks[0]!.measures, DEFAULT_CHORD_DISPLAY)).toEqual({ hasChordNames: false, hasChordDiagrams: false });
  });

  it('leaves out the diagram row when no chord of the track has a diagram', () => {
    expect(chordBands(chordSong(NAME_ONLY).tracks[0]!.measures, DEFAULT_CHORD_DISPLAY)).toEqual({ hasChordNames: true, hasChordDiagrams: false });
  });
});

describe('engraveChords', () => {
  it('centres the name over its beat and the diagram under it', () => {
    // Act
    const commands = engraveChords({ measure: chordSong().tracks[0]!.measures[0]!, layout, namesY: 38, diagramsTop: 46, palette: PALETTE });

    // Assert
    const [name] = texts(commands);
    expect(name).toMatchObject({ text: 'C', x: 40, y: 38, align: 'center', bold: true, size: CHORD_NAME.size });
    const diagram = commands.filter((command) => command.kind === 'circle');
    expect(diagram.length).toBeGreaterThan(0);
    expect(diagram.every((command) => command.kind === 'circle' && command.y > 46)).toBe(true);
  });

  it('draws only the rows it is given', () => {
    const measure = chordSong().tracks[0]!.measures[0]!;
    expect(engraveChords({ measure, layout, namesY: 8, palette: PALETTE })).toHaveLength(1);
    expect(texts(engraveChords({ measure, layout, diagramsTop: 0, palette: PALETTE }))).toHaveLength(0);
    expect(engraveChords({ measure, layout, palette: PALETTE })).toEqual([]);
  });

  it('draws the chord names and diagrams of the Guitar Pro 7 chords file', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro7', 'chords.gp'));
    const measure = song.tracks[0]!.measures[1]!;
    const beats = measure.beats.map((_, beatIndex) => ({ beatIndex, x: 30 + beatIndex * 50 }));

    // Act
    const commands = engraveChords({ measure, layout: { ...layout, measureIndex: 1, beats }, namesY: 8, diagramsTop: 16, palette: PALETTE });

    // Assert
    expect(texts(commands).map((text) => text.text)).toEqual(['D', 'Dm', 'D', '5', 'Dm', '5']);
  });
});

describe('chordBeatWidth', () => {
  it('is wide enough for the diagram or a long name, and nothing for a beat without a chord', () => {
    const chordBeat = withChord(beat(960, []), C_MAJOR);
    expect(chordBeatWidth(beat(960, []), DEFAULT_CHORD_DISPLAY)).toBe(0);
    expect(chordBeatWidth(chordBeat, DIAGRAMS)).toBeGreaterThan(25);
    expect(chordBeatWidth(withChord(chordBeat, { ...C_MAJOR, name: 'Cmaj7#11/G' }), NAMES)).toBeGreaterThan(chordBeatWidth(chordBeat, NAMES));
    expect(chordBeatWidth(withChord(chordBeat, { name: 'D', firstFret: 5, frets: [5, 7, 7, 7, 5, -1] }), DIAGRAMS)).toBeGreaterThan(chordBeatWidth(chordBeat, DIAGRAMS));
    expect(chordBeatWidth(chordBeat, NOTHING)).toBe(0);
  });
});
