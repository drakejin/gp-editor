import { type Hairpin, type MeasureHeader, type PedalMark, QUARTER_TIME, type Song, isPedalDownBefore } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { DIRECTION_TEXTS, directionsWidth, engraveDirections, hasDirections } from '../src/score/directions';
import type { DrawCommand, LineCommand } from '../src/score/draw';
import { hasDynamicChanges } from '../src/score/dynamics';
import { ROW, rowGeometry } from '../src/score/geometry';
import { engraveHairpins } from '../src/score/hairpins';
import { engravePedals, hasPedals, pedalX } from '../src/score/pedals';
import { engraveRow } from '../src/score/row';
import { MARK_GLYPHS } from '../src/score/symbols/smufl';
import { rasgueadoFingers, rasgueadoLabel } from '../src/score/symbols/rasgueado-label';
import { engraveTabMarks, tabMarkLanes } from '../src/score/symbols/tab-marks';
import { PALETTE, allFinite, textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const BAR = QUARTER_TIME * 4;

const lines = (commands: readonly DrawCommand[]): LineCommand[] => commands.filter((command): command is LineCommand => command.kind === 'line');

/** Two bars of four quarter notes; `marks` puts hairpins on beats ("bar:beat"). */
function song(hairpins: Readonly<Record<string, Hairpin>> = {}, pedals: readonly (readonly PedalMark[] | undefined)[] = []): Song {
  const bar = (number: number) =>
    [0, 1, 2, 3].map((i) => {
      const hairpin = hairpins[`${number - 1}:${i}`];
      return { ...beat(toTux(header(number).start) + i * 960, [note(1, i)]), ...(hairpin === undefined ? {} : { hairpin }) };
    });
  const built = makeSong([bar(1), bar(2)]);
  const track = built.tracks[0]!;
  const measures = track.measures.map((measure, index) => (pedals[index] === undefined ? measure : { ...measure, pedals: pedals[index] }));
  return { ...built, tracks: [{ ...track, measures }] };
}

describe('directions in the score', () => {
  const marked: MeasureHeader = header(1, { directions: ['segno', 'coda', 'fine', 'daSegnoAlCoda'] });

  it('draws the signs at the start of the bar and the words at its end', () => {
    // Act
    const commands = engraveDirections(marked, 200, 50, PALETTE);

    // Assert
    expect(textValues(commands)).toEqual([MARK_GLYPHS.segno.text, MARK_GLYPHS.coda.text, `${DIRECTION_TEXTS.fine}   ${DIRECTION_TEXTS.daSegnoAlCoda}`]);
    expect(commands[0]).toMatchObject({ x: 4, y: 50, font: 'music', align: 'left' });
    expect(commands[2]).toMatchObject({ x: 196, align: 'right', bold: true });
  });

  it('doubles the sign of a segno segno and a double coda, and writes "To Coda" for a Da Coda', () => {
    const commands = engraveDirections(header(1, { directions: ['segnoSegno', 'doubleCoda', 'daCoda'] }), 200, 50, PALETTE);
    expect(textValues(commands)).toEqual([MARK_GLYPHS.segno.text, MARK_GLYPHS.segno.text, MARK_GLYPHS.coda.text, MARK_GLYPHS.coda.text, 'To Coda']);
  });

  it('widens a bar to hold its directions, and only a bar that has some', () => {
    // Arrange
    const plain = song();
    const directed = { ...plain, measureHeaders: [marked, plain.measureHeaders[1]!] };

    // Act / Assert
    expect(directionsWidth(header(1))).toBe(0);
    expect(directionsWidth(marked)).toBeGreaterThan(100);
    expect(layoutMeasure(directed, 0, 0).width).toBeGreaterThanOrEqual(directionsWidth(marked));
    expect([hasDirections(plain), hasDirections(directed)]).toEqual([false, true]);
  });

  it('gets a band under the heading only when the song has directions, the staves moving down', () => {
    // Act
    const plain = rowGeometry('notationAndTab', 6);
    const directed = rowGeometry('notationAndTab', 6, { hasDirections: true });

    // Assert
    expect(plain.directionsY).toBeUndefined();
    expect(directed.directionsY).toBe(ROW.heading + ROW.directionsBaseline);
    expect(directed.notationTop! - plain.notationTop!).toBe(ROW.directions);
    expect(directed.height - plain.height).toBe(ROW.directions);
  });
});

describe('hairpins in the score', () => {
  const context = (marked: Song, measureIndex = 0) => ({ measures: marked.tracks[0]!.measures, measureIndex, layout: layoutMeasure(marked, 0, measureIndex), y: 100, palette: PALETTE });

  it('draws a crescendo opening from its first beat to the beat after it', () => {
    // Arrange
    const marked = song({ '0:0': 'crescendo', '0:1': 'crescendo' });
    const layout = layoutMeasure(marked, 0, 0);

    // Act
    const [upper, lower] = engraveHairpins(context(marked));

    // Assert
    expect(upper).toMatchObject({ x1: layout.beats[0]!.x + 3, y1: 96, x2: layout.beats[2]!.x - 3, y2: 91.5 });
    expect(lower).toMatchObject({ y1: 96, y2: 100.5 });
  });

  it('opens a decrescendo at its start and closes it across the bar line into the next bar', () => {
    // Arrange
    const marked = song({ '0:3': 'decrescendo', '1:0': 'decrescendo' });

    // Act
    const first = engraveHairpins(context(marked, 0));
    const second = engraveHairpins(context(marked, 1));

    // Assert: half closed at the bar line.
    expect(first[0]).toMatchObject({ y1: 91.5, x2: layoutMeasure(marked, 0, 0).width, y2: 93.75 });
    expect(second[0]).toMatchObject({ x1: 0, y1: 93.75, y2: 96 });
  });

  it('makes room for the dynamics band when the track has a hairpin', () => {
    expect([hasDynamicChanges(song().tracks[0]!.measures), hasDynamicChanges(song({ '1:1': 'crescendo' }).tracks[0]!.measures)]).toEqual([false, true]);
  });
});

describe('the sustain pedal in the score', () => {
  const pedalled = song({}, [[{ offset: 0, action: 'down' }, { offset: QUARTER_TIME * 2, action: 'up' }, { offset: QUARTER_TIME * 2, action: 'down' }], [{ offset: BAR, action: 'up' }]]);
  const context = (measureIndex: number) => ({
    measures: pedalled.tracks[0]!.measures,
    measureIndex,
    header: pedalled.measureHeaders[measureIndex]!,
    layout: layoutMeasure(pedalled, 0, measureIndex),
    y: 300,
    palette: PALETTE,
  });

  it('draws Ped., the held line and ✱, and a line held on into the next bar', () => {
    // Act
    const first = engravePedals(context(0));

    // Assert
    expect(textValues(first)).toEqual([MARK_GLYPHS.keyboardPedalPed.text, MARK_GLYPHS.keyboardPedalUp.text, MARK_GLYPHS.keyboardPedalPed.text]);
    expect(lines(first)).toHaveLength(2);
    expect(lines(first)[1]!.x2).toBe(layoutMeasure(pedalled, 0, 0).width);
    expect(allFinite(first)).toBe(true);
  });

  it('starts the held line at the bar line and ends it at the release', () => {
    // Act
    const second = engravePedals(context(1));

    // Assert
    expect(lines(second)[0]!.x1).toBe(0);
    expect(textValues(second)).toEqual([MARK_GLYPHS.keyboardPedalUp.text]);
  });

  it('places a mark between the beats by its time, and knows whether the pedal is held', () => {
    // Arrange
    const layout = layoutMeasure(pedalled, 0, 0);
    const measure = pedalled.tracks[0]!.measures[0]!;
    const head = pedalled.measureHeaders[0]!;

    // Act / Assert
    expect(pedalX(measure, head, layout, QUARTER_TIME / 2)).toBeCloseTo((layout.beats[0]!.x + layout.beats[1]!.x) / 2);
    expect(pedalX(measure, head, layout, BAR)).toBe(layout.width);
    expect([isPedalDownBefore(pedalled.tracks[0]!.measures, 1), isPedalDownBefore(pedalled.tracks[0]!.measures, 2)]).toEqual([true, false]);
    expect([hasPedals(pedalled.tracks[0]!.measures), hasPedals(song().tracks[0]!.measures)]).toEqual([true, false]);
  });

  it('gets a band under the dynamics, under the notation or else under the tab', () => {
    const both = rowGeometry('notationAndTab', 6, { hasPedals: true, hasDynamics: true });
    const tab = rowGeometry('tab', 6, { hasPedals: true });
    expect(both.pedalsY).toBe(both.dynamicsY! - ROW.dynamicsBaseline + ROW.dynamics + ROW.pedalsBaseline);
    expect(tab.pedalsY).toBeGreaterThan(tab.tabTop!);
    expect(rowGeometry('tab', 6).pedalsY).toBeUndefined();
  });

  it('is drawn in its row with the directions and hairpins', () => {
    // Arrange
    const marked = { ...pedalled, measureHeaders: [header(1, { directions: ['segno'] }), pedalled.measureHeaders[1]!] };
    const geometry = rowGeometry('notationAndTab', 6, { hasDirections: true, hasPedals: true, hasDynamics: true });
    const row = { measures: [layoutMeasure(marked, 0, 0), layoutMeasure(marked, 0, 1)] };

    // Act
    const commands = engraveRow({ song: marked, trackIndex: 0, row, headerWidth: 40, mode: 'notationAndTab', geometry, palette: PALETTE });

    // Assert
    expect(textValues(commands)).toEqual(expect.arrayContaining([MARK_GLYPHS.segno.text, MARK_GLYPHS.keyboardPedalPed.text, MARK_GLYPHS.keyboardPedalUp.text]));
  });
});

describe('fades and rasgueado over the tab', () => {
  it('draws fade out as a closing wedge and a volume swell as two', () => {
    // Arrange
    const marked = makeSong([[beat(960, [note(1, 0, { fadeOut: true })]), beat(1920, [note(1, 0, { volumeSwell: true })])]]);
    const measure = marked.tracks[0]!.measures[0]!;

    // Act
    const commands = engraveTabMarks({ measure, layout: layoutMeasure(marked, 0, 0), marksY: 40, palette: PALETTE });

    // Assert
    expect(tabMarkLanes([measure])).toEqual(['labels']);
    expect(lines(commands)).toHaveLength(6);
    expect(lines(commands)[0]).toMatchObject({ y1: 37, y2: 40 });
  });

  it('draws them over the notation staff when the tab is hidden, and only them', () => {
    // Arrange
    const marked = makeSong([[{ ...beat(960, [note(1, 0, { fadeOut: true, tapping: true })]), rasgueado: 'ii' }]]);
    const row = { measures: [layoutMeasure(marked, 0, 0)] };
    const draw = (mode: 'notation' | 'notationAndTab') =>
      engraveRow({ song: marked, trackIndex: 0, row, headerWidth: 40, mode, geometry: rowGeometry(mode, 6, { markLaneCount: 1 }), palette: PALETTE });

    // Act
    const notation = draw('notation');
    const both = draw('notationAndTab');

    // Assert
    expect(textValues(notation).filter((text) => text.startsWith('rasg.') || text === 'T')).toEqual(['rasg. ii']);
    expect(textValues(both).filter((text) => text.startsWith('rasg.'))).toEqual(['rasg. ii']);
  });

  it('writes "rasg." and the pattern over a rasgueado beat', () => {
    // Arrange
    const marked = makeSong([[{ ...beat(960, [note(1, 0)]), rasgueado: 'miiAnapaest' }]]);
    const measure = marked.tracks[0]!.measures[0]!;

    // Act
    const commands = engraveTabMarks({ measure, layout: layoutMeasure(marked, 0, 0), marksY: 40, palette: PALETTE });

    // Assert
    expect(textValues(commands)).toEqual(['rasg. mii an.']);
    expect([rasgueadoFingers('amiTriplet'), rasgueadoFingers('peami'), rasgueadoLabel('ii')]).toEqual(['ami³', 'peami', 'rasg. ii']);
  });
});
