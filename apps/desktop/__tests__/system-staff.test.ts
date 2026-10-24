import type { Song } from '@gp-editor/core';
import type { DrawCommand, LineCommand } from '../src/score/draw';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { translateCommands } from '../src/score/draw';
import { type RowContext, engraveRow, placeRow } from '../src/score/row';
import { type ScoreLayout, layoutScore } from '../src/score/score-layout';
import { type StaffDecor, engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { stringY } from '../src/score/tab';
import { PALETTE, allFinite, textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note, withTrack } from '../test-support/songs';

const BASS = { name: 'Electric Bass', strings: [43, 38, 33, 28].map((tuning, i) => ({ number: i + 1, tuning })) };

/** Two bars on a guitar (Score + Tab) and a bass (Tab). */
function twoTracks(): Song {
  const guitar = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(2, 5)])]], [header(1), header(2)]);
  return withTrack({ ...guitar, tracks: guitar.tracks.map((t) => ({ ...t, name: 'Lead Guitar' })) }, [[beat(960, [note(4, 3)])], [beat(4800, [note(3, 5)])]], BASS);
}

function staffContext(song: Song, layout: ScoreLayout, staffIndex: number, systemIndex = 0): RowContext {
  const staff = layout.staves[staffIndex]!;
  const system = layout.systems[systemIndex]!;
  return {
    song, trackIndex: staff.trackIndex, row: system.rows[staffIndex]!, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry,
    palette: PALETTE, markLanes: staff.markLanes, hasHeading: staff.hasHeading,
  };
}

const lines = (commands: readonly DrawCommand[]) => commands.filter((c): c is LineCommand => c.kind === 'line');
const verticalAt = (commands: readonly DrawCommand[], x: number) => lines(commands).filter((c) => c.x1 === x && c.x2 === x);

describe('engraveSystemStaff', () => {
  const song = twoTracks();
  const layout = layoutScore(song, [{ trackIndex: 0, mode: 'notationAndTab' }, { trackIndex: 1, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, 900);
  const decorOf = (staffIndex: number, systemIndex = 0): StaffDecor => staffDecor(song, layout, systemIndex, staffIndex)!;

  it('draws the staff’s own row right of the names column', () => {
    // Arrange
    const context = staffContext(song, layout, 0);
    const decor = decorOf(0);

    // Act
    const commands = engraveSystemStaff(context, decor);

    // Assert
    expect(commands.slice(0, engraveRow(context).length)).toEqual(translateCommands(engraveRow(context), decor.namesWidth, 0));
    expect(allFinite(commands)).toBe(true);
  });

  it('labels the first system with the track names and the later ones with the short names', () => {
    expect(decorOf(0).label).toBe('Lead Guitar');
    expect(decorOf(1).label).toBe('Electric Bass');
    expect(staffDecor(song, { ...layout, systems: [layout.systems[0]!, layout.systems[0]!] }, 1, 1)?.label).toBe('Elec. Bass');
    expect(textValues(engraveSystemStaff(staffContext(song, layout, 1), decorOf(1)))).toContain('Electric Bass');
  });

  it('draws the bar numbers and tempo over the top staff only', () => {
    // Act
    const top = textValues(engraveSystemStaff(staffContext(song, layout, 0), decorOf(0)));
    const below = textValues(engraveSystemStaff(staffContext(song, layout, 1), decorOf(1)));

    // Assert
    expect(top).toEqual(expect.arrayContaining(['1', '2', '♩ = 120']));
    expect(below).not.toContain('♩ = 120');
    expect(below).not.toContain('2');
  });

  it('runs the bar lines through the system: down from the top staff, and on from the canvas top into the lower one', () => {
    // Arrange
    const contextTop = staffContext(song, layout, 0);
    const contextBelow = staffContext(song, layout, 1);
    const decorTop = decorOf(0);
    const decorBelow = decorOf(1);
    const [, second] = placeRow(contextTop.row, layout.clefWidth);
    const barLineX = decorTop.namesWidth + second!.x + second!.layout.width;
    const bassTabTop = layout.staves[1]!.geometry.tabTop!;
    const guitarTabBottom = stringY(layout.staves[0]!.geometry.tabTop!, 6);

    // Act
    const top = verticalAt(engraveSystemStaff(contextTop, decorTop), barLineX);
    const below = verticalAt(engraveSystemStaff(contextBelow, decorBelow), barLineX);

    // Assert
    expect(top).toEqual(expect.arrayContaining([expect.objectContaining({ y1: guitarTabBottom, y2: decorTop.height })]));
    expect(below).toEqual(expect.arrayContaining([expect.objectContaining({ y1: 0, y2: bassTabTop })]));
    expect(below.some((line) => line.y2 > stringY(bassTabTop, 4))).toBe(false);
  });

  it('joins the staves with a bracket left of them, its ends on the first and last staff', () => {
    // Act
    const top = engraveSystemStaff(staffContext(song, layout, 0), decorOf(0));
    const below = engraveSystemStaff(staffContext(song, layout, 1), decorOf(1));
    const thick = (commands: readonly DrawCommand[]) => lines(commands).filter((c) => c.width >= 3 && c.x1 < decorOf(0).namesWidth);

    // Assert
    expect(thick(top)).toHaveLength(1);
    expect(thick(top)[0]!.y2).toBe(decorOf(0).height);
    expect(thick(below)[0]!.y1).toBe(0);
    expect(top.some((c) => c.kind === 'curve' && c.x1 < decorOf(0).namesWidth)).toBe(true);
  });
});
