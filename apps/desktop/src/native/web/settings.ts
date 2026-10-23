import { call, isTauri } from './tauri';

/**
 * Small settings of the Windows build (recent files, MIDI input, the chosen sound bank and model) — what the Mac keeps
 * in user defaults. In the app they are files in its data folder (%APPDATA%\com.gpeditor.app), which survive
 * reinstalls; in a browser, local storage.
 */
const STORAGE_PREFIX = 'gp-editor.';

export async function readSetting(name: string): Promise<string | null> {
  if (isTauri()) {
    return call<string | null>('app_data_read', { name });
  }
  try {
    return localStorage.getItem(STORAGE_PREFIX + name);
  } catch {
    return null;
  }
}

export async function writeSetting(name: string, text: string): Promise<void> {
  if (isTauri()) {
    await call('app_data_write', { name, text });
    return;
  }
  try {
    localStorage.setItem(STORAGE_PREFIX + name, text);
  } catch {
    // Storage off: the setting lasts this run only.
  }
}
