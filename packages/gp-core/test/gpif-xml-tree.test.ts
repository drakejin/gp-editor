import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { type XmlElement, parseXmlDocument } from '../src/formats/gpif/xml';
import { readXmlTree } from '../src/formats/gpif/xml-tree';

const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  cdataPropName: '#cdata',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  commentPropName: false,
});

interface PlainElement {
  readonly name: string;
  readonly attributes: readonly (readonly [string, string])[];
  readonly text: string;
  readonly children: readonly PlainElement[];
}

function plain(element: XmlElement | undefined): PlainElement | undefined {
  if (element === undefined) {
    return undefined;
  }
  const children = element.children.map((child) => plain(child) as PlainElement);
  return { name: element.name, attributes: [...element.attributes], text: element.text, children };
}

/** The tree fast-xml-parser gives (a document type, after the declaration, keeps readXmlTree out). */
function parserTree(xml: string): PlainElement | undefined {
  return plain(parseXmlDocument(xml.replace(/^(<\?xml[^>]*\?>)?/, '$1<!DOCTYPE R>'), PARSER, 'test'));
}

describe('readXmlTree', () => {
  it('reads elements, attributes, text and CDATA as fast-xml-parser does', () => {
    // Arrange
    const xml =
      '<?xml version="1.0"?>\r\n<R a="1" b=\'x &amp; y\'>\n\t<A>t &lt;1&gt;<![CDATA[c & d]]><!-- c -->u</A><B/><C x="&quot;"\n/>\r\n</R>';

    // Act
    const tree = plain(readXmlTree(xml));

    // Assert
    expect(tree).toEqual(parserTree(xml));
    expect(tree?.attributes).toEqual([
      ['a', '1'],
      ['b', 'x & y'],
    ]);
    expect(tree?.children.map((child) => child.text)).toEqual(['t <1>c & du', '', '']);
    expect(tree?.text).toBe('\n\t\n');
  });

  it('keeps an element name that ends where white space starts, and a self-closing tag with a space before the slash', () => {
    // Arrange
    const xml = '<R><A\tid="2" /><B\n/></R>';

    // Act
    const tree = plain(readXmlTree(xml));

    // Assert
    expect(tree?.children).toEqual([
      { name: 'A', attributes: [['id', '2']], text: '', children: [] },
      { name: 'B', attributes: [], text: '', children: [] },
    ]);
  });

  it.each([
    ['a document type', '<!DOCTYPE r><r/>'],
    ['a character reference', '<r>&#233;</r>'],
    ['an HTML entity', '<r a="&nbsp;"/>'],
    ['a bare ampersand', '<r>a & b</r>'],
    ['a name objects own', '<r><toString/></r>'],
    ['an attribute name objects own', '<r constructor="1"/>'],
    ['a processing instruction with such a name', '<?pi valueOf="1"?><r/>'],
    ['deep nesting', `${'<d>'.repeat(70)}${'</d>'.repeat(70)}`],
    ['an unclosed element', '<r><a></r>'],
    ['an unclosed comment', '<r><!-- </r>'],
    ['an unclosed tag', '<r><a'],
    ['a closing tag of another element', '<r><a></b></r>'],
    ['a second root', '<r/><s/>'],
    ['text outside the root', '<r/>x'],
    ['a name beyond ASCII', '<r><é/></r>'],
    ['an attribute without white space before it', '<r a="1"b="2"/>'],
    ['an attribute given twice', '<r a="1" a="2"/>'],
    ['an attribute without quotes', '<r a=1/>'],
    ['an attribute without a value', '<r a/>'],
    ['the XML declaration after the start', ' <?xml version="1.0"?><r/>'],
    ['a byte order mark', '\uFEFF<r/>'],
    ['a CDATA-like section that is not CDATA', '<r><![X[a]]></r>'],
  ])('leaves %s to fast-xml-parser', (_case, xml) => {
    // Arrange / Act / Assert
    expect(readXmlTree(xml)).toBeUndefined();
  });

  it('returns undefined when there is no element', () => {
    expect(readXmlTree('just text')).toBeUndefined();
  });
});
