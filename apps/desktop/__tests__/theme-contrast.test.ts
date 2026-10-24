import { AA_TEXT_CONTRAST, contrastRatio } from '../src/lib/contrast';
import { LCD_COLORS, type Palette, STRIP_COLORS, allPalettes, onChrome, paletteFor } from '../src/theme';

/** Text colour → the surfaces it is drawn on, by palette role. */
const TEXT_ON: readonly (readonly [keyof Palette, readonly (keyof Palette)[]])[] = [
  ['chromeText', ['chrome', 'chromeDeep', 'chromeRaised']],
  ['chromeMuted', ['chrome', 'chromeDeep', 'chromeRaised']],
  ['chromeHighlight', ['chrome', 'chromeDeep', 'chromeRaised']],
  ['chromeAccentText', ['chromeAccent']],
  ['text', ['paper', 'background', 'sidebar', 'selection']],
  ['muted', ['paper', 'background', 'sidebar']],
  ['accentText', ['accent']],
  ['accent', ['paper']],
  ['danger', ['paper', 'background']],
];

function lowContrastPairs(name: string, palette: Palette): readonly string[] {
  return TEXT_ON.flatMap(([text, surfaces]) =>
    surfaces.map((surface) => {
      const ratio = contrastRatio(String(palette[text]), String(palette[surface]));
      return ratio >= AA_TEXT_CONTRAST ? '' : `${name}: ${text} on ${surface} = ${ratio.toFixed(2)}`;
    }),
  ).filter((pair) => pair !== '');
}

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself, either way round', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#3C87F7', '#3C87F7')).toBe(1);
  });

  it('matches WCAG’s worked value for mid grey on white', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('refuses a colour that is not #RRGGBB', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow(RangeError);
  });
});

describe('palettes', () => {
  it('show every text colour at WCAG AA on its surfaces, in both contrasts and both papers', () => {
    const failing = allPalettes().flatMap(([name, palette]) => [...lowContrastPairs(name, palette), ...lowContrastPairs(`${name} on chrome`, onChrome(palette))]);

    expect(failing).toEqual([]);
  });

  it('show the LCD’s and the strips’ text at WCAG AA', () => {
    const lcdTexts = allPalettes().flatMap(([, palette]) => [palette.chromeText, palette.chromeMuted]);
    const pairs: readonly (readonly [string, string])[] = [
      ...[...lcdTexts, LCD_COLORS.digits, LCD_COLORS.lit, LCD_COLORS.countIn].map((text) => [text, LCD_COLORS.background] as const),
      [STRIP_COLORS.hintText, STRIP_COLORS.hintBackground],
      [STRIP_COLORS.errorText, STRIP_COLORS.errorBackground],
    ];

    const failing = pairs.filter(([text, background]) => contrastRatio(text, background) < AA_TEXT_CONTRAST);

    expect(failing).toEqual([]);
  });

  it('give every voice colour 3:1 on the paper', () => {
    const failing = allPalettes().flatMap(([name, palette]) =>
      (palette.voices ?? []).filter((voice) => contrastRatio(voice, palette.paper) < 3).map((voice) => `${name}: ${voice}`),
    );

    // Voice colours mark notes and the cursor (graphics: WCAG's 3:1 for non-text contrast).
    expect(failing).toEqual([]);
  });

  it('follow the system’s appearance unless the paper is fixed', () => {
    const dark = paletteFor({ appearance: 'dark', contrast: 'standard', paper: 'system' });
    const lightOnDarkSystem = paletteFor({ appearance: 'dark', contrast: 'standard', paper: 'light' });
    const darkOnLightSystem = paletteFor({ appearance: 'light', contrast: 'standard', paper: 'dark' });

    expect(dark.paper).toBe(darkOnLightSystem.paper);
    expect(lightOnDarkSystem.paper).toBe('#FFFFFF');
    expect(dark.paper).not.toBe('#FFFFFF');
  });

  it('make the high contrast chrome darker with brighter text and borders', () => {
    const standard = paletteFor({ appearance: 'light', contrast: 'standard', paper: 'system' });
    const high = paletteFor({ appearance: 'light', contrast: 'high', paper: 'system' });

    expect(contrastRatio(high.chromeText, high.chrome)).toBeGreaterThan(contrastRatio(standard.chromeText, standard.chrome));
    expect(contrastRatio(high.chromeMuted, high.chrome)).toBeGreaterThan(contrastRatio(standard.chromeMuted, standard.chrome));
    expect(contrastRatio(high.chromeBorder, high.chrome)).toBeGreaterThan(contrastRatio(standard.chromeBorder, standard.chrome));
  });
});
