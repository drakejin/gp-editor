// Windows twin of app-settings.ts: GP Editor's settings (File ▸ Settings… on Windows) in the app's data folder, as
// GPAppSettings.m keeps them in user defaults; the system's languages from WebView2 (the Windows display language).
import type { LanguageSetting } from '../lib/i18n/language-setting';
import type { Language } from '../lib/i18n/messages';
import { installMenu } from './web/app-menu';
import { onAppEvent } from './web/app-events';
import { readSetting, writeSetting } from './web/settings';

const SETTINGS_FILE = 'app-settings.json';

/** What was stored, and the system's preferred languages ("ko-KR", "en-US" …). */
export interface StoredSettings {
  /** The settings JSON last saved (untrusted until parsed), or null. */
  readonly json: string | null;
  readonly systemLanguages: readonly string[];
}

export async function loadStoredSettings(): Promise<StoredSettings> {
  const json = await readSetting(SETTINGS_FILE).catch(() => null);
  return { json, systemLanguages: typeof navigator === 'undefined' ? [] : [...navigator.languages] };
}

export function saveStoredSettings(json: string): Promise<void> {
  return writeSetting(SETTINGS_FILE, json);
}

/** The window menu follows the language shown (it is built from the app's catalogues); nothing needs a restart. */
export async function applyNativeLanguage(language: Language, setting: LanguageSetting): Promise<boolean> {
  void language;
  void setting;
  await installMenu();
  return false;
}

/** File ▸ Settings… (Ctrl+,); returns the unsubscribe function. */
export function subscribeSettingsRequests(onRequest: () => void): () => void {
  return onAppEvent('settingsRequested', () => onRequest());
}
