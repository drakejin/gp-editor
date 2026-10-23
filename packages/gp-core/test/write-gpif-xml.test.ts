import { describe, expect, it } from 'vitest';
import { parseXml } from '../src/formats/gpif/xml';
import { sanitizeXmlText, serializeXmlDocument, xmlCdata, xmlElement, xmlText } from '../src/write/gpif/xml-writer';

function roundTripText(text: string): string | undefined {
  return parseXml(serializeXmlDocument(xmlElement('A', [xmlText('B', text)]))).children[0]?.text;
}

describe('sanitizeXmlText', () => {
  it('keeps tabs, line feeds and every printable character', () => {
    // Arrange
    const text = 'a\tb\nc é 한 😀 <&>';

    // Act / Assert
    expect(sanitizeXmlText(text)).toBe(text);
  });

  it('turns carriage returns into line feeds, as an XML parser does', () => {
    // Arrange / Act / Assert
    expect(sanitizeXmlText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('drops control characters and non-characters XML 1.0 cannot hold', () => {
    // Arrange / Act / Assert
    expect(sanitizeXmlText('a\u0000b\u0007c\u000bd\u001fe\ufffef\uffff')).toBe('abcdef');
  });

  it('replaces lone surrogates with U+FFFD and keeps surrogate pairs', () => {
    // Arrange / Act / Assert
    expect(sanitizeXmlText('a\ud800b\udc00c😀')).toBe('a\ufffdb\ufffdc😀');
  });
});

describe('serializeXmlDocument', () => {
  it('writes the declaration, one element per line, and empty elements self-closed', () => {
    // Arrange
    const root = xmlElement('GPIF', [xmlText('GPVersion', '7.6.0'), xmlElement('Enable'), xmlElement('Notes', [xmlText('Note', 1)])]);

    // Act
    const xml = serializeXmlDocument(root);

    // Assert
    expect(xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?>\n<GPIF>\n<GPVersion>7.6.0</GPVersion>\n<Enable />\n<Notes>\n<Note>1</Note>\n</Notes>\n</GPIF>\n',
    );
  });

  it('leaves out absent children', () => {
    // Arrange
    const root = xmlElement('A', [undefined, false, xmlElement('B')]);

    // Act / Assert
    expect(serializeXmlDocument(root)).toContain('<A>\n<B />\n</A>');
  });

  it('escapes text so that the reader gets it back', () => {
    // Arrange / Act / Assert
    expect(roundTripText('a < b && c > "d" \'e\'')).toBe('a < b && c > "d" \'e\'');
    expect(serializeXmlDocument(xmlText('A', '<&>'))).toContain('<A>&lt;&amp;&gt;</A>');
  });

  it('keeps leading and trailing white space of a text', () => {
    // Arrange / Act / Assert
    expect(roundTripText('  two  ')).toBe('  two  ');
  });

  it('escapes attribute values', () => {
    // Arrange
    const root = xmlElement('Item', [], { id: 3, name: 'A&B "C" <D>' });

    // Act
    const parsed = parseXml(serializeXmlDocument(root));

    // Assert
    expect(parsed.attributes.get('id')).toBe('3');
    expect(parsed.attributes.get('name')).toBe('A&B "C" <D>');
  });

  it('writes CDATA sections, splitting a "]]>" in the text', () => {
    // Arrange
    const root = xmlElement('Score', [xmlCdata('Title', 'a]]>b'), xmlCdata('Words', '')]);

    // Act
    const xml = serializeXmlDocument(root);
    const parsed = parseXml(xml);

    // Assert
    expect(xml).toContain('<Title><![CDATA[a]]]]><![CDATA[>b]]></Title>');
    expect(xml).toContain('<Words><![CDATA[]]></Words>');
    expect(parsed.children.map((child) => child.text)).toEqual(['a]]>b', '']);
  });

  it('sanitizes text, CDATA and attribute values', () => {
    // Arrange
    const root = xmlElement('A', [xmlText('B', 'x\u0001y'), xmlCdata('C', 'p\r\nq')], { n: 'm\u0002n' });

    // Act
    const parsed = parseXml(serializeXmlDocument(root));

    // Assert
    expect(parsed.children.map((child) => child.text)).toEqual(['xy', 'p\nq']);
    expect(parsed.attributes.get('n')).toBe('mn');
  });
});
