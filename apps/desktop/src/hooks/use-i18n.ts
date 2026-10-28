import { useCallback, useSyncExternalStore } from 'react';
import { type Language, type MessageKey, type MessageParams, currentLanguage, subscribeLanguage, translate } from '../lib/i18n/i18n';

/** The language the app shows; the component re-renders when Settings ▸ Language changes it (memoised ones too). */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, currentLanguage);
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * `t(key, params)` in the shown language. A new function after each language change, so a `useMemo` or `useCallback`
 * that builds text lists `t` among its dependencies and is rebuilt.
 */
export function useT(): Translate {
  const language = useLanguage();
  return useCallback((key: MessageKey, params?: MessageParams) => translate(language, key, params), [language]);
}
