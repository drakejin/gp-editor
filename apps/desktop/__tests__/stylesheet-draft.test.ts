import { DEFAULT_STYLESHEET } from '@gp-editor/core';
import { runLayoutCommand } from '../src/hooks/use-score-design';
import {
  matchingFamilies,
  millimetresText,
  pageSummary,
  percentText,
  stepNumber,
  textStyleText,
  withHeaderShown,
  withLabel,
  withMargin,
} from '../src/lib/stylesheet-draft';
import { fontFamilies, subscribeLayoutCommands, toLayoutCommand } from '../src/native/stylesheet';

describe('stylesheet-draft', () => {
  it('steps a value within its range, rounded', () => {
    expect(stepNumber(1, 1, 0.05, { min: 0.5, max: 2 })).toBe(1.05);
    expect(stepNumber(1.98, 1, 0.05, { min: 0.5, max: 2 })).toBe(2);
    expect(stepNumber(0, -1, 2, { min: 0, max: 100 }, 1)).toBe(0);
  });

  it('writes values as the dialog shows them', () => {
    expect(percentText(1.25)).toBe('125 %');
    expect(millimetresText(12.7)).toBe('12.7 mm');
    expect(millimetresText(10)).toBe('10 mm');
    expect(pageSummary(DEFAULT_STYLESHEET.page)).toBe('A4 · portrait · 210 × 297 mm');
    expect(pageSummary({ ...DEFAULT_STYLESHEET.page, format: 'custom', orientation: 'landscape', customWidth: 200, customHeight: 300 })).toBe('Custom · landscape · 300 × 200 mm');
    expect(textStyleText({ family: '', size: 11, isBold: true, isItalic: true })).toBe('System font, 11 pt, bold, italic');
  });

  it('changes one value of the stylesheet and leaves the others', () => {
    expect(withMargin(DEFAULT_STYLESHEET, 'left', 20).page.margins).toEqual({ ...DEFAULT_STYLESHEET.page.margins, left: 20 });
    expect(withHeaderShown(DEFAULT_STYLESHEET, 'copyright', true).header.shown.copyright).toBe(true);
    expect(withLabel(DEFAULT_STYLESHEET, 'slide', 'gliss.').notation.labels).toEqual({ ...DEFAULT_STYLESHEET.notation.labels, slide: 'gliss.' });
  });

  it('finds font families by every word typed, the chosen one first', () => {
    const families = ['Avenir', 'Avenir Next', 'Georgia', 'Helvetica Neue'];
    expect(matchingFamilies(families, 'next av', '', 5)).toEqual(['Avenir Next']);
    expect(matchingFamilies(families, '', 'Georgia', 2)).toEqual(['Georgia', 'Avenir']);
  });
});

describe('the layout commands of the menus', () => {
  it('reads a menu’s command from its event, nothing else', () => {
    expect(toLayoutCommand({ command: 'designMode' })).toBe('designMode');
    expect(toLayoutCommand({ command: 'erase' })).toBeUndefined();
    expect(toLayoutCommand(null)).toBeUndefined();
  });

  it('opens the stylesheet, turns Design Mode on or off, resets the positions', () => {
    // Arrange
    const open = jest.fn();
    const dispatch = jest.fn();

    // Act
    runLayoutCommand('stylesheet', open, dispatch);
    runLayoutCommand('designMode', open, dispatch);
    runLayoutCommand('resetPositions', open, dispatch);

    // Assert
    expect(open).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls).toEqual([[{ type: 'toggleDesignMode' }], [{ type: 'resetPositions' }]]);
  });

  it('offers the common families and no events without the native module (the tests)', async () => {
    expect((await fontFamilies()).length).toBeGreaterThan(5);
    expect(subscribeLayoutCommands(() => undefined)()).toBeUndefined();
  });
});
