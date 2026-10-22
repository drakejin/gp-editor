import type { DrawCommand, TextCommand } from '../src/score/draw';
import type { Palette } from '../src/theme';

export const PALETTE: Palette = {
  background: '#000000', sidebar: '#111111', paper: '#FFFFFF', text: '#222222', muted: '#333333', line: '#444444',
  accent: '#FF0000', accentText: '#FFFFFF', selection: '#FFFF00', danger: '#FF0000', border: '#555555',
  desk: '#666666', chrome: '#101010', chromeDeep: '#080808', chromeRaised: '#202020', chromeBorder: '#000000',
  chromeText: '#F0F0F0', chromeMuted: '#909090', chromeAccent: '#0000FF', chromeAccentText: '#FFFFFF',
};

export function texts(commands: readonly DrawCommand[]): TextCommand[] {
  return commands.filter((command): command is TextCommand => command.kind === 'text');
}

export function textValues(commands: readonly DrawCommand[]): string[] {
  return texts(commands).map((command) => command.text);
}

/** Every number in every command is finite. */
export function allFinite(commands: readonly DrawCommand[]): boolean {
  return commands.every((command) =>
    Object.values(command).every((value) =>
      typeof value === 'number' ? Number.isFinite(value) : Array.isArray(value) ? value.every((v) => Number.isFinite(v)) : true,
    ),
  );
}
