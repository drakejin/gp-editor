// The element tree of a document XMLValidator accepted, read straight from its text: what fast-xml-parser's ordered
// parse (preserveOrder, attributes kept, values as text, no trimming, declaration, PIs and comments left out) and
// xml.ts's conversion of it give — same names, attributes, texts — without its node objects, path matching and text
// built a character at a time, which made up most of the time a GPIF file took to open in Hermes.
// Only the plain subset is read here: a document type, an entity other than the five XML ones, a name the parser
// guards against (an object's built-in property names), a reserved node name or deep nesting returns undefined, and
// the caller parses with fast-xml-parser as before.
import type { XmlElement } from './xml';

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
/** Below fast-xml-parser's maxNestedTags (100), past which it throws. */
const MAX_DEPTH = 64;
const XML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);
/** fast-xml-parser's attribute expression (attrsRegx), so attributes split as it splits them. */
const ATTRIBUTE = /([^\s=]+)\s*(=\s*(['"])([\s\S]*?)\3)?/g;
const WHITESPACE = /\s/;
const NO_ATTRIBUTES: ReadonlyMap<string, string> = new Map();
const NO_CHILDREN: readonly XmlElement[] = [];
const CODE = { slash: 0x2f, question: 0x3f, exclamation: 0x21, hyphen: 0x2d, bracket: 0x5b, greaterThan: 0x3e } as const;
const QUOTES: ReadonlySet<number> = new Set([0x22, 0x27]);
const CDATA_START = '<![CDATA['.length;

interface OpenElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: XmlElement[];
  text: string;
}

/** The parse in progress: the open elements and the text since the last node (a comment does not end it). */
interface TreeState {
  readonly xml: string;
  readonly open: OpenElement[];
  readonly roots: XmlElement[];
  pending: string;
}

/** Index after the node starting with `<` at `at`, or -1 when the document leaves the plain subset. */
type NodeReader = (state: TreeState, at: number) => number;

/** The root element, or undefined when the document needs fast-xml-parser (see the file comment). */
export function readXmlTree(source: string): XmlElement | undefined {
  const xml = source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
  const state: TreeState = { xml, open: [], roots: [], pending: '' };
  let at = 0;
  while (at < xml.length) {
    const tag = xml.indexOf('<', at);
    if (tag < 0) {
      break;
    }
    if (tag > at) {
      state.pending += xml.slice(at, tag);
    }
    at = readerAt(xml, tag)(state, tag);
    if (at < 0) {
      return undefined;
    }
  }
  return state.open.length === 0 ? state.roots[0] : undefined;
}

function readerAt(xml: string, at: number): NodeReader {
  const next = xml.charCodeAt(at + 1);
  if (next === CODE.slash) {
    return readClosingTag;
  }
  if (next === CODE.question) {
    return readInstruction;
  }
  if (next !== CODE.exclamation) {
    return readOpeningTag;
  }
  const third = xml.charCodeAt(at + 2);
  if (third === CODE.hyphen && xml.charCodeAt(at + 3) === CODE.hyphen) {
    return readComment;
  }
  return third === CODE.bracket ? readCdata : leaveSubset;
}

function leaveSubset(): number {
  return -1;
}

/** The pending text, entities decoded, joins the open element's text (outside the root it is dropped unread). */
function flushText(state: TreeState): boolean {
  const current = state.open[state.open.length - 1];
  const pending = state.pending;
  state.pending = '';
  if (pending === '' || current === undefined) {
    return true;
  }
  const text = decodeEntities(pending);
  if (text === undefined) {
    return false;
  }
  current.text += text;
  return true;
}

function addElement(state: TreeState, element: XmlElement): void {
  const parent = state.open[state.open.length - 1];
  (parent === undefined ? state.roots : parent.children).push(element);
}

function readClosingTag(state: TreeState, at: number): number {
  const end = state.xml.indexOf('>', at);
  const element = end < 0 || !flushText(state) ? undefined : state.open.pop();
  if (element === undefined) {
    return -1;
  }
  const { name, attributes, children, text } = element;
  addElement(state, { name, attributes, children: children.length === 0 ? NO_CHILDREN : children, text });
  return end + 1;
}

/** A processing instruction (the XML declaration among them) ends the text before it and leaves nothing. */
function readInstruction(state: TreeState, at: number): number {
  const end = tagEnd(state.xml, at + 1, CODE.question);
  if (end < 0 || !flushText(state) || hasGuardedName(state.xml.slice(at + 2, end))) {
    return -1;
  }
  return end + 2;
}

function readComment(state: TreeState, at: number): number {
  const end = state.xml.indexOf('-->', at + 4);
  return end < 0 ? -1 : end + 3;
}

function readCdata(state: TreeState, at: number): number {
  const end = state.xml.indexOf(']]>', at);
  if (end < 0 || !flushText(state)) {
    return -1;
  }
  const current = state.open[state.open.length - 1];
  if (current !== undefined) {
    // substring, not slice, as fast-xml-parser takes it (a "<![]]>" swaps the bounds).
    current.text += state.xml.substring(at + CDATA_START, end);
  }
  return end + 3;
}

function readOpeningTag(state: TreeState, at: number): number {
  const end = tagEnd(state.xml, at + 1, CODE.greaterThan);
  const tag = end < 0 ? undefined : splitTag(state.xml.slice(at + 1, end));
  const attributes = tag === undefined ? undefined : readAttributes(tag.attributes);
  if (tag === undefined || attributes === undefined || !flushText(state) || state.open.length >= MAX_DEPTH) {
    return -1;
  }
  if (tag.isSelfClosing) {
    addElement(state, { name: tag.name, attributes, children: NO_CHILDREN, text: '' });
  } else {
    state.open.push({ name: tag.name, attributes, children: [], text: '' });
  }
  return end + 1;
}

/** Index of `close` (`>`, or the `?` of `?>`) from `from` on, outside quoted values; -1 when there is none. */
function tagEnd(xml: string, from: number, close: number): number {
  let quote = 0;
  for (let i = from; i < xml.length; i++) {
    const code = xml.charCodeAt(i);
    if (quote !== 0) {
      quote = code === quote ? 0 : quote;
    } else if (QUOTES.has(code)) {
      quote = code;
    } else if (code === close && (close !== CODE.question || xml.charCodeAt(i + 1) === CODE.greaterThan)) {
      return i;
    }
  }
  return -1;
}

interface OpeningTag {
  readonly name: string;
  /** The attribute expression, or undefined when the tag has none. */
  readonly attributes: string | undefined;
  readonly isSelfClosing: boolean;
}

/** fast-xml-parser's readTagExp and its self-closing check, on the text between `<` and `>`. */
function splitTag(expression: string): OpeningTag | undefined {
  const separator = expression.search(WHITESPACE);
  let name = separator < 0 ? expression : expression.slice(0, separator);
  let rest = separator < 0 ? expression : expression.slice(separator + 1).trimStart();
  const isSelfClosing = rest.length > 0 && rest.lastIndexOf('/') === rest.length - 1;
  if (isSelfClosing && name.endsWith('/')) {
    name = name.slice(0, -1);
    rest = name;
  } else if (isSelfClosing) {
    rest = rest.slice(0, -1);
  }
  if (GUARDED_NAMES.has(name) || name.startsWith('#')) {
    return undefined;
  }
  return { name, attributes: name === rest ? undefined : rest, isSelfClosing };
}

/** The attributes with a quoted value, entities decoded; undefined when one leaves the plain subset. */
function readAttributes(expression: string | undefined): ReadonlyMap<string, string> | undefined {
  if (expression === undefined) {
    return NO_ATTRIBUTES;
  }
  const attributes = new Map<string, string>();
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(expression); match !== null; match = ATTRIBUTE.exec(expression)) {
    const [, name = '', , , raw] = match;
    const value = raw === undefined ? '' : decodeEntities(raw);
    if (GUARDED_NAMES.has(name) || value === undefined) {
      return undefined;
    }
    if (raw !== undefined) {
      attributes.set(name, value);
    }
  }
  return attributes.size === 0 ? NO_ATTRIBUTES : attributes;
}

/** Whether any attribute name in the expression is one fast-xml-parser guards against. */
function hasGuardedName(expression: string): boolean {
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(expression); match !== null; match = ATTRIBUTE.exec(expression)) {
    if (GUARDED_NAMES.has(match[1] ?? '')) {
      return true;
    }
  }
  return false;
}

/** The five XML entities decoded; undefined when any other `&` (a character reference, a bare ampersand) is there. */
function decodeEntities(text: string): string | undefined {
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
