import { expect } from 'vitest';
import { type XmlElement, attribute, child, childText, children, parseXml } from '../../src/formats/gpif/xml';

/** The written document as a tree; parseXml refuses malformed XML (and a DOCTYPE, so its line is dropped first). */
export function parseWritten(xml: string): XmlElement {
  return parseXml(xml.replace(/<!DOCTYPE[^>]*>/, ''));
}

/** Every descendant (depth first) with this name. */
export function descendants(element: XmlElement | undefined, name: string): XmlElement[] {
  return (element?.children ?? []).flatMap((c) => [...(c.name === name ? [c] : []), ...descendants(c, name)]);
}

export function measuresOf(root: XmlElement, partIndex = 0): readonly XmlElement[] {
  return children(children(root, 'part')[partIndex], 'measure');
}

/** The notes of a measure on one staff (1 = notation, 2 = tab). */
export function notesOn(measure: XmlElement | undefined, staff: number): XmlElement[] {
  return children(measure, 'note').filter((note) => childText(note, 'staff') === String(staff));
}

export function technicalOf(note: XmlElement | undefined): XmlElement | undefined {
  return child(child(note, 'notations'), 'technical');
}

/** Child names of `element`, e.g. to check element order. */
export function childNames(element: XmlElement | undefined): readonly string[] {
  return element?.children.map((c) => c.name) ?? [];
}

/** The schema order of a sequence: each child name's index in `order`; fails on a name out of order or unknown. */
export function expectSchemaOrder(element: XmlElement, order: readonly string[]): void {
  const indexes = element.children.map((c) => order.indexOf(c.name));
  expect(indexes.every((index) => index >= 0), `${element.name}: ${childNames(element).join(',')}`).toBe(true);
  expect(indexes, `${element.name}: ${childNames(element).join(',')}`).toEqual([...indexes].sort((a, b) => a - b));
}

export { attribute, child, childText, children };
