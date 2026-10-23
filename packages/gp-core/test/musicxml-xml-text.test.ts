import { describe, expect, it } from 'vitest';
import { element, elementIfAny, escapeXml, serializeXml, textElement } from '../src/write/musicxml/xml-text';

describe('escapeXml', () => {
  it('escapes markup characters', () => {
    // Arrange / Act
    const escaped = escapeXml(`<a href="x">Tom & Jerry's</a>`);

    // Assert
    expect(escaped).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;');
  });

  it('drops control characters XML cannot hold and keeps tabs and line breaks', () => {
    // Arrange / Act
    const escaped = escapeXml('a\u0000b\u0007c\td\ne\rf￿');

    // Assert
    expect(escaped).toBe('abc\td\ne\rf');
  });

  it('replaces lone surrogates and keeps characters outside the BMP', () => {
    // Arrange / Act
    const escaped = escapeXml('\uD800x\uDC00 🎸 한글');

    // Assert
    expect(escaped).toBe('�x� 🎸 한글');
  });
});

describe('serializeXml', () => {
  it('writes an indented document after the declaration and doctype', () => {
    // Arrange
    const root = element('root', { version: '4.0', skipped: undefined }, [
      textElement('title', 'A & B'),
      element('empty'),
      undefined,
      false,
      element('outer', {}, [textElement('n', 3, { kind: 'x"y' })]),
    ]);

    // Act
    const text = serializeXml(root, '<!DOCTYPE root>');

    // Assert
    expect(text).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<!DOCTYPE root>',
        '<root version="4.0">',
        '  <title>A &amp; B</title>',
        '  <empty/>',
        '  <outer>',
        '    <n kind="x&quot;y">3</n>',
        '  </outer>',
        '</root>',
        '',
      ].join('\n'),
    );
  });

  it('leaves out an element whose children are all missing', () => {
    // Arrange / Act
    const none = elementIfAny('articulations', [undefined, false]);
    const some = elementIfAny('articulations', [element('accent')]);

    // Assert
    expect(none).toBeUndefined();
    expect(some?.children.map((child) => child.name)).toEqual(['accent']);
  });
});
