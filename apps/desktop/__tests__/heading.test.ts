import { layoutMeasure } from '../src/lib/layout';
import { engraveHeading, rgbHex } from '../src/score/heading';
import { textWidth } from '../src/score/symbols/shapes';
import { TEXT_NOTE_GLYPHS } from '../src/score/symbols/smufl';
import { header, makeSong } from '../test-support/songs';
import { PALETTE, textValues, texts } from '../test-support/score-helpers';

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

  it('draws the number of an over-full measure in the danger colour', () => {
    // Arrange
    const headers = [header(1)];
    const song = makeSong([[]], headers);

    // Act
    const [plain] = engraveHeading(headers[0]!, layoutMeasure(song, 0, 0), PALETTE);
    const [overfull] = engraveHeading(headers[0]!, layoutMeasure(song, 0, 0), PALETTE, true);

    // Assert
    expect(plain).toMatchObject({ kind: 'text', text: '1', color: PALETTE.muted });
    expect(overfull).toMatchObject({ kind: 'text', text: '1', color: PALETTE.danger, bold: true });
  });

  it('draws the swing mark after the tempo on a first bar with a triplet feel', () => {
    // Arrange
    const headers = [header(1, { tripletFeel: 'eighth' })];
    const song = makeSong([[]], headers);

    // Act
    const commands = texts(engraveHeading(headers[0]!, layoutMeasure(song, 0, 0), PALETTE));
    const tempo = commands.find((c) => c.text === '♩ = 120');
    const swing = commands.find((c) => c.text.startsWith(TEXT_NOTE_GLYPHS.quarter.text));

    // Assert
    expect(swing).toBeDefined();
    expect(swing!.x).toBeGreaterThan(tempo!.x + textWidth('♩ = 120', tempo!.size));
  });

  it('draws the swing mark at the left where the feel changes and the tempo does not', () => {
    // Arrange
    const headers = [header(1), header(2, { tripletFeel: 'sixteenth' })];
    const song = makeSong([[], []], headers);

    // Act
    const commands = texts(engraveHeading(headers[1]!, layoutMeasure(song, 0, 1), PALETTE));

    // Assert
    expect(commands.find((c) => c.text.startsWith(TEXT_NOTE_GLYPHS.quarter.text))).toMatchObject({ x: 2 });
    expect(commands.map((c) => c.text)).not.toContain('♩ = 120');
  });

  it('draws nothing for a triplet feel that goes on from the previous bar', () => {
    // Arrange
    const headers = [header(1, { tripletFeel: 'eighth' }), header(2, { tripletFeel: 'eighth' })];
    const song = makeSong([[], []], headers);

    // Act
    const values = textValues(engraveHeading(headers[1]!, layoutMeasure(song, 0, 1), PALETTE));

    // Assert
    expect(values).toEqual(['2']);
  });

  it('writes "Straight" where the feel goes back to straight', () => {
    // Arrange
    const headers = [header(1, { tripletFeel: 'eighth' }), header(2)];
    const song = makeSong([[], []], headers);

    // Act
    const values = textValues(engraveHeading(headers[1]!, layoutMeasure(song, 0, 1), PALETTE));

    // Assert
    expect(values).toEqual(['2', 'Straight']);
  });

  it('formats colors as hex', () => {
    expect(rgbHex({ r: 255, g: 0, b: 16 })).toBe('#ff0010');
  });
});
