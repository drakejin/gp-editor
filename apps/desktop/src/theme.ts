import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAppSettings } from './hooks/use-app-settings';
import type { Contrast, PaperSetting } from './lib/app-settings';

export interface Palette {
  readonly background: string;
  readonly sidebar: string;
  readonly paper: string;
  readonly text: string;
  readonly muted: string;
  readonly line: string;
  readonly accent: string;
  readonly accentText: string;
  readonly selection: string;
  readonly danger: string;
  readonly border: string;
  /** Around the score page (Guitar Pro's grey desk). */
  readonly desk: string;
  /** Guitar Pro-style dark chrome (top bar, palette, inspector, tracks panel) — dark in both appearances. */
  readonly chrome: string;
  /** Top bar and panel headers, a shade darker than `chrome`. */
  readonly chromeDeep: string;
  /** Buttons, fields and empty bar cells on the chrome. */
  readonly chromeRaised: string;
  readonly chromeBorder: string;
  readonly chromeText: string;
  readonly chromeMuted: string;
  /** Selected / active controls on the chrome (Guitar Pro's blue). */
  readonly chromeAccent: string;
  readonly chromeAccentText: string;
  /** Accent text on the chrome (`onChrome`'s accent): a light blue that reads on the dark grey. */
  readonly chromeHighlight?: string;
  /** Error text on the chrome (`onChrome`'s danger): a light red that reads on the dark grey. */
  readonly chromeDanger?: string;
  /**
   * The voices' colours, voice 1 to 4 (Guitar Pro 8 colours them; voice 1 is the accent here): the cursor in each voice,
   * the palette's Voice buttons and the tab's fret numbers of voices 2–4. The accent for all four when absent.
   */
  readonly voices?: readonly string[];
}

type ChromeColors = Pick<Palette, 'chrome' | 'chromeDeep' | 'chromeRaised' | 'chromeBorder' | 'chromeText' | 'chromeMuted' | 'chromeAccent' | 'chromeAccentText' | 'chromeHighlight' | 'chromeDanger'>;
type PaperColors = Omit<Palette, keyof ChromeColors>;

/**
 * The chrome looks the same in light and dark mode, as Guitar Pro's does. Every text colour reads at WCAG AA (4.5:1) on
 * the surfaces it is drawn on (`__tests__/theme-contrast.test.ts`).
 */
export const CHROME: ChromeColors = {
  chrome: '#2C2E33',
  chromeDeep: '#222428',
  chromeRaised: '#3B3E44',
  chromeBorder: '#17181B',
  chromeText: '#E4E6EA',
  chromeMuted: '#A7ACB4',
  chromeAccent: '#225CC2',
  chromeAccentText: '#FFFFFF',
  chromeHighlight: '#8DBBFF',
  chromeDanger: '#FF8A80',
};

/** Settings ▸ Interface contrast ▸ High: darker panels, white text, brighter muted text and borders. */
const CHROME_HIGH: ChromeColors = {
  chrome: '#1F2024',
  chromeDeep: '#151619',
  chromeRaised: '#34373D',
  chromeBorder: '#5A5E66',
  chromeText: '#FFFFFF',
  chromeMuted: '#CDD1D8',
  chromeAccent: '#1F5FC8',
  chromeAccentText: '#FFFFFF',
  chromeHighlight: '#B5D3FF',
  chromeDanger: '#FF9E96',
};

const LIGHT: PaperColors = {
  background: '#ECEDEF',
  sidebar: '#F6F6F7',
  paper: '#FFFFFF',
  text: '#1D1D1F',
  muted: '#68686D',
  line: '#9A9AA0',
  accent: '#C04A1E',
  accentText: '#FFFFFF',
  selection: '#FFD8C7',
  danger: '#C62828',
  border: '#D9D9DE',
  desk: '#D3D5D9',
  voices: ['#C04A1E', '#23964A', '#D2397F', '#8650D6'],
};

const DARK: PaperColors = {
  background: '#1C1C1E',
  sidebar: '#232326',
  paper: '#2A2A2D',
  text: '#F2F2F7',
  muted: '#98989F',
  line: '#6E6E73',
  accent: '#F07A4A',
  accentText: '#1C1C1E',
  selection: '#6B3A26',
  danger: '#FF6B6B',
  border: '#3A3A3D',
  desk: '#141416',
  voices: ['#F07A4A', '#5CC97C', '#F06EAE', '#B28CFF'],
};

const LIGHT_HIGH: PaperColors = {
  background: '#E4E5E8',
  sidebar: '#F2F2F4',
  paper: '#FFFFFF',
  text: '#000000',
  muted: '#4A4A4F',
  line: '#55555A',
  accent: '#A63F17',
  accentText: '#FFFFFF',
  selection: '#FFC9B3',
  danger: '#A51C1C',
  border: '#8E8E93',
  desk: '#C4C6CB',
  voices: ['#A63F17', '#16703A', '#A8235F', '#6B36B8'],
};

const DARK_HIGH: PaperColors = {
  background: '#111113',
  sidebar: '#18181A',
  paper: '#1E1E20',
  text: '#FFFFFF',
  muted: '#C2C2C8',
  line: '#9A9AA0',
  accent: '#FF8A5C',
  accentText: '#000000',
  selection: '#7A3F27',
  danger: '#FF8080',
  border: '#5A5A5F',
  desk: '#0A0A0B',
  voices: ['#FF8A5C', '#6EDB8E', '#FF85BF', '#C4A3FF'],
};

/** The LCD in the top bar (Guitar Pro's dark display): its glass, digits and the visual metronome's dots. */
export const LCD_COLORS = { background: '#121417', digits: '#D7E3F4', lit: '#7FD4FF', accent: '#4A6378', idle: '#2B3540', countIn: '#FFB454' } as const;

/** The strips under the tabs, alike in every palette: the hint (why an edit did nothing) and the error banner. */
export const STRIP_COLORS = { hintBackground: '#4A3B12', hintText: '#FFE08A', errorBackground: '#B3261E', errorText: '#FFFFFF' } as const;

export type Appearance = 'light' | 'dark';

/** What the palette depends on: the system's appearance and Settings ▸ Interface. */
export interface PaletteChoice {
  readonly appearance: Appearance;
  readonly contrast: Contrast;
  readonly paper: PaperSetting;
}

/** The window's colours: the paper follows the system unless Settings ▸ Score paper fixes it; the chrome is dark. */
export function paletteFor({ appearance, contrast, paper }: PaletteChoice): Palette {
  const isDark = paper === 'system' ? appearance === 'dark' : paper === 'dark';
  const isHigh = contrast === 'high';
  const surfaces = isDark ? (isHigh ? DARK_HIGH : DARK) : isHigh ? LIGHT_HIGH : LIGHT;
  return { ...surfaces, ...(isHigh ? CHROME_HIGH : CHROME) };
}

/** Every palette Settings can choose, for the contrast test. */
export function allPalettes(): readonly (readonly [string, Palette])[] {
  const contrasts: readonly Contrast[] = ['standard', 'high'];
  const papers: readonly PaperSetting[] = ['light', 'dark'];
  return contrasts.flatMap((contrast) => papers.map((paper) => [`${contrast} ${paper}`, paletteFor({ appearance: 'light', contrast, paper })] as const));
}

/** Accent and error text on the chrome when a palette has no `chromeHighlight` / `chromeDanger` of its own (tests). */
const CHROME_HIGHLIGHT = '#8DBBFF';
const CHROME_DANGER = '#FF8A80';

/**
 * The palette for components built for the light surfaces (BarButton, NeckSettings, SoundBankGroup …) when they sit
 * on the dark chrome: their background, text, border and selection colours become the chrome's.
 */
export function onChrome(palette: Palette): Palette {
  return {
    ...palette,
    background: palette.chrome,
    sidebar: palette.chrome,
    paper: palette.chrome,
    text: palette.chromeText,
    muted: palette.chromeMuted,
    border: palette.chromeRaised,
    selection: palette.chromeAccent,
    accent: palette.chromeHighlight ?? CHROME_HIGHLIGHT,
    // Text on the light-blue accent: dark, as the accent is light here.
    accentText: palette.chromeDeep,
    danger: palette.chromeDanger ?? CHROME_DANGER,
  };
}

/** The window's palette, following the system's appearance and Settings ▸ Interface live. Only App calls it. */
export function usePalette(): Palette {
  const appearance: Appearance = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { contrast, paper } = useAppSettings().settings;
  return useMemo(() => paletteFor({ appearance, contrast, paper }), [appearance, contrast, paper]);
}

export const MONO_FONT = 'Menlo'; // i18n-exempt: a font's name
