import { NativeModules } from 'react-native';

describe('hasApiKey', () => {
  afterEach(() => {
    jest.resetModules();
    delete (NativeModules as Record<string, unknown>).GPAnthropic;
  });

  /** The JS side loaded against a native module answering `answer` to hasApiKey. */
  function withNativeAnswer(answer: unknown): typeof import('../src/native/anthropic') {
    (NativeModules as Record<string, unknown>).GPAnthropic = { hasApiKey: () => Promise.resolve(answer) };
    let loaded: typeof import('../src/native/anthropic') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('../src/native/anthropic')>('../src/native/anthropic');
    });
    return loaded!;
  }

  it('answers true or false even when the native side answers 1 or 0', async () => {
    await expect(withNativeAnswer(1).hasApiKey()).resolves.toBe(true);
    await expect(withNativeAnswer(0).hasApiKey()).resolves.toBe(false);
    await expect(withNativeAnswer(true).hasApiKey()).resolves.toBe(true);
  });

  it('answers false without the native module', async () => {
    let loaded: typeof import('../src/native/anthropic') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('../src/native/anthropic')>('../src/native/anthropic');
    });
    await expect(loaded!.hasApiKey()).resolves.toBe(false);
  });
});
