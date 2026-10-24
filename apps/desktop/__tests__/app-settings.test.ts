import { DEFAULT_SETTINGS, parseAppSettings, serializeAppSettings } from '../src/lib/app-settings';

describe('parseAppSettings', () => {
  it('reads what serializeAppSettings wrote', () => {
    const settings = { language: 'ko', contrast: 'high', paper: 'dark' } as const;

    expect(parseAppSettings(serializeAppSettings(settings))).toEqual(settings);
  });

  it('gives the defaults for nothing stored, bad JSON or a value that is not an object', () => {
    expect([null, undefined, '{', '"ko"', '[1]'].map((json) => parseAppSettings(json))).toEqual([DEFAULT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SETTINGS]);
  });

  it('keeps each known value and replaces each unknown one by its default', () => {
    const json = JSON.stringify({ language: 'fr', contrast: 'high', paper: 42, extra: true });

    expect(parseAppSettings(json)).toEqual({ language: 'system', contrast: 'high', paper: 'system' });
  });
});
