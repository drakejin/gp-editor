import { beatMarks, bendLabel, fretLabel } from '../src/lib/notation';
import { beat, note } from '../test-support/songs';

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
