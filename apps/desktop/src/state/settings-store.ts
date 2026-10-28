import { type AppSettings, DEFAULT_SETTINGS, parseAppSettings, serializeAppSettings } from '../lib/app-settings';
import type { ScoreZoom } from '../lib/score-zoom';
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
/** The stored settings were read: what is kept from now on starts from them. */
let hasReadStored = false;
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
  // Still the language shown (a zoom change meanwhile keeps the answer).
  if (snapshot.settings.language === settings.language) {
    publish({ ...snapshot, needsRestart });
  }
}

/** Reads the stored settings before the window first renders (AppRoot), so the app opens in its language and colours. */
export async function loadSettings(): Promise<void> {
  try {
    const stored = await loadStoredSettings();
    systemLanguages = stored.systemLanguages;
    const settings = parseAppSettings(stored.json);
    hasReadStored = true;
    publish({ settings, systemLanguage: resolveLanguage('system', systemLanguages), needsRestart: false });
    await applyLanguage(settings);
  } catch (reason: unknown) {
    publish({ ...snapshot, error: t('common.errorWithDetail', { summary: t('settings.saveFailed'), detail: errorMessage(reason) }) });
  }
}

/** Keeps settings in user defaults; a failure is shown in the settings panel. */
async function keepSettings(settings: AppSettings, alsoApply: Promise<void>): Promise<void> {
  try {
    await Promise.all([alsoApply, saveStoredSettings(serializeAppSettings(settings))]);
  } catch (reason: unknown) {
    publish({ ...snapshot, error: t('common.errorWithDetail', { summary: t('settings.saveFailed'), detail: errorMessage(reason) }) });
  }
}

/**
 * The score's zoom (the top bar's zoom menu, ⌘- ⌘= ⌘0): shown at once and kept, as Guitar Pro keeps its zoom — only
 * once the stored settings were read, so that a zoom never writes the defaults over settings that could not be.
 */
export async function changeScoreZoom(scoreZoom: ScoreZoom): Promise<void> {
  const settings: AppSettings = { ...snapshot.settings, scoreZoom };
  publish({ ...snapshot, settings });
  if (hasReadStored) {
    await keepSettings(settings, Promise.resolve());
  }
}

/** Changes settings: shown at once, then kept in user defaults (a failure is shown in the settings panel). */
export async function changeSettings(change: Partial<AppSettings>): Promise<void> {
  const settings: AppSettings = { ...snapshot.settings, ...change };
  publish({ ...snapshot, settings, error: undefined });
  await keepSettings(settings, applyLanguage(settings));
}
