import { NativeModules } from 'react-native';
import type { Language } from '../lib/i18n/messages';
import type { LanguageSetting } from '../lib/i18n/language-setting';
import { subscribeNativeEvents } from './native-events';

interface GPAppSettingsModule {
  load(): Promise<unknown>;
  save(json: string): Promise<void>;
  applyLanguage(language: Language, setting: LanguageSetting): Promise<unknown>;
}

/** JS side of macos/GPEditor-macOS/GPAppSettings.m: GP Editor ▸ Settings… kept in user defaults. */
const native = NativeModules.GPAppSettings as GPAppSettingsModule | undefined;

/** What was stored, and the system's preferred languages ("ko-KR", "en-US" …). */
export interface StoredSettings {
  /** The settings JSON last saved (untrusted until parsed), or null. */
  readonly json: string | null;
  readonly systemLanguages: readonly string[];
}

/** The stored settings; nothing stored and no system languages where the module is missing (tests). */
export async function loadStoredSettings(): Promise<StoredSettings> {
  const loaded: unknown = native === undefined ? undefined : await native.load();
  const fields: Readonly<Record<string, unknown>> = typeof loaded === 'object' && loaded !== null ? (loaded as Readonly<Record<string, unknown>>) : {};
  const languages = Array.isArray(fields.systemLanguages) ? fields.systemLanguages.filter((tag): tag is string => typeof tag === 'string') : [];
  return { json: typeof fields.settings === 'string' ? fields.settings : null, systemLanguages: languages };
}

export function saveStoredSettings(json: string): Promise<void> {
  return native === undefined ? Promise.resolve() : native.save(json);
}

/** Tells the menus and native panels the language shown; resolves whether macOS's own menu items need a restart. */
export async function applyNativeLanguage(language: Language, setting: LanguageSetting): Promise<boolean> {
  const answer: unknown = native === undefined ? undefined : await native.applyLanguage(language, setting);
  return typeof answer === 'object' && answer !== null && (answer as { readonly needsRestart?: unknown }).needsRestart === true;
}

/** GP Editor ▸ Settings… (⌘,); returns the unsubscribe function. */
export function subscribeSettingsRequests(onRequest: () => void): () => void {
  return subscribeNativeEvents(native, { settingsRequested: onRequest });
}
