// Port of the DOM output of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter (addNode, addAttribute, removeNodeIfNoChildren, saveDocument; LGPL-2.1).

/** An element of the document being written: a tree of immutable nodes, serialized once at the end. */
export interface XmlNode {
  readonly name: string;
  readonly attributes: readonly (readonly [name: string, value: string])[];
  readonly children: readonly XmlNode[];
  readonly text: string | undefined;
}

/** A child slot: `undefined` or `false` leave nothing, so optional elements can be written inline. */
export type XmlChild = XmlNode | undefined | false;

/** Attribute values; undefined ones are left out. */
export type XmlAttributes = Readonly<Record<string, string | number | undefined>>;

const INDENT = '  ';

/** XML 1.0 forbids these code points even escaped (C0 controls but tab, line feed and carriage return; U+FFFE, U+FFFF). */
const FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const REPLACEMENT_CHARACTER = '�';
const SURROGATES = { first: 0xd800, last: 0xdfff } as const;

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Lone surrogates (a string iterates them as characters of their own) become U+FFFD. */
function withoutLoneSurrogates(value: string): string {
  if (!/[\uD800-\uDFFF]/.test(value)) {
    return value;
  }
  let out = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    out += codePoint >= SURROGATES.first && codePoint <= SURROGATES.last ? REPLACEMENT_CHARACTER : character;
  }
  return out;
}

/** Text or an attribute value as XML: markup characters escaped, characters XML cannot hold dropped or replaced. */
export function escapeXml(value: string): string {
  return withoutLoneSurrogates(value)
    .replace(FORBIDDEN_CHARACTERS, '')
    .replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function toAttributes(attributes: XmlAttributes): XmlNode['attributes'] {
  return Object.entries(attributes).flatMap(([name, value]): (readonly [string, string])[] => (value === undefined ? [] : [[name, String(value)]]));
}

function present(children: readonly XmlChild[]): readonly XmlNode[] {
  return children.filter((child): child is XmlNode => child !== undefined && child !== false);
}

/** addNode(parent, name) with its attributes and children. */
export function element(name: string, attributes: XmlAttributes = {}, children: readonly XmlChild[] = []): XmlNode {
  return { name, attributes: toAttributes(attributes), children: present(children), text: undefined };
}

/** addNode(parent, name, content). */
export function textElement(name: string, text: string | number, attributes: XmlAttributes = {}): XmlNode {
  return { name, attributes: toAttributes(attributes), children: [], text: String(text) };
}

/** An element only when it has children (removeNodeIfNoChildren). */
export function elementIfAny(name: string, children: readonly XmlChild[], attributes: XmlAttributes = {}): XmlNode | undefined {
  const node = element(name, attributes, children);
  return node.children.length === 0 ? undefined : node;
}

function openTag(node: XmlNode): string {
  const attributes = node.attributes.map(([name, value]) => ` ${name}="${escapeXml(value)}"`).join('');
  return `<${node.name}${attributes}`;
}

function serializeNode(node: XmlNode, depth: number, lines: string[]): void {
  const indent = INDENT.repeat(depth);
  if (node.text !== undefined) {
    lines.push(`${indent}${openTag(node)}>${escapeXml(node.text)}</${node.name}>`);
  } else if (node.children.length === 0) {
    lines.push(`${indent}${openTag(node)}/>`);
  } else {
    lines.push(`${indent}${openTag(node)}>`);
    node.children.forEach((child) => serializeNode(child, depth + 1, lines));
    lines.push(`${indent}</${node.name}>`);
  }
}

/** The document as indented text (saveDocument with OutputKeys.INDENT), after the XML declaration and `doctype`. */
export function serializeXml(root: XmlNode, doctype: string): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', doctype];
  serializeNode(root, 0, lines);
  return `${lines.join('\n')}\n`;
}
