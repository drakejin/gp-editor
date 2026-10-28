/** The languages the app's text is written in. */
export const LANGUAGES = ['en', 'ko'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A message with a form for one and a form for any other count (`{count}` picks it); Korean needs only one form. */
export interface PluralMessage {
  readonly one: string;
  readonly other: string;
}

/** One message of a catalogue: text with `{name}` placeholders, or a plural pair. */
export type Message = string | PluralMessage;

/** The values a message's `{name}` placeholders take. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** A catalogue with exactly the keys of another (the English one): a missing or extra key does not compile. */
export type Catalog<T> = { readonly [K in keyof T]: Message };

const PLACEHOLDER = /\{(\w+)\}/g;

/** The form of a plural message for a count: English's rule (one for exactly 1). */
function pluralForm(message: PluralMessage, params: MessageParams | undefined): string {
  return Number(params?.count) === 1 ? message.one : message.other;
}

/** A message with its placeholders filled; a placeholder without a value is left as written. */
export function formatMessage(message: Message, params?: MessageParams): string {
  const text = typeof message === 'string' ? message : pluralForm(message, params);
  if (params === undefined) {
    return text;
  }
  return text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
    return value === undefined ? placeholder : String(value);
  });
}

/** The placeholder names a message uses, in every form, sorted (the catalogue test compares them across languages). */
export function placeholdersOf(message: Message): readonly string[] {
  const forms = typeof message === 'string' ? [message] : [message.one, message.other];
  const names = new Set(forms.flatMap((form) => [...form.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '')));
  return [...names].sort();
}
