import { layoutMeasure } from '../src/lib/layout';
import { engraveHeading, rgbHex } from '../src/score/heading';
import { header, makeSong } from '../test-support/songs';
import { PALETTE, textValues } from '../test-support/score-helpers';

describe('engraveHeading', () => {
  it('draws number, marker, tempo, endings and repeat count', () => {
    const headers = [header(1, { marker: { title: 'Intro', color: { r: 255, g: 0, b: 16 } }, repeatAlternative: 0b11, repeatClose: 3 })];
    const song = makeSong([[]], headers);
    const commands = engraveHeading(headers[0]!, layoutMeasure(song, 0, 0), PALETTE);
    expect(textValues(commands)).toEqual(['1', 'Intro', '♩ = 120', '1, 2.', 'x3']);
  });

  it('shortens markers that do not fit the measure', () => {
    const headers = [header(1, { marker: { title: 'A very long section name indeed', color: { r: 0, g: 0, b: 0 } } })];
    const song = makeSong([[]], headers);
    const marker = textValues(engraveHeading(headers[0]!, { ...layoutMeasure(song, 0, 0), width: 80 }, PALETTE))[1];
    expect(marker?.endsWith('…')).toBe(true);
    expect(marker!.length).toBeLessThan(20);
  });

  it('formats colors as hex', () => {
    expect(rgbHex({ r: 255, g: 0, b: 16 })).toBe('#ff0010');
  });
});
