import { NativeModules } from 'react-native';

/** An HTTP answer of the Messages API, as text. */
export interface ApiResponse {
  readonly status: number;
  readonly body: string;
}

interface GPAnthropicModule {
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;
  model(): Promise<string | null>;
  setModel(model: string): Promise<void>;
  send(body: string): Promise<ApiResponse>;
}

/**
 * JS side of macos/GPEditor-macOS/GPAnthropic.m. The API key stays native: it is stored in the app's own folder and
 * added to each request there, so JS only learns whether one is set.
 */
const native = NativeModules.GPAnthropic as GPAnthropicModule | undefined;

function requireNative(): GPAnthropicModule {
  if (native === undefined) {
    throw new Error('GPAnthropic native module is not available on this platform');
  }
  return native;
}

/** Whether a key is saved; a truthy answer of any kind counts (older builds answered 1 rather than true). */
export function hasApiKey(): Promise<boolean> {
  return native === undefined ? Promise.resolve(false) : native.hasApiKey().then(Boolean);
}

export function setApiKey(key: string): Promise<void> {
  return requireNative().setApiKey(key);
}

export function clearApiKey(): Promise<void> {
  return requireNative().clearApiKey();
}

/** The chosen transcription model; null when none was chosen. */
export function savedModel(): Promise<string | null> {
  return native === undefined ? Promise.resolve(null) : native.model();
}

export function saveModel(model: string): Promise<void> {
  return requireNative().setModel(model);
}

/** POSTs a Messages API request body; resolves for any HTTP status, rejects on network failure or a missing key. */
export function sendMessages(body: string): Promise<ApiResponse> {
  return requireNative().send(body);
}
