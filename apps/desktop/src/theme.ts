import { useColorScheme } from 'react-native';

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
}

/** The chrome looks the same in light and dark mode, as Guitar Pro's does. */
export const CHROME = {
  chrome: '#2C2E33',
  chromeDeep: '#222428',
  chromeRaised: '#3B3E44',
  chromeBorder: '#17181B',
  chromeText: '#E4E6EA',
  chromeMuted: '#969BA3',
  chromeAccent: '#3C87F7',
  chromeAccentText: '#FFFFFF',
} as const;

const LIGHT: Palette = {
  background: '#ECEDEF',
  sidebar: '#F6F6F7',
  paper: '#FFFFFF',
  text: '#1D1D1F',
  muted: '#86868B',
  line: '#9A9AA0',
  accent: '#D4572A',
  accentText: '#FFFFFF',
  selection: '#FFD8C7',
  danger: '#C62828',
  border: '#D9D9DE',
  desk: '#D3D5D9',
  ...CHROME,
};

const DARK: Palette = {
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
  ...CHROME,
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export const MONO_FONT = 'Menlo';
