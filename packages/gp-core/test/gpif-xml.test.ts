import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import {
  attribute,
  child,
  childText,
  children,
  parseFloatOr,
  parseIntList,
  parseJavaInt,
  parseXml,
} from '../src/formats/gpif/xml';

describe('parseXml', () => {
  it('builds an element tree with attributes, text and CDATA', () => {
    // Arrange
    const xml = '<?xml version="1.0"?>\n<GPIF><Score><Title><![CDATA[A & B]]></Title></Score>'
      + '<Track id="3"><Name>x &amp; y</Name><Empty/></Track><!-- comment --></GPIF>';

    // Act
    const root = parseXml(xml);

    // Assert
    expect(root.name).toBe('GPIF');
    expect(childText(child(root, 'Score'), 'Title')).toBe('A & B');
    const track = child(root, 'Track');
    expect(attribute(track, 'id')).toBe('3');
    expect(childText(track, 'Name')).toBe('x & y');
    expect(childText(track, 'Empty')).toBe('');
    expect(childText(track, 'Missing')).toBeUndefined();
  });

  it('keeps the text of elements whose CDATA is surrounded by whitespace', () => {
    const root = parseXml('<GPIF><Section><Text>\n  <![CDATA[Intro]]>\n</Text></Section></GPIF>');
    expect(childText(child(root, 'Section'), 'Text')?.trim()).toBe('Intro');
  });

  it('accepts a UTF-8 byte order mark', () => {
    expect(parseXml('\uFEFF<GPIF/>').name).toBe('GPIF');
  });

  it('returns children in document order filtered by name', () => {
    const root = parseXml('<R><A i="1"/><B/><A i="2"/></R>');
    expect(children(root, 'A').map((a) => attribute(a, 'i'))).toEqual(['1', '2']);
    expect(children(undefined, 'A')).toEqual([]);
    expect(child(undefined, 'A')).toBeUndefined();
    expect(attribute(undefined, 'i')).toBeUndefined();
  });

  it('rejects documents with a DOCTYPE (entity expansion)', () => {
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY a "b">]><GPIF>&a;</GPIF>')).toThrow(GpFormatError);
  });

  it('rejects malformed XML with a GpFormatError', () => {
    expect(() => parseXml('<GPIF><A></B></GPIF>')).toThrow(GpFormatError);
    expect(() => parseXml('<GPIF><A></B></GPIF>')).toThrow(/Invalid GPIF document/);
  });

  it('rejects input without a root element', () => {
    expect(() => parseXml('just text')).toThrow(GpFormatError);
    expect(() => parseXml('')).toThrow(GpFormatError);
  });
});

describe('number helpers (java.math.BigDecimal#intValue semantics)', () => {
  it.each([
    ['12', 12],
    [' 7 ', 7],
    ['2.4', 2],
    ['-2.9', -2],
    ['1e2', 100],
    ['4294967295', -1],
  ])('parseJavaInt(%j) = %d', (text, expected) => {
    expect(parseJavaInt(text, 99)).toBe(expected);
  });

  it('returns the fallback for missing or malformed numbers', () => {
    expect(parseJavaInt(undefined, 5)).toBe(5);
    expect(parseJavaInt('', 5)).toBe(5);
    expect(parseJavaInt('abc', -1)).toBe(-1);
    expect(parseFloatOr('0.755', 0)).toBeCloseTo(0.755);
    expect(parseFloatOr('nope', 0.5)).toBe(0.5);
    expect(parseFloatOr(undefined, 1)).toBe(1);
  });

  it('splits integer lists, mapping malformed items to 0', () => {
    expect(parseIntList('0 1 -1', ' ')).toEqual([0, 1, -1]);
    expect(parseIntList(' 4/4 ', '/')).toEqual([4, 4]);
    expect(parseIntList('120.5 x', ' ')).toEqual([120, 0]);
    expect(parseIntList('0\n1', ' ')).toEqual([0, 1]);
    expect(parseIntList('', ' ')).toEqual([]);
    expect(parseIntList(undefined, ' ')).toBeUndefined();
  });
});
