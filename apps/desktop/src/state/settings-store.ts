import { type AppSettings, DEFAULT_SETTINGS, parseAppSettings, serializeAppSettings } from '../lib/app-settings';
import { errorMessage } from '../lib/errors';
import { setLanguage, t } from '../lib/i18n/i18n';
import { resolveLanguage } from '../lib/i18n/language-setting';
import type { Language } from '../lib/i18n/messages';
import { applyNativeLanguage, loadStoredSettings, saveStoredSettings } from '../native/app-settings';

/** The app's settings as the window shows them; a new object after every change (useSyncExternalStore's snapshot). */
export interface SettingsSnapshot {
  readonly settings: AppSettings;
  /** The language "System" stands for now. */
  readonly systemLanguage: Language;
  /** macOS's own menu items show another language until the app starts again. */
  readonly needsRestart: boolean;
  /** Why the last change could not be kept, until the next change. */
  readonly error?: string;
}

let snapshot: SettingsSnapshot = { settings: DEFAULT_SETTINGS, systemLanguage: 'en', needsRestart: false };
let systemLanguages: readonly string[] = [];
const listeners = new Set<() => void>();

function publish(next: SettingsSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function currentSettings(): SettingsSnapshot {
  return snapshot;
}

/** Calls `listener` after each change; returns the unsubscribe function. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the setting's language in JS at once, then tells the native menus (which answer whether a restart is needed). */
async function applyLanguage(settings: AppSettings): Promise<void> {
  const language = resolveLanguage(settings.language, systemLanguages);
  setLanguage(language);
  const needsRestart = await applyNativeLanguage(language, settings.language);
  if (snapshot.settings === settings) {
    publish({ ...snapshot, needsRestart });
  }
}

/** Reads the stored settings before the window first renders (AppRoot), so the app opens in its language and colours. */
export async function loadSettings(): Promise<void> {
  try {
    const stored = await loadStoredSettings();
    systemLanguages = stored.systemLanguages;
    const settings = parseAppSettings(stored.json);
    publish({ settings, systemLanguage: resolveLanguage('system', systemLanguages), needsRestart: false });
    await applyLanguage(settings);
  } catch (reason: unknown) {
    publish({ ...snapshot, error: t('common.errorWithDetail', { summary: t('settings.saveFailed'), detail: errorMessage(reason) }) });
  }
}

/** Changes settings: shown at once, then kept in user defaults (a failure is shown in the settings panel). */
export async function changeSettings(change: Partial<AppSettings>): Promise<void> {
  const settings: AppSettings = { ...snapshot.settings, ...change };
  publish({ ...snapshot, settings, error: undefined });
  try {
    await Promise.all([applyLanguage(settings), saveStoredSettings(serializeAppSettings(settings))]);
  } catch (reason: unknown) {
    publish({ ...snapshot, error: t('common.errorWithDetail', { summary: t('settings.saveFailed'), detail: errorMessage(reason) }) });
  }
}
