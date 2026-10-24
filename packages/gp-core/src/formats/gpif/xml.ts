// Port of the DOM helpers of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentReader (LGPL-2.1).
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { GpFormatError } from '../../errors';

/** A parsed XML element. `text` is the element's own text and CDATA (GPIF values are leaf elements). */
export interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

const TEXT_KEY = '#text';
const CDATA_KEY = '#cdata';
const ATTRIBUTES_KEY = ':@';
const BYTE_ORDER_MARK = '\uFEFF';

const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  cdataPropName: CDATA_KEY,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  commentPropName: false,
});

/**
 * Parse an XML document and return its root element. Malformed XML is rejected (TuxGuitar's DOM
 * parser does the same), and like TuxGuitar (CVE-2020-14940) documents with a DOCTYPE are refused.
 */
export function parseXml(xml: string): XmlElement {
  const source = xml.startsWith(BYTE_ORDER_MARK) ? xml.slice(1) : xml;
  if (/<!DOCTYPE/i.test(source)) {
    throw new GpFormatError('Invalid GPIF document: DOCTYPE declarations are not allowed');
  }
  return parseXmlDocument(source, PARSER, 'GPIF');
}

/** Check and parse a document with `parser` (its options set how entities are read); `kind` names it in errors. */
export function parseXmlDocument(source: string, parser: XMLParser, kind: string): XmlElement {
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    const { msg, line } = validation.err;
    throw new GpFormatError(`Invalid ${kind} document: ${msg} (line ${line})`);
  }
  let nodes: unknown;
  try {
    nodes = parser.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GpFormatError(`Invalid ${kind} document: ${reason}`, { cause: error });
  }
  const root = toElements(nodes)[0];
  if (root === undefined) {
    throw new GpFormatError(`Invalid ${kind} document: no root element`);
  }
  return root;
}

function toElements(nodes: unknown): XmlElement[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  const elements: XmlElement[] = [];
  for (const node of nodes) {
    const element = toElement(node);
    if (element !== undefined) {
      elements.push(element);
    }
  }
  return elements;
}

function toElement(node: unknown): XmlElement | undefined {
  if (!isRecord(node)) {
    return undefined;
  }
  const name = Object.keys(node).find((key) => key !== ATTRIBUTES_KEY);
  if (name === undefined || name === TEXT_KEY || name === CDATA_KEY) {
    return undefined;
  }
  const content = node[name];
  return {
    name,
    attributes: toAttributes(node[ATTRIBUTES_KEY]),
    children: toElements(content),
    text: textOf(content),
  };
}

function toAttributes(value: unknown): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  if (isRecord(value)) {
    for (const [key, attributeValue] of Object.entries(value)) {
      attributes.set(key, String(attributeValue));
    }
  }
  return attributes;
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  let text = '';
  for (const node of content) {
    if (!isRecord(node)) {
      continue;
    }
    const value = node[TEXT_KEY];
    if (value !== undefined) {
      text += String(value);
    }
    const cdata = node[CDATA_KEY];
    if (cdata !== undefined) {
      text += textOf(cdata);
    }
  }
  return text;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** First child element with this name (DOM getChildNode). */
export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((c) => c.name === name);
}

/** All child elements with this name, in document order. */
export function children(element: XmlElement | undefined, name: string): readonly XmlElement[] {
  return element === undefined ? [] : element.children.filter((c) => c.name === name);
}

/** Children of the first child with this name (DOM getChildNodeList), filtered by `itemName`. */
export function childList(element: XmlElement | undefined, name: string, itemName: string): readonly XmlElement[] {
  return children(child(element, name), itemName);
}

/** Text of the first child with this name, undefined when there is no such child. */
export function childText(element: XmlElement | undefined, name: string): string | undefined {
  return child(element, name)?.text;
}

export function attribute(element: XmlElement | undefined, name: string): string | undefined {
  return element?.attributes.get(name);
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * `new BigDecimal(text).intValue()` as GPXDocumentReader uses it: the fraction is truncated and the
 * result wraps to 32 bits; anything that is not a decimal number gives `fallback`.
 */
export function parseJavaInt(text: string | undefined, fallback: number): number {
  const trimmed = text?.trim();
  if (trimmed === undefined || !DECIMAL.test(trimmed)) {
    return fallback;
  }
  return Math.trunc(Number(trimmed)) | 0;
}

export function parseFloatOr(text: string | undefined, fallback: number): number {
  const trimmed = text?.trim();
  return trimmed !== undefined && DECIMAL.test(trimmed) ? Number(trimmed) : fallback;
}

/**
 * getChildNodeIntegerContentArray: split on `separator` (and any whitespace), malformed items become 0.
 * Undefined when the text itself is undefined.
 */
export function parseIntList(text: string | undefined, separator: string): number[] | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text
    .split(separator)
    .flatMap((part) => part.split(/\s+/))
    .filter((part) => part !== '')
    .map((part) => parseJavaInt(part, 0));
}

/** Like parseIntList, but every item keeps its fraction (a tempo automation's "92.5 2"); malformed items become 0. */
export function parseNumberList(text: string | undefined, separator: string): number[] | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text
    .split(separator)
    .flatMap((part) => part.split(/\s+/))
    .filter((part) => part !== '')
    .map((part) => parseFloatOr(part, 0));
}

/**
 * The value for a name read from the file in a table of known GPIF names, or undefined when the name is unknown.
 * Own properties only: a name such as "constructor" must not resolve to an inherited Object property.
 */
export function lookupName<T>(table: Readonly<Record<string, T>>, name: string | undefined): T | undefined {
  return name !== undefined && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;
}
