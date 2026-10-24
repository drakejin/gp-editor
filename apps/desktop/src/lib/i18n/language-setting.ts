import { LANGUAGES, type Language } from './messages';

/** Settings ▸ Language: the system's language (when the app has it, else English) or one chosen. */
export const LANGUAGE_SETTINGS = ['system', ...LANGUAGES] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** The language the app shows for a setting: the first of the system's preferred languages ("ko-KR", "en-US") it has. */
export function resolveLanguage(setting: LanguageSetting, systemLanguages: readonly string[]): Language {
  if (setting !== 'system') {
    return setting;
  }
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    const found = LANGUAGES.find((candidate) => candidate === base);
    if (found !== undefined) {
      return found;
    }
  }
  return 'en';
}
