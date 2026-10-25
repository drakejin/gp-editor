// The element tree of a plain XML document, read straight from its text. A document of the plain subset is one
// fast-xml-parser's XMLValidator accepts, and the tree is what its ordered parse (preserveOrder, attributes kept, values
// as text, no trimming, declaration, PIs and comments left out) and xml.ts's conversion of it give — same names,
// attributes, texts —, without the validator's and the parser's passes, their node objects, path matching and text
// built a character at a time: most of the time a GPIF file took to open in Hermes.
// The subset: one root element; outside it white space, comments and processing instructions (the XML declaration
// first); tags and entities as xml-tag.ts reads them; CDATA; no deeper than MAX_DEPTH. Anything else returns
// undefined, and the caller validates and parses with fast-xml-parser as before (its errors, its reading).
import type { XmlElement } from './xml';
import { closingTagEnd, decodeEntities, hasGuardedName, isBlank, readOpeningTag } from './xml-tag';

/** Below fast-xml-parser's maxNestedTags (100), past which it throws. */
const MAX_DEPTH = 64;
const NO_CHILDREN: readonly XmlElement[] = [];
const CODE = { slash: 0x2f, question: 0x3f, exclamation: 0x21, greaterThan: 0x3e, space: 0x20 } as const;
const QUOTES: ReadonlySet<number> = new Set([0x22, 0x27]);
const CDATA_START = '<![CDATA[';
const BYTE_ORDER_MARK = '﻿';

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

/** The root element, or undefined when the document is not plain (see the file comment). */
export function readXmlTree(source: string): XmlElement | undefined {
  if (source.startsWith(BYTE_ORDER_MARK)) {
    return undefined;
  }
  const xml = source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
  const state: TreeState = { xml, open: [], roots: [], pending: '' };
  let at = 0;
  for (let tag = xml.indexOf('<'); tag >= 0; tag = xml.indexOf('<', at)) {
    if (tag > at) {
      state.pending += xml.slice(at, tag);
    }
    at = readerAt(xml, tag)(state, tag);
    if (at < 0) {
      return undefined;
    }
  }
  state.pending += xml.slice(at);
  const isComplete = state.open.length === 0 && state.roots.length === 1 && flushText(state);
  return isComplete ? state.roots[0] : undefined;
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
    return readElement;
  }
  if (xml.startsWith('--', at + 2)) {
    return readComment;
  }
  return xml.startsWith(CDATA_START, at) ? readCdata : leaveSubset;
}

function leaveSubset(): number {
  return -1;
}

/** The pending text, entities decoded, joins the open element's text; outside the root it must be white space. */
function flushText(state: TreeState): boolean {
  const current = state.open[state.open.length - 1];
  const pending = state.pending;
  state.pending = '';
  if (current === undefined) {
    return isBlank(pending);
  }
  const text = pending === '' ? '' : decodeEntities(pending);
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

function readElement(state: TreeState, at: number): number {
  const tag = readOpeningTag(state.xml, at);
  const isPlain = tag !== undefined && state.open.length < MAX_DEPTH && (state.open.length > 0 || state.roots.length === 0);
  if (!isPlain || !flushText(state)) {
    return -1;
  }
  const { name, attributes, isSelfClosing, end } = tag;
  if (isSelfClosing) {
    addElement(state, { name, attributes, children: NO_CHILDREN, text: '' });
  } else {
    state.open.push({ name, attributes, children: [], text: '' });
  }
  return end + 1;
}

function readClosingTag(state: TreeState, at: number): number {
  const current = state.open[state.open.length - 1];
  const end = current === undefined ? -1 : closingTagEnd(state.xml, at, current.name);
  if (current === undefined || end < 0 || !flushText(state)) {
    return -1;
  }
  state.open.pop();
  const { name, attributes, children, text } = current;
  addElement(state, { name, attributes, children: children.length === 0 ? NO_CHILDREN : children, text });
  return end + 1;
}

/**
 * A processing instruction ends the text before it and leaves nothing. Plain: it ends at the first `?>` (where
 * XMLValidator ends it) outside quotes too (where the parser does), has a name, and only the first one is named xml.
 */
function readInstruction(state: TreeState, at: number): number {
  const { xml } = state;
  const end = xml.indexOf('?>', at + 2);
  // XMLValidator's name: up to the first space or "?".
  const hasName = !isNameEnd(xml.charCodeAt(at + 2));
  const isXml = xml.startsWith('xml', at + 2) && isNameEnd(xml.charCodeAt(at + 5));
  const isPlain = end >= 0 && end === quotedTagEnd(xml, at + 1) && hasName && (!isXml || at === 0);
  if (!isPlain || hasGuardedName(xml.slice(at + 2, end)) || !flushText(state)) {
    return -1;
  }
  return end + 2;
}

function isNameEnd(code: number): boolean {
  return code === CODE.space || code === CODE.question;
}

/** Index of the first `?>`'s `?` from `from` on outside quoted values, as fast-xml-parser finds a PI's end; -1 if none. */
function quotedTagEnd(xml: string, from: number): number {
  let quote = 0;
  for (let i = from; i < xml.length; i++) {
    const code = xml.charCodeAt(i);
    if (quote !== 0) {
      quote = code === quote ? 0 : quote;
    } else if (QUOTES.has(code)) {
      quote = code;
    } else if (code === CODE.question && xml.charCodeAt(i + 1) === CODE.greaterThan) {
      return i;
    }
  }
  return -1;
}

function readComment(state: TreeState, at: number): number {
  const end = state.xml.indexOf('-->', at + 4);
  return end < 0 ? -1 : end + 3;
}

function readCdata(state: TreeState, at: number): number {
  const end = state.xml.indexOf(']]>', at + CDATA_START.length);
  if (end < 0 || !flushText(state)) {
    return -1;
  }
  const current = state.open[state.open.length - 1];
  if (current !== undefined) {
    current.text += state.xml.slice(at + CDATA_START.length, end);
  }
  return end + 3;
}
