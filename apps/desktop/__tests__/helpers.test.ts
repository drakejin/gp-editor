import { base64ToBytes } from '../src/lib/base64';
import { DIGIT_WINDOW_MS, nextFretEntry } from '../src/lib/fretInput';
import { adjacentNote, noteAddresses } from '../src/lib/navigation';
import { beatMarks, bendLabel, fretLabel } from '../src/lib/notation';
import { pitchName, tuningLabel } from '../src/lib/pitch';
import { beat, makeSong, note } from '../test-support/songs';

describe('base64ToBytes', () => {
  it('decodes padded and unpadded input', () => {
    expect([...base64ToBytes('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    expect([...base64ToBytes('aGk')]).toEqual([0x68, 0x69]);
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base64ToBytes('ab$c')).toThrow('Invalid base64');
  });
});

describe('nextFretEntry', () => {
  it('combines two quick digits into one fret', () => {
    const first = nextFretEntry(undefined, 1, 1000);
    expect(nextFretEntry(first, 2, 1000 + DIGIT_WINDOW_MS).value).toBe(12);
  });

  it('starts over after the window, past the max fret, or after two digits', () => {
    const first = nextFretEntry(undefined, 1, 0);
    expect(nextFretEntry(first, 2, DIGIT_WINDOW_MS + 1).value).toBe(2);
    expect(nextFretEntry({ value: 3, at: 0 }, 5, 10).value).toBe(5);
    expect(nextFretEntry({ value: 12, at: 0 }, 1, 10).value).toBe(1);
  });
});

describe('navigation', () => {
  const song = makeSong([[beat(960, [note(3, 0), note(1, 2)]), beat(1920, [note(6, 5)])]]);

  it('lists notes beat by beat, high string first', () => {
    expect(noteAddresses(song, 0).map((a) => `${a.beat}:${a.note}`)).toEqual(['0:1', '0:0', '1:0']);
    expect(noteAddresses(song, 4)).toEqual([]);
  });

  it('moves to the adjacent note and stops at the ends', () => {
    const first = adjacentNote(song, 0, undefined, 1);
    expect(first).toMatchObject({ beat: 0, note: 1 });
    expect(adjacentNote(song, 0, first, -1)).toEqual(first);
    expect(adjacentNote(song, 0, first, 1)).toMatchObject({ beat: 0, note: 0 });
    expect(adjacentNote(song, 0, { track: 0, measure: 9, beat: 0, voice: 0, note: 0 }, 1)).toEqual(first);
  });
});

describe('notation labels', () => {
  it('formats frets like Guitar Pro', () => {
    expect(fretLabel(note(1, 5))).toBe('5');
    expect(fretLabel(note(1, 5, { deadNote: true }))).toBe('x');
    expect(fretLabel(note(1, 12, { harmonic: { type: 'natural', data: 0 } }))).toBe('<12>');
    expect(fretLabel({ ...note(1, 7), isTied: true })).toBe('(7)');
    expect(fretLabel(note(1, 7, { ghostNote: true }))).toBe('(7)');
  });

  it('names bend amounts', () => {
    expect([1, 2, 4, 6, 8, 3].map(bendLabel)).toEqual(['¼', '½', 'full', '1½', '2', '½']);
  });

  it('collects effect marks for a beat', () => {
    const b = beat(960, [
      note(1, 5, { palmMute: true, slides: ['shift'], bend: { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] } }),
      note(2, 5, { palmMute: true, harmonic: { type: 'artificial', data: 12 }, trill: { fret: 7, duration: { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } } } }),
    ]);
    expect(beatMarks({ ...b, stroke: { direction: 'down', value: 8 } })).toEqual(['P.M.', 'sl.', '↑full', 'A.H.', 'tr', '↓']);
  });

  it('labels sustained effects only where the run starts', () => {
    const ringing = beat(960, [note(1, 0, { letRing: true, palmMute: true })]);
    const muted = beat(1920, [note(1, 0, { palmMute: true })]);
    expect(beatMarks(ringing)).toEqual(['P.M.', 'let ring']);
    expect(beatMarks(ringing, ringing)).toEqual([]);
    expect(beatMarks(ringing, muted)).toEqual(['let ring']);
  });
});

describe('pitch', () => {
  it('names MIDI pitches and tunings', () => {
    expect(pitchName(64)).toBe('E4');
    expect(pitchName(40)).toBe('E2');
    expect(tuningLabel([64, 59, 55, 50, 45, 40])).toBe('E A D G B E');
  });
});
