// A small XML writer for GPIF documents (no TuxGuitar counterpart: TuxGuitar has no GPIF writer).

/** An element: either children, or a text (escaped or written as a CDATA section), or nothing (`<Name />`). */
export interface XmlNode {
  readonly name: string;
  readonly attributes: readonly (readonly [string, string])[];
  readonly children: readonly XmlNode[];
  readonly text?: string;
  readonly isCdata?: boolean;
}

/** A child slot: absent children (`undefined`, `false`) are left out, so optional elements read inline. */
export type XmlChild = XmlNode | undefined | false;

export type XmlAttributes = Readonly<Record<string, string | number>>;

const DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';
const CDATA_END = ']]>';
/** "]]>" inside a CDATA section: end the section after "]]" and start a new one before ">". */
const CDATA_END_SPLIT = ']]]]><![CDATA[>';

/**
 * Characters XML 1.0 cannot hold at all (C0 controls but tab, line feed and carriage return; U+FFFE, U+FFFF) and lone
 * surrogates (which UTF-8 cannot encode). A surrogate pair is matched first and kept.
 */
const INVALID_CHARACTERS = /[\ud800-\udbff][\udc00-\udfff]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/g;

/**
 * The text as an XML document can carry it: carriage returns become line feeds (an XML parser turns "\r\n" and "\r"
 * into "\n" anyway, even inside CDATA), characters XML 1.0 cannot hold are dropped and lone surrogates become U+FFFD.
 */
export function sanitizeXmlText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(INVALID_CHARACTERS, (match) => {
    if (match.length === 2) {
      return match;
    }
    const code = match.charCodeAt(0);
    return code >= 0xd800 && code <= 0xdfff ? '\ufffd' : '';
  });
}

/** Shared by every element without attributes or children (most of them): no empty lists built per element. */
const NO_ATTRIBUTES: XmlNode['attributes'] = [];
const NO_CHILDREN: readonly XmlNode[] = [];

function toAttributes(attributes: XmlAttributes): XmlNode['attributes'] {
  const names = Object.keys(attributes);
  return names.length === 0 ? NO_ATTRIBUTES : names.map((name) => [name, String(attributes[name])] as const);
}

/** An element with child elements (or none). */
export function xmlElement(name: string, children: readonly XmlChild[] = NO_CHILDREN, attributes: XmlAttributes = {}): XmlNode {
  const present = children.length === 0 ? NO_CHILDREN : children.filter((child): child is XmlNode => child !== undefined && child !== false);
  return { name, attributes: toAttributes(attributes), children: present };
}

/** A leaf element holding an escaped text. */
export function xmlText(name: string, text: string | number, attributes: XmlAttributes = {}): XmlNode {
  return { name, attributes: toAttributes(attributes), children: NO_CHILDREN, text: String(text) };
}

/** A leaf element holding a CDATA section (as Guitar Pro writes names, titles and free texts). */
export function xmlCdata(name: string, text: string, attributes: XmlAttributes = {}): XmlNode {
  return { name, attributes: toAttributes(attributes), children: NO_CHILDREN, text, isCdata: true };
}

const TAB = 0x09;
const LINE_FEED = 0x0a;
const SPACE = 0x20;
const SPECIAL_CHARACTERS: ReadonlySet<number> = new Set([0x22, 0x26, 0x3c, 0x3e, 0x5d]); // " & < > ]
const FIRST_SURROGATE = 0xd800;

/**
 * Whether a text goes into the document as it is: printable characters but `"&<>]`, tabs and line feeds. Checked
 * character by character because most texts are numbers and names, and regular expressions are slow in Hermes.
 */
function isPlain(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code < SPACE && code !== TAB && code !== LINE_FEED) || SPECIAL_CHARACTERS.has(code) || code >= FIRST_SURROGATE) {
      return false;
    }
  }
  return true;
}

function escapeText(text: string): string {
  return isPlain(text) ? text : sanitizeXmlText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return isPlain(text) && !text.includes('\n') && !text.includes('\t')
    ? text
    : escapeText(text).replace(/"/g, '&quot;').replace(/[\n\t]/g, ' ');
}

function cdataSection(text: string): string {
  const content = isPlain(text) ? text : sanitizeXmlText(text).split(CDATA_END).join(CDATA_END_SPLIT);
  return `<![CDATA[${content}]]>`;
}

function openTag(node: XmlNode): string {
  let tag = `<${node.name}`;
  for (const [name, value] of node.attributes) {
    tag += ` ${name}="${escapeAttribute(value)}"`;
  }
  return tag;
}

function writeNode(node: XmlNode, lines: string[]): void {
  const open = openTag(node);
  if (node.text !== undefined) {
    const content = node.isCdata === true ? cdataSection(node.text) : escapeText(node.text);
    lines.push(`${open}>${content}</${node.name}>`);
    return;
  }
  if (node.children.length === 0) {
    lines.push(`${open} />`);
    return;
  }
  lines.push(`${open}>`);
  for (const child of node.children) {
    writeNode(child, lines);
  }
  lines.push(`</${node.name}>`);
}

/** The document as Guitar Pro 7/8 write it: the declaration, then one element per line without indentation. */
export function serializeXmlDocument(root: XmlNode): string {
  const lines = [DECLARATION];
  writeNode(root, lines);
  return `${lines.join('\n')}\n`;
}
