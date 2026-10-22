import { QUARTER } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { SMUFL } from '../src/score/draw';
import { engraveTabMeasure, engraveTabRowHeader, stringY } from '../src/score/tab';
import { beat, header, makeSong, note } from '../test-support/songs';
import { PALETTE, allFinite, texts, textValues } from '../test-support/score-helpers';

const EIGHTH = { ...QUARTER, value: 8 as const };

function context(overrides: Partial<Parameters<typeof engraveTabMeasure>[0]> = {}) {
  const song = makeSong(
    [[beat(960, [note(1, 3), note(6, 0, { deadNote: true, palmMute: true })], EIGHTH), beat(1440, [note(2, 5)], EIGHTH), beat(1920, [])]],
    [header(1, { repeatOpen: true, repeatClose: 2 })],
  );
  const track = song.tracks[0]!;
  return {
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: 60,
    marksY: 44,
    showRhythm: true,
    palette: PALETTE,
    ...overrides,
  };
}

describe('engraveTabMeasure', () => {
  it('draws strings, frets, marks, time signature and repeat dots', () => {
    const commands = engraveTabMeasure(context());
    expect(commands.filter((c) => c.kind === 'line' && c.y1 === c.y2)).toHaveLength(6);
    expect(textValues(commands)).toEqual(expect.arrayContaining(['3', 'x', '5', 'P.M.', '4']));
    expect(commands.filter((c) => c.kind === 'circle')).toHaveLength(4);
    expect(allFinite(commands)).toBe(true);
  });

  it('puts fret numbers on their string lines', () => {
    const five = texts(engraveTabMeasure(context())).find((t) => t.text === '5');
    expect(five?.y).toBe(stringY(60, 2));
  });

  it('draws a SMuFL rest, stems and a beam only when rhythm is shown', () => {
    const withRhythm = engraveTabMeasure(context());
    expect(textValues(withRhythm)).toContain(SMUFL.restQuarter);
    expect(withRhythm.some((c) => c.kind === 'rect' && c.height === 2)).toBe(true);
    const without = engraveTabMeasure(context({ showRhythm: false }));
    expect(textValues(without)).not.toContain(SMUFL.restQuarter);
  });

  it('draws the cursor box, also on an empty string, and the playing column', () => {
    const onEmpty = engraveTabMeasure(context({ cursor: { beatIndex: 1, string: 4 } }));
    const box = onEmpty.find((c) => c.kind === 'rect' && c.color === PALETTE.selection);
    expect(box).toBeDefined();
    const playing = engraveTabMeasure(context({ playingBeatIndex: 0 }));
    expect(playing[0]).toMatchObject({ kind: 'rect', color: `${PALETTE.accent}33` });
  });
});

describe('engraveTabRowHeader', () => {
  it('draws the six- or four-string TAB clef', () => {
    expect(textValues(engraveTabRowHeader(context().track, 60, PALETTE))).toEqual([SMUFL.sixStringTabClef]);
    const bass = { ...context().track, strings: context().track.strings.slice(0, 4) };
    expect(textValues(engraveTabRowHeader(bass, 60, PALETTE))).toEqual([SMUFL.fourStringTabClef]);
  });
});
