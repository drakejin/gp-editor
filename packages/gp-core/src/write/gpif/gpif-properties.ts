// `<Property>` and `<XProperty>` elements of GPIF notes and beats (no TuxGuitar counterpart).
import { type XmlNode, xmlElement, xmlText } from './xml-writer';
import type { Pitch } from './gpif-units';

/** `<Property name="…"><ValueName>value</ValueName></Property>`. */
export function property(name: string, valueName: string, value: string | number): XmlNode {
  return xmlElement('Property', [xmlText(valueName, value)], { name });
}

/** `<Property name="…"><Enable /></Property>`: a flag. */
export function flagProperty(name: string): XmlNode {
  return xmlElement('Property', [xmlElement('Enable')], { name });
}

/** `<Property name="…"><Pitch><Step/><Accidental/><Octave/></Pitch></Property>`. */
export function pitchProperty(name: string, pitch: Pitch): XmlNode {
  const children = [xmlText('Step', pitch.step), xmlText('Accidental', pitch.accidental), xmlText('Octave', pitch.octave)];
  return xmlElement('Property', [xmlElement('Pitch', children)], { name });
}

/** `<XProperty id="…"><Int>value</Int></XProperty>`. */
export function intXProperty(id: string, value: number): XmlNode {
  return xmlElement('XProperty', [xmlText('Int', value)], { id });
}
