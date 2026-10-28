import { EN, type MessageKey } from './en';
import { KO } from './ko';
import { type Language, type Message, type MessageParams, formatMessage } from './messages';

export type { Language, MessageParams } from './messages';
export type { MessageKey } from './en';

const CATALOGS: Readonly<Record<Language, Readonly<Record<MessageKey, Message>>>> = { en: EN, ko: KO };

/** The language the app's text is shown in now (Settings ▸ Language, resolved against the system's languages). */
let language: Language = 'en';
const listeners = new Set<() => void>();

export function currentLanguage(): Language {
  return language;
}

/** Shows the app in another language: every `useT()` component re-renders, every `memoByLanguage` table is rebuilt. */
export function setLanguage(next: Language): void {
  if (next === language) {
    return;
  }
  language = next;
  listeners.forEach((listener) => listener());
}

/** Calls `listener` after each language change; returns the unsubscribe function. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A message of a language's catalogue with its placeholders filled. */
export function translate(target: Language, key: MessageKey, params?: MessageParams): string {
  return formatMessage(CATALOGS[target][key], params);
}

/**
 * A message in the current language. Components call the `t` of `useT()` (it re-renders them on a change); helpers
 * that build text while a component renders, or while an event is handled, call this one.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(language, key, params);
}

/**
 * `build` run with `target`'s text, the shown language unchanged and no component told (the MCP server lists the command
 * registry in English whatever the window shows). A `memoByLanguage` table built inside is built for `target`.
 */
export function withLanguage<T>(target: Language, build: () => T): T {
  const shown = language;
  language = target;
  try {
    return build();
  } finally {
    language = shown;
  }
}

/** Whether a key built at run time (`commands.${id}`) is in the catalogues. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(EN, key);
}

/**
 * A table of texts built once per language (the command registry, the palette's tools, the shortcut sheet): call the
 * returned function where the table is used, never keep its result across a language change.
 */
export function memoByLanguage<T>(build: () => T): () => T {
  let built: { readonly language: Language; readonly value: T } | undefined;
  return () => {
    if (built === undefined || built.language !== language) {
      built = { language, value: build() };
    }
    return built.value;
  };
}
