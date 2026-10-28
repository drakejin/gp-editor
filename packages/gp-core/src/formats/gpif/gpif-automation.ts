// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentReader#readAutomations (LGPL-2.1): one `<Automation>`.
import type { GpifAutomation } from './gpif-document';
import { type XmlElement, childText, parseFloatOr, parseJavaInt, parseNumberList } from './xml';

/** A master track's or a track's `<Automation>`: type, bar, position in the bar and the values (fractions kept: a tempo "92.5 2"). */
export function readAutomation(node: XmlElement): GpifAutomation {
  return {
    type: childText(node, 'Type') ?? '',
    barId: parseJavaInt(childText(node, 'Bar'), 0),
    position: parseFloatOr(childText(node, 'Position'), 0),
    value: parseNumberList(childText(node, 'Value'), ' '),
  };
}
