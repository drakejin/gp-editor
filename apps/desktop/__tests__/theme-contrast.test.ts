import { TRACK_COLORS } from '@gp-editor/core';
import { AA_TEXT_CONTRAST, DISTINCT_COLOR_DIFFERENCE, colorDifference, contrastRatio } from '../src/lib/contrast';
import { hexColorText } from '../src/lib/track-color';
import { PRINT_PALETTE } from '../src/export/paper';
import { ANNOTATION_TINT_DIFFERENCE, annotationColors } from '../src/score/annotations';
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

describe('colorDifference', () => {
  it('is 100 between black and white, 0 for a colour and itself, either way round', () => {
    expect(colorDifference('#000000', '#FFFFFF')).toBeCloseTo(100, 1);
    expect(colorDifference('#FFFFFF', '#000000')).toBeCloseTo(100, 1);
    expect(colorDifference('#3C87F7', '#3C87F7')).toBe(0);
  });

  it('finds the old Design Mode pair (accent orange, danger red) alike on the dark paper, a blue and that red apart', () => {
    expect(colorDifference('#F07A4A', '#FF6B6B')).toBeLessThan(DISTINCT_COLOR_DIFFERENCE);
    expect(colorDifference('#6FA8FF', '#FF6B6B')).toBeGreaterThan(DISTINCT_COLOR_DIFFERENCE);
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

  it('draw Design Mode’s handles, moved ones and the guideline in colours apart from each other, each 3:1 on the paper', () => {
    const failing = allPalettes().flatMap(([name, palette]) => {
      const handle = palette.designHandle ?? palette.accent;
      const guide = palette.designGuide ?? '';
      const graphics = [handle, palette.danger, guide].filter((color) => contrastRatio(color, palette.paper) < 3).map((color) => `${name}: ${color} on the paper`);
      const pairs: readonly (readonly [string, string])[] = [[handle, palette.danger], [guide, handle], [guide, palette.danger]];
      const alike = pairs.filter(([a, b]) => colorDifference(a, b) < DISTINCT_COLOR_DIFFERENCE).map(([a, b]) => `${name}: ${a} and ${b} look alike`);
      // The + − × beside a system are text: AA on the paper.
      const labels = [handle, palette.danger].filter((color) => contrastRatio(color, palette.paper) < AA_TEXT_CONTRAST).map((color) => `${name}: label ${color}`);
      return [...graphics, ...alike, ...labels];
    });

    expect(failing).toEqual([]);
  });

  it('show Guitar Pro 8’s track colours 3:1 on the chrome they are offered and drawn on', () => {
    const swatches = TRACK_COLORS.map(hexColorText);
    const failing = allPalettes().flatMap(([name, palette]) => {
      const chrome = onChrome(palette);
      return swatches.flatMap((swatch) =>
        [chrome.chrome, chrome.chromeDeep].filter((surface) => contrastRatio(swatch, surface) < 3).map((surface) => `${name}: ${swatch} on ${surface}`),
      );
    });

    // A swatch, a track's colour strip and its bars are graphics: WCAG's 3:1 for non-text contrast.
    expect(failing).toEqual([]);
  });

  it('draw an annotation as one on every paper and in print: its text AA in its box, the box apart from the paper and the notation', () => {
    const papers: readonly (readonly [string, Palette])[] = [...allPalettes(), ['print', PRINT_PALETTE]];
    const failing = papers.flatMap(([name, palette]) => {
      const { fill, ink } = annotationColors(palette);
      return [
        // The text in the box.
        contrastRatio(ink, fill) < AA_TEXT_CONTRAST ? `${name}: ink on its box ${contrastRatio(ink, fill).toFixed(2)}` : '',
        // The box's outline (the ink) is a graphic on the paper: WCAG's 3:1 for non-text contrast.
        contrastRatio(ink, palette.paper) < 3 ? `${name}: outline on the paper ${contrastRatio(ink, palette.paper).toFixed(2)}` : '',
        // Tinted at a glance, and written in a colour of its own: a musician's note, not the notation.
        colorDifference(fill, palette.paper) < ANNOTATION_TINT_DIFFERENCE ? `${name}: box looks like the paper` : '',
        colorDifference(ink, palette.text) < DISTINCT_COLOR_DIFFERENCE ? `${name}: ink looks like the notation's` : '',
      ].filter((problem) => problem !== '');
    });

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
