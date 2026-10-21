// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentReader#readBeats / #readNotes (LGPL-2.1).
import type { GpifBeat, GpifBendCurve, GpifNote } from './gpif-document';
import {
  type XmlElement,
  attribute,
  child,
  childList,
  childText,
  parseIntList,
  parseJavaInt,
} from './xml';

const XPROPERTY_BRUSH_DURATION = '687935489';
const XPROPERTY_TRILL_DURATION = '688062467';

interface Property {
  readonly name: string;
  readonly node: XmlElement;
}

function properties(node: XmlElement): readonly Property[] {
  return childList(node, 'Properties', 'Property').map((p) => ({ name: attribute(p, 'name') ?? '', node: p }));
}

function propertyMap(node: XmlElement): ReadonlyMap<string, XmlElement> {
  const map = new Map<string, XmlElement>();
  for (const property of properties(node)) {
    map.set(property.name, property.node);
  }
  return map;
}

function xPropertyInt(node: XmlElement, id: string): number | undefined {
  const xProperty = childList(node, 'XProperties', 'XProperty').find((p) => attribute(p, 'id') === id);
  const value = childText(xProperty, 'Int');
  return value === undefined ? undefined : parseJavaInt(value, 0);
}

function isEnabled(property: XmlElement | undefined): boolean {
  return child(property, 'Enable') !== undefined;
}

/** A bend or whammy curve from `<prefix>OriginValue` … properties (Float content truncated to int). */
function readCurve(props: ReadonlyMap<string, XmlElement>, prefix: string): GpifBendCurve {
  const value = (suffix: string): number | undefined => {
    const property = props.get(prefix + suffix);
    return property === undefined ? undefined : parseJavaInt(childText(property, 'Float'), 0);
  };
  return {
    originValue: value('OriginValue'),
    middleValue: value('MiddleValue'),
    destinationValue: value('DestinationValue'),
    originOffset: value('OriginOffset'),
    middleOffset1: value('MiddleOffset1'),
    middleOffset2: value('MiddleOffset2'),
    destinationOffset: value('DestinationOffset'),
  };
}

/** GP7 `<Whammy originValue=… />` element: the same curve as the GP6 WhammyBar properties. */
function readWhammyElement(whammy: XmlElement): GpifBendCurve {
  const value = (name: string): number => parseJavaInt(attribute(whammy, name), 0);
  return {
    originValue: value('originValue'),
    middleValue: value('middleValue'),
    destinationValue: value('destinationValue'),
    originOffset: value('originOffset'),
    middleOffset1: value('middleOffset1'),
    middleOffset2: value('middleOffset2'),
    destinationOffset: value('destinationOffset'),
  };
}

function direction(property: XmlElement | undefined): string {
  return property === undefined ? '' : (childText(property, 'Direction') ?? '');
}

export function readBeat(node: XmlElement): GpifBeat {
  const props = propertyMap(node);
  const whammy = child(node, 'Whammy');
  const chord = childText(node, 'Chord');
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    rhythmId: parseJavaInt(attribute(child(node, 'Rhythm'), 'ref'), 0),
    noteIds: parseIntList(childText(node, 'Notes'), ' '),
    dynamic: childText(node, 'Dynamic'),
    slapped: isEnabled(props.get('Slapped')),
    popped: isEnabled(props.get('Popped')),
    brush: direction(props.get('Brush')),
    brushDuration: xPropertyInt(node, XPROPERTY_BRUSH_DURATION),
    pickStroke: direction(props.get('PickStroke')),
    tremolo: parseIntList(childText(node, 'Tremolo'), '/'),
    fadding: childText(node, 'Fadding'),
    text: childText(node, 'FreeText') ?? '',
    chordId: chord === undefined ? undefined : parseJavaInt(chord, -1),
    graceNotes: childText(node, 'GraceNotes'),
    whammyBarEnabled: whammy !== undefined || isEnabled(props.get('WhammyBar')),
    whammyBar: whammy !== undefined ? readWhammyElement(whammy) : readCurve(props, 'WhammyBar'),
    vibrato: props.has('VibratoWTremBar'),
  };
}

function intProperty(props: ReadonlyMap<string, XmlElement>, name: string, valueName: string): number {
  const property = props.get(name);
  return property === undefined ? -1 : parseJavaInt(childText(property, valueName), 0);
}

export function readNote(node: XmlElement): GpifNote {
  const props = propertyMap(node);
  const slide = props.get('Slide');
  const tie = child(node, 'Tie');
  const harmonicType = props.get('HarmonicType');
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    fret: intProperty(props, 'Fret', 'Fret'),
    string: intProperty(props, 'String', 'String'),
    tone: intProperty(props, 'Tone', 'Step'),
    octave: intProperty(props, 'Octave', 'Number'),
    element: intProperty(props, 'Element', 'Element'),
    variation: intProperty(props, 'Variation', 'Variation'),
    midiNumber: intProperty(props, 'Midi', 'Number'),
    trill: parseJavaInt(childText(node, 'Trill'), 0),
    trillDuration: xPropertyInt(node, XPROPERTY_TRILL_DURATION) ?? 0,
    bendEnabled: isEnabled(props.get('Bended')),
    bend: readCurve(props, 'Bend'),
    hammer: props.has('HopoOrigin'),
    ghost: childText(node, 'AntiAccent')?.toLowerCase() === 'normal',
    slide: slide !== undefined,
    slideFlags: slide === undefined ? 0 : parseJavaInt(childText(slide, 'Flags'), 0),
    vibrato: child(node, 'Vibrato') !== undefined,
    letRing: child(node, 'LetRing') !== undefined,
    accent: parseJavaInt(childText(node, 'Accent'), 0),
    tapped: isEnabled(props.get('Tapped')),
    tieDestination: tie !== undefined && attribute(tie, 'destination') === 'true',
    muted: isEnabled(props.get('Muted')),
    palmMuted: isEnabled(props.get('PalmMuted')),
    harmonicFret: intProperty(props, 'HarmonicFret', 'HFret'),
    harmonicType: harmonicType === undefined ? '' : (childText(harmonicType, 'HType') ?? ''),
  };
}
