// Windows twin of anthropic.ts. As on the Mac the API key stays native: the Rust side (src-tauri/src/commands/
// anthropic.rs) stores it in the app's data folder and adds it to each request, so the page only learns whether one
// is set. The chosen model is an ordinary setting.
import { readSetting, writeSetting } from './web/settings';
import { call, isTauri } from './web/tauri';

export interface ApiResponse {
  readonly status: number;
  readonly body: string;
}

const MODEL_SETTING = 'anthropic-model.txt';

export async function hasApiKey(): Promise<boolean> {
  return isTauri() ? Boolean(await call<boolean>('anthropic_has_key')) : false;
}

export function setApiKey(key: string): Promise<void> {
  return call('anthropic_set_key', { key });
}

export function clearApiKey(): Promise<void> {
  return call('anthropic_clear_key');
}

export async function savedModel(): Promise<string | null> {
  const model = await readSetting(MODEL_SETTING);
  return model === null || model.trim() === '' ? null : model.trim();
}

export function saveModel(model: string): Promise<void> {
  return writeSetting(MODEL_SETTING, model);
}

/** POSTs a Messages API request body; resolves for any HTTP status, rejects on network failure or a missing key. */
export function sendMessages(body: string): Promise<ApiResponse> {
  return call<ApiResponse>('anthropic_send', { body });
}
