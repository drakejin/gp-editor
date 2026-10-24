import { DEFAULT_STYLESHEET, type TextStyle } from '@gp-editor/core';
import type { TextCommand } from '../src/score/draw';
import { isSameTextStyle, styleText, styledSize } from '../src/score/text-styles';

const BAR_NUMBER: TextCommand = { kind: 'text', x: 2, y: 8, text: '12', size: 9, color: '#333333', font: 'ui', align: 'left', bold: false };
const BASE = DEFAULT_STYLESHEET.texts.barNumber;

describe('styleText', () => {
  it('returns the command itself in its default style', () => {
    expect(styleText(BAR_NUMBER, { ...BASE }, BASE)).toBe(BAR_NUMBER);
  });

  it('draws the text in the family, size, weight and slant of the style', () => {
    // Arrange
    const style: TextStyle = { family: 'Georgia', size: 18, isBold: true, isItalic: true };

    // Act
    const styled = styleText(BAR_NUMBER, style, BASE);

    // Assert
    expect(styled).toEqual({ ...BAR_NUMBER, size: 18, bold: true, italic: true, family: 'Georgia' });
  });

  it('keeps a text bold for its own reason, and scales a size drawn for another base', () => {
    // Arrange: an over-full bar's number is bold; the title block prints the title at 22 for the screen's 26
    const overfull = { ...BAR_NUMBER, bold: true };
    const title: TextCommand = { ...BAR_NUMBER, size: 22, bold: true };

    // Act
    const number = styleText(overfull, { ...BASE, size: 12 }, BASE);
    const printed = styleText(title, { ...DEFAULT_STYLESHEET.texts.title, size: 39 }, DEFAULT_STYLESHEET.texts.title);

    // Assert
    expect(number.bold).toBe(true);
    expect(number.size).toBe(12);
    expect(printed.size).toBe(33);
    expect(printed.family).toBeUndefined();
  });
});

describe('styledSize / isSameTextStyle', () => {
  it('scales by the style against its base', () => {
    expect(styledSize(10, { ...BASE, size: 18 }, BASE)).toBe(20);
    expect(styledSize(10, BASE, BASE)).toBe(10);
    expect(isSameTextStyle(BASE, { ...BASE, isItalic: true })).toBe(false);
  });
});
