// Every native module of the app, answering in Jest: import this module before anything that reads NativeModules
// (the src/native wrappers keep the module they find when they load). Events reach the app's listeners through
// DeviceEventEmitter, as the native side sends them.
import { NativeModules } from 'react-native';

/** The native modules src/native talks to. */
const MODULE_NAMES = [
  'GPAnthropic', 'GPAppSettings', 'GPAudioExport', 'GPAudioInput', 'GPAudioTrack', 'GPClipboard', 'GPFiles', 'GPMidiInput',
  'GPPdfExport', 'GPPlayer', 'GPPngExport', 'GPProjects', 'GPRecentFiles', 'GPStylesheet',
] as const;

/** A native method's answer, or undefined for the default one. */
export type NativeAnswer = (moduleName: string, method: string, args: readonly unknown[]) => unknown;

/** The calls made, by "Module.method", with their arguments; each listener added or removed crosses to native. */
export const nativeCalls = new Map<string, unknown[][]>();
let answer: NativeAnswer = () => undefined;

/** What the native methods answer from now on (undefined: the default). */
export function answerNativeCalls(next: NativeAnswer): void {
  answer = next;
}

export function nativeCallCount(key: string): number {
  return nativeCalls.get(key)?.length ?? 0;
}

/** Adding and removing listeners answer nothing; any other call never answers, so nothing else changes the window. */
function defaultAnswer(method: string): unknown {
  return method === 'addListener' || method === 'removeListeners' ? undefined : new Promise(() => undefined);
}

function fakeModule(moduleName: string): object {
  return new Proxy(
    {},
    {
      get: (_target, method) =>
        typeof method !== 'string' || method === 'then'
          ? undefined
          : (...args: unknown[]) => {
              const key = `${moduleName}.${method}`;
              nativeCalls.set(key, [...(nativeCalls.get(key) ?? []), args]);
              return answer(moduleName, method, args) ?? defaultAnswer(method);
            },
    },
  );
}

for (const moduleName of MODULE_NAMES) {
  NativeModules[moduleName] = fakeModule(moduleName);
}
