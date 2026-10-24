import { NativeEventEmitter, NativeModules } from 'react-native';
import { COMMON_FONT_FAMILIES } from '../lib/stylesheet-draft';

/** What the menus ask of the score's look: File ▸ Stylesheet…, View ▸ Design Mode, View ▸ Reset Positions. */
export type LayoutCommand = 'stylesheet' | 'designMode' | 'resetPositions';

const LAYOUT_COMMANDS: readonly LayoutCommand[] = ['stylesheet', 'designMode', 'resetPositions'];

interface GPStylesheetModule {
  fontFamilies(): Promise<string[]>;
}

const native = NativeModules.GPStylesheet as GPStylesheetModule | undefined;

/** A menu's command from native (`{ command }`); undefined for anything else. */
export function toLayoutCommand(value: unknown): LayoutCommand | undefined {
  const command = typeof value === 'object' && value !== null ? (value as { readonly command?: unknown }).command : undefined;
  return LAYOUT_COMMANDS.find((candidate) => candidate === command);
}

/** The font families installed on the Mac, sorted (NSFontManager); the common ones where the module is missing. */
export async function fontFamilies(): Promise<readonly string[]> {
  if (native === undefined) {
    return COMMON_FONT_FAMILIES;
  }
  const families = await native.fontFamilies();
  return families.filter((family) => typeof family === 'string' && family !== '' && !family.startsWith('.'));
}

/** File ▸ Stylesheet… (F7), View ▸ Design Mode and View ▸ Reset Positions; returns the unsubscribe function. */
export function subscribeLayoutCommands(onCommand: (command: LayoutCommand) => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPStylesheet).addListener('layoutCommandRequested', (body: unknown) => {
    const command = toLayoutCommand(body);
    if (command !== undefined) {
      onCommand(command);
    }
  });
  return () => subscription.remove();
}
