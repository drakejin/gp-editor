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
}

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
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export const MONO_FONT = 'Menlo';
