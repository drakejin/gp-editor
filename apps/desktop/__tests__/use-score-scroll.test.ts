import { lineAt, lineOf, linePlace } from '../src/hooks/use-score-scroll';
import type { ScoreLayout, ScoreStaff, ScoreSystem } from '../src/score/score-layout';

const staff = (trackIndex: number, top: number, height: number) => ({ trackIndex, top, height }) as ScoreStaff;
const system = (firstBar: number, top: number, staves: ScoreStaff[]): ScoreSystem => ({
  rows: staves.map(() => ({ measures: [{ measureIndex: firstBar, width: 100, beats: [], showTimeSignature: false, showTempo: false, showTripletFeel: false }] })),
  namesWidth: 0, headerWidth: 40, staves, top, height: staves.reduce((sum, each) => sum + each.height, 0),
});

describe('the page lines of systems of different heights', () => {
  // Arrange: two tracks; the first system 300 points tall, the second 180
  const layout: ScoreLayout = {
    staves: [staff(0, 0, 200), staff(2, 200, 160)],
    systems: [system(0, 0, [staff(0, 0, 180), staff(2, 180, 120)]), system(4, 300, [staff(0, 0, 100), staff(2, 100, 80)])],
    clefWidth: 40,
  };

  it('places each line at its system’s top plus its staff’s top in that system, as tall as that staff', () => {
    expect(linePlace(layout, lineAt(layout, 0))).toEqual({ top: 0, height: 180 });
    expect(linePlace(layout, lineAt(layout, 1))).toEqual({ top: 180, height: 120 });
    expect(linePlace(layout, lineAt(layout, 2))).toEqual({ top: 300, height: 100 });
    expect(linePlace(layout, lineAt(layout, 3))).toEqual({ top: 400, height: 80 });
  });

  it('finds the line of a bar on a track’s staves', () => {
    expect(lineOf(layout, 4, 2)).toBe(3);
    expect(lineOf(layout, 0)).toBe(0);
    expect(lineOf(layout, 9)).toBe(-1);
  });
});
