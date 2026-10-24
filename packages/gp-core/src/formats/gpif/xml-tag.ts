// Tags, names and entities of the plain XML subset xml-tree.ts reads: ASCII names, attributes as `name="value"` (or
// single quotes) after white space, no two alike, values and text with the five XML entities only. Within it,
// fast-xml-parser's XMLValidator accepts the tag and its parser reads the same name, attributes and text.

/** fast-xml-parser's DANGEROUS_PROPERTY_NAMES and criticalProperties: it renames or refuses these names. */
const GUARDED_NAMES: ReadonlySet<string> = new Set([
  'hasOwnProperty',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'constructor',
  'prototype',
]);
const XML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);
export const NO_ATTRIBUTES: ReadonlyMap<string, string> = new Map();
const CODE = {
  tab: 0x09,
  lineFeed: 0x0a,
  carriageReturn: 0x0d,
  space: 0x20,
  doubleQuote: 0x22,
  singleQuote: 0x27,
  hyphen: 0x2d,
  dot: 0x2e,
  slash: 0x2f,
  digit0: 0x30,
  digit9: 0x39,
  colon: 0x3a,
  equals: 0x3d,
  greaterThan: 0x3e,
  upperA: 0x41,
  upperZ: 0x5a,
  underscore: 0x5f,
  lowerA: 0x61,
  lowerZ: 0x7a,
} as const;

export interface OpeningTag {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly isSelfClosing: boolean;
  /** Index of the tag's `>`. */
  readonly end: number;
}

interface Attribute {
  readonly name: string;
  readonly value: string;
  /** Index after the closing quote. */
  readonly end: number;
}

/** XMLValidator's white space: space, tab, line feed, carriage return. */
export function isSpace(code: number): boolean {
  return code === CODE.space || code === CODE.lineFeed || code === CODE.tab || code === CODE.carriageReturn;
}

export function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!isSpace(text.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

function skipSpaces(xml: string, from: number): number {
  let i = from;
  while (isSpace(xml.charCodeAt(i))) {
    i++;
  }
  return i;
}

function isNameStart(code: number): boolean {
  return (
    (code >= CODE.lowerA && code <= CODE.lowerZ) || (code >= CODE.upperA && code <= CODE.upperZ) || code === CODE.underscore || code === CODE.colon
  );
}

function isNameChar(code: number): boolean {
  return isNameStart(code) || (code >= CODE.digit0 && code <= CODE.digit9) || code === CODE.hyphen || code === CODE.dot;
}

/** Index after the ASCII name starting at `from`; `from` itself when no name starts there. */
function nameEnd(xml: string, from: number): number {
  if (!isNameStart(xml.charCodeAt(from))) {
    return from;
  }
  let i = from + 1;
  while (isNameChar(xml.charCodeAt(i))) {
    i++;
  }
  return i;
}

/** The opening tag whose `<` is at `at`, or undefined when it leaves the plain subset. */
export function readOpeningTag(xml: string, at: number): OpeningTag | undefined {
  const nameStop = nameEnd(xml, at + 1);
  const name = xml.slice(at + 1, nameStop);
  if (name === '' || GUARDED_NAMES.has(name)) {
    return undefined;
  }
  let attributes: Map<string, string> | undefined;
  let cursor = nameStop;
  for (;;) {
    const next = skipSpaces(xml, cursor);
    const code = xml.charCodeAt(next);
    if (code === CODE.greaterThan || (code === CODE.slash && xml.charCodeAt(next + 1) === CODE.greaterThan)) {
      const isSelfClosing = code === CODE.slash;
      return { name, attributes: attributes ?? NO_ATTRIBUTES, isSelfClosing, end: isSelfClosing ? next + 1 : next };
    }
    const attribute = next === cursor ? undefined : readAttribute(xml, next);
    if (attribute === undefined || attributes?.has(attribute.name) === true) {
      return undefined;
    }
    attributes = attributes ?? new Map<string, string>();
    attributes.set(attribute.name, attribute.value);
    cursor = attribute.end;
  }
}

/** `name = "value"` at `from`, value decoded; undefined when it leaves the plain subset. */
function readAttribute(xml: string, from: number): Attribute | undefined {
  const nameStop = nameEnd(xml, from);
  const name = xml.slice(from, nameStop);
  const equals = skipSpaces(xml, nameStop);
  const quoteAt = skipSpaces(xml, equals + 1);
  const quote = xml.charCodeAt(quoteAt);
  if (name === '' || GUARDED_NAMES.has(name) || xml.charCodeAt(equals) !== CODE.equals || (quote !== CODE.doubleQuote && quote !== CODE.singleQuote)) {
    return undefined;
  }
  const close = xml.indexOf(quote === CODE.doubleQuote ? '"' : "'", quoteAt + 1);
  const value = close < 0 ? undefined : decodeEntities(xml.slice(quoteAt + 1, close));
  return value === undefined ? undefined : { name, value, end: close + 1 };
}

/** Index of the `>` of `</name>` (white space allowed before it) at `at`, or -1. */
export function closingTagEnd(xml: string, at: number, name: string): number {
  if (!xml.startsWith(name, at + 2)) {
    return -1;
  }
  const end = skipSpaces(xml, at + 2 + name.length);
  return xml.charCodeAt(end) === CODE.greaterThan ? end : -1;
}

/** Whether a processing instruction's text holds an attribute name fast-xml-parser guards against. */
export function hasGuardedName(text: string): boolean {
  for (const name of GUARDED_NAMES) {
    if (text.includes(name)) {
      return true;
    }
  }
  return false;
}

/** The five XML entities decoded; undefined when any other `&` (a character reference, a bare ampersand) is there. */
export function decodeEntities(text: string): string | undefined {
  let ampersand = text.indexOf('&');
  if (ampersand < 0) {
    return text;
  }
  let out = '';
  let from = 0;
  while (ampersand >= 0) {
    const semicolon = text.indexOf(';', ampersand);
    const value = semicolon < 0 ? undefined : XML_ENTITIES.get(text.slice(ampersand + 1, semicolon));
    if (value === undefined) {
      return undefined;
    }
    out += text.slice(from, ampersand) + value;
    from = semicolon + 1;
    ampersand = text.indexOf('&', from);
  }
  return out + text.slice(from);
}
