import type { Message } from '../messages';

/** English texts of GP Editor ▸ Settings… (keys start with "settings."); the Korean catalogue is ../ko/settings.ts. */
export const EN_SETTINGS = {
  'settings.title': 'Settings',
  'settings.accessibility': 'Settings',
  'settings.closeTooltip': 'Close the settings (Esc)',
  'settings.section.display': 'Display',
  'settings.language': 'Language',
  'settings.language.system': 'System ({language})',
  'settings.language.en': 'English',
  'settings.language.ko': '한국어',
  'settings.language.hint': 'The window and the menus change at once; some of macOS’s own menu items (Services, Window, Quit …) follow at the next start.',
  'settings.language.restart': 'Restart GP Editor to show the system’s menu items in the new language.',
  'settings.contrast': 'Interface contrast',
  'settings.contrast.standard': 'Standard',
  'settings.contrast.high': 'High',
  'settings.contrast.hint': 'High contrast makes the panels darker, their text and borders brighter.',
  'settings.paper': 'Score paper',
  'settings.paper.system': 'Follow the system',
  'settings.paper.light': 'Light',
  'settings.paper.dark': 'Dark',
  'settings.paper.hint': 'The page the score is written on. PDF, PNG and print stay black on white.',
  'settings.saveFailed': 'Could not keep the settings',
} as const satisfies Readonly<Record<string, Message>>;
