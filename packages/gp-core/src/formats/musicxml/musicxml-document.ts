// MusicXML documents (no TuxGuitar reader exists): decoding the text, refusing DTD subsets, and score-timewise as score-partwise.
import { XMLParser } from 'fast-xml-parser';
import { GpFormatError } from '../../errors';
import { decodeUtf8Lenient, decodeWindows1252 } from '../../io/text';
import { XML_PARSER_OPTIONS, type XmlElement, attribute, child, children, parseXmlDocument } from '../gpif/xml';

/** A score as score-partwise holds it: the header elements and each part's measures. */
export interface PartwiseScore {
  readonly root: XmlElement;
  /** `version` of the root, "1.0" when absent (the MusicXML default). */
  readonly version: string;
  readonly parts: readonly MusicXmlPart[];
}

export interface MusicXmlPart {
  readonly id: string;
  readonly measures: readonly XmlElement[];
}

const PARTWISE = 'score-partwise';
const TIMEWISE = 'score-timewise';
const DEFAULT_VERSION = '1.0';
/** How far into a file detection looks for the root element (past the declaration, comments and doctype). */
const SNIFF_BYTES = 4096;

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16LE_BOM = [0xff, 0xfe] as const;
const UTF16BE_BOM = [0xfe, 0xff] as const;
const SINGLE_BYTE_ENCODINGS = /encoding\s*=\s*["'](iso-8859-1|latin-?1|windows-1252|cp1252|us-ascii)["']/i;

/**
 * The parser of MusicXML text: like the GPIF one, but numeric character references (&#233;) are decoded too.
 * The document type is removed before parsing (refused when it has an internal subset), so no entity is ever declared.
 */
const PARSER = new XMLParser({ ...XML_PARSER_OPTIONS, htmlEntities: true });

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

function decodeUtf16(bytes: Uint8Array, isLittleEndian: boolean): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const low = bytes[isLittleEndian ? i : i + 1] ?? 0;
    const high = bytes[isLittleEndian ? i + 1 : i] ?? 0;
    text += String.fromCharCode(low | (high << 8));
  }
  return text;
}

/** The document's text: UTF-16 by its byte order mark, latin-1 / windows-1252 when the declaration says so, else UTF-8. */
export function decodeMusicXml(bytes: Uint8Array): string {
  if (startsWith(bytes, UTF16LE_BOM)) {
    return decodeUtf16(bytes.subarray(2), true);
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return decodeUtf16(bytes.subarray(2), false);
  }
  const body = startsWith(bytes, UTF8_BOM) ? bytes.subarray(UTF8_BOM.length) : bytes;
  const declaration = decodeWindows1252(body.subarray(0, Math.min(body.length, 200)));
  const isSingleByte = declaration.startsWith('<?xml') && SINGLE_BYTE_ENCODINGS.test(declaration.slice(0, declaration.indexOf('?>') + 1));
  return isSingleByte ? decodeWindows1252(body) : decodeUtf8Lenient(body);
}

/** The prolog before the root: a declaration, comments, processing instructions, a doctype, white space. */
const PROLOG = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*/;

/** True when the bytes are a MusicXML document: its root element is score-partwise or score-timewise. */
export function isMusicXmlText(bytes: Uint8Array): boolean {
  const head = decodeMusicXml(bytes.subarray(0, SNIFF_BYTES)).replace(/^﻿/, '');
  const rest = head.slice(PROLOG.exec(head)?.[0].length ?? 0);
  return new RegExp(`^<(${PARTWISE}|${TIMEWISE})[\\s/>]`).test(rest);
}

const DOCTYPE_START = /<!DOCTYPE/i;
/** A document type with a public or system identifier only: `<!DOCTYPE name PUBLIC "…" "…">`. */
const EXTERNAL_DOCTYPE = /<!DOCTYPE\s+[^\s>[]+(?:\s+(?:PUBLIC\s+("[^"]*"|'[^']*')\s+("[^"]*"|'[^']*')|SYSTEM\s+("[^"]*"|'[^']*')))?\s*>/i;

/** The text without its document type; one with an internal subset (entity declarations) is refused. */
function withoutDoctype(text: string): string {
  const start = text.search(DOCTYPE_START);
  if (start < 0) {
    return text;
  }
  const match = EXTERNAL_DOCTYPE.exec(text.slice(start));
  if (match === null || match.index !== 0) {
    throw new GpFormatError('Invalid MusicXML document: a document type with an internal DTD subset is not supported');
  }
  return text.slice(0, start) + text.slice(start + match[0].length);
}

/** Parse the META-INF/container.xml of a compressed MusicXML file. */
export function parseMusicXmlContainer(text: string): XmlElement {
  return parseXmlDocument(withoutDoctype(text.replace(/^﻿/, '')), PARSER, 'MusicXML container');
}

/** Parse MusicXML text into its root element (score-partwise or score-timewise). */
export function parseMusicXml(text: string): XmlElement {
  const root = parseXmlDocument(withoutDoctype(text.replace(/^﻿/, '')), PARSER, 'MusicXML');
  if (root.name !== PARTWISE && root.name !== TIMEWISE) {
    throw new GpFormatError(`Not a MusicXML score: the root element is <${root.name}>`);
  }
  return root;
}

/** score-timewise holds parts inside measures; turn it inside out (each part's measures keep the measure's attributes). */
function timewiseParts(root: XmlElement): readonly MusicXmlPart[] {
  const byId = new Map<string, XmlElement[]>();
  for (const measure of children(root, 'measure')) {
    for (const part of children(measure, 'part')) {
      const id = attribute(part, 'id') ?? '';
      const measures = byId.get(id) ?? [];
      measures.push({ ...measure, children: part.children });
      byId.set(id, measures);
    }
  }
  return [...byId].map(([id, measures]) => ({ id, measures }));
}

/** The score as score-partwise: score-timewise documents are converted, not refused. */
export function toPartwise(root: XmlElement): PartwiseScore {
  const parts =
    root.name === TIMEWISE
      ? timewiseParts(root)
      : children(root, 'part').map((part) => ({ id: attribute(part, 'id') ?? '', measures: children(part, 'measure') }));
  if (parts.length === 0) {
    throw new GpFormatError('Invalid MusicXML document: the score has no parts');
  }
  return { root, version: attribute(root, 'version') ?? DEFAULT_VERSION, parts };
}

/** The part-list's score-part elements, by id. */
export function scoreParts(root: XmlElement): ReadonlyMap<string, XmlElement> {
  return new Map(children(child(root, 'part-list'), 'score-part').map((part) => [attribute(part, 'id') ?? '', part]));
}
