/**
 * The app's texts are written for the Mac: shortcuts as ⌘S, ⇧⌘Z, ⌥↑, ⌫ and the macOS settings path for the microphone.
 * On Windows the same shortcuts are Ctrl+S, Ctrl+Shift+Z, Alt+↑, Backspace (the key handling maps Ctrl to ⌘), so
 * texts shown on screen go through platformText first (web/react-native.tsx does it for Text and tooltips).
 */

const MODIFIERS: Readonly<Record<string, string>> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'];
const KEYS: Readonly<Record<string, string>> = { '⌫': 'Backspace', '⌦': 'Delete', '⇥': 'Tab', '⏎': 'Enter', '⎋': 'Esc' };

/** Modifier symbols held for a click ("⌥-click", "⌃-클릭"): a hyphen and a word, not the minus key ("⌘- / ⌘="). */
const MODIFIED_CLICK = /([⌃⌘⌥⇧]+)-(?=\p{L})/gu;
/** A run of modifier symbols and the key after it ("⇧⌘Z", "⌥/", "⌃⇧⇥"). */
const SHORTCUT = /([⌃⌘⌥⇧]+)(⌫|⌦|⇥|⏎|⎋|[^\s⌃⌘⌥⇧)])/gu;
const LONE_KEY = /[⌫⌦⇥⏎⎋]/gu;

const PHRASES: readonly (readonly [string, string])[] = [
  ['System Settings ▸ Privacy & Security ▸ Microphone', 'Windows Settings ▸ Privacy & security ▸ Microphone (let desktop apps use it)'],
  ['Finder', 'File Explorer'],
];

function modifierNames(modifierSymbols: string): string[] {
  const names = new Set([...modifierSymbols].map((symbol) => MODIFIERS[symbol] ?? symbol));
  return MODIFIER_ORDER.filter((name) => names.has(name));
}

function shortcut(modifierSymbols: string, key: string): string {
  return [...modifierNames(modifierSymbols), KEYS[key] ?? key.toUpperCase()].join('+');
}

/** The text as Windows users read it: "⇧⌘Z" → "Ctrl+Shift+Z", "⌥-click" → "Alt+click", "⌫" → "Backspace"; other text unchanged. */
export function platformText(text: string): string {
  if (!/[⌃⌘⌥⇧⌫⌦⇥⏎⎋]|System Settings|Finder/u.test(text)) {
    return text;
  }
  let result = text.replace(MODIFIED_CLICK, (_, modifiers: string) => `${modifierNames(modifiers).join('+')}+`);
  result = result.replace(SHORTCUT, (_, modifiers: string, key: string) => shortcut(modifiers, key));
  result = result.replace(LONE_KEY, (key) => KEYS[key] ?? key);
  for (const [mac, windows] of PHRASES) {
    result = result.split(mac).join(windows);
  }
  return result;
}
