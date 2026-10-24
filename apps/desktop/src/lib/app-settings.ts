import { LANGUAGE_SETTINGS, type LanguageSetting } from './i18n/language-setting';

/** Settings ▸ Interface contrast: the chrome's (and the paper's) text and borders as they are, or stronger. */
export const CONTRASTS = ['standard', 'high'] as const;
export type Contrast = (typeof CONTRASTS)[number];

/** Settings ▸ Score paper: the page the score is drawn on follows the system's appearance, or stays light or dark. */
export const PAPER_SETTINGS = ['system', 'light', 'dark'] as const;
export type PaperSetting = (typeof PAPER_SETTINGS)[number];

/** GP Editor ▸ Settings… (⌘,): kept in user defaults as this object's JSON. */
export interface AppSettings {
  readonly language: LanguageSetting;
  readonly contrast: Contrast;
  readonly paper: PaperSetting;
}

export const DEFAULT_SETTINGS: AppSettings = { language: 'system', contrast: 'standard', paper: 'system' };

function oneOf<T extends string>(choices: readonly T[], value: unknown, fallback: T): T {
  return choices.find((choice) => choice === value) ?? fallback;
}

/** Settings from stored JSON (untrusted: another version may have written it, or nothing): each unknown value is its default. */
export function parseAppSettings(json: string | null | undefined): AppSettings {
  let stored: unknown;
  try {
    stored = json === null || json === undefined ? undefined : JSON.parse(json);
  } catch {
    stored = undefined;
  }
  const fields: Readonly<Record<string, unknown>> = typeof stored === 'object' && stored !== null ? (stored as Readonly<Record<string, unknown>>) : {};
  return {
    language: oneOf(LANGUAGE_SETTINGS, fields.language, DEFAULT_SETTINGS.language),
    contrast: oneOf(CONTRASTS, fields.contrast, DEFAULT_SETTINGS.contrast),
    paper: oneOf(PAPER_SETTINGS, fields.paper, DEFAULT_SETTINGS.paper),
  };
}

export function serializeAppSettings(settings: AppSettings): string {
  return JSON.stringify({ language: settings.language, contrast: settings.contrast, paper: settings.paper });
}
