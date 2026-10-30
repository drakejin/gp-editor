import { paletteGroups } from '../src/components/palette/palette-groups';
import type { PaletteGroup } from '../src/components/palette/palette-tools';
import { type Language, withLanguage } from '../src/lib/i18n/i18n';
import { DEFAULT_WINDOW_HEIGHT, PALETTE_GROUPS_TOP, PALETTE_INNER_WIDTH, type TextRequest, groupHeight, groupRows, textKey, toolTexts } from '../test-support/palette-fit';
import { PALETTE_TEXT_WIDTHS } from '../test-support/palette-text-widths';

// The user's rule: every tool of the edition palette shows without scrolling at the default window, in English and
// Korean. The palette is laid out as EditionPalette lays it out, with its texts' widths as AppKit measures them
// (scripts/palette-fit/run.sh writes the table; run it when a face or key changes — this test names what it lacks).

declare const require: (id: string) => unknown;
declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

const LANGUAGES: readonly Language[] = ['en', 'ko'];

const groupsIn = (language: Language): readonly PaletteGroup[] => withLanguage(language, () => paletteGroups());

function textsOf(groups: readonly PaletteGroup[]): readonly TextRequest[] {
  return groups.flatMap((group) => group.tools.flatMap((tool) => toolTexts(tool, group)));
}

function widthOf(request: TextRequest): number {
  const width = PALETTE_TEXT_WIDTHS[textKey(request)];
  if (width === undefined) {
    // i18n-exempt: a test failure's message
    throw new Error(`${textKey(request)} is not measured: run scripts/palette-fit/run.sh`);
  }
  return width;
}

// scripts/palette-fit/run.sh: the texts to measure, both languages, written before anything is checked.
const textsOut = process.env.PALETTE_FIT_TEXTS;
if (textsOut !== undefined) {
  const fs = require('fs') as {
    writeFileSync(file: string, text: string): void;
  };
  const texts = new Map(LANGUAGES.flatMap((language) => textsOf(groupsIn(language))).map((request) => [textKey(request), request]));
  fs.writeFileSync(textsOut, JSON.stringify([...texts.values()]));
}

describe('the edition palette at the default 1280 × 800 window', () => {
  it.each(LANGUAGES)('has every text it draws measured (%s)', (language) => {
    const missing = textsOf(groupsIn(language)).filter((request) => PALETTE_TEXT_WIDTHS[textKey(request)] === undefined);

    expect(missing.map(textKey)).toEqual([]);
  });

  it.each(LANGUAGES)('shows every group, ONLINE TOOLS last, without scrolling (%s)', (language) => {
    // Arrange
    const groups = groupsIn(language);
    const room = DEFAULT_WINDOW_HEIGHT - PALETTE_GROUPS_TOP;

    // Act
    const height = groups.reduce((sum, group) => sum + groupHeight(group, widthOf), 0);

    // Assert
    expect(groups[groups.length - 1]?.id).toBe('online');
    expect(height).toBeLessThanOrEqual(room);
  });

  it.each(LANGUAGES)('puts ONLINE TOOLS’ two tools on one row, and keeps the Bar group’s tools in two rows (%s)', (language) => {
    // Arrange
    const groups = groupsIn(language);
    const rowsOf = (id: string) => groupRows(groups.find((group) => group.id === id) as PaletteGroup, widthOf);

    // Act / Assert
    expect(rowsOf('online').map((row) => row.length)).toEqual([2]);
    expect(rowsOf('bar')).toHaveLength(2);
    expect(Math.max(...groups.flatMap((group) => groupRows(group, widthOf)).map((row) => row.reduce((sum, width) => sum + width, 0)))).toBeLessThanOrEqual(PALETTE_INNER_WIDTH);
  });
});
