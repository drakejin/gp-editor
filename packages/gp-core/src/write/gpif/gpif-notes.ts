// GPIF `<Note>` elements (no TuxGuitar counterpart): the inverse of the reader's readNote / parseNote.
import { XPROPERTY_TRILL_DURATION } from '../../formats/gpif/gpif-read-beat';
import { vibratoOf } from '../../model/defaults';
import type { Grace, GuitarString, Note } from '../../model/song';
import { bendCurveOf } from './gpif-curves';
import { flagProperty, intXProperty, pitchProperty, property } from './gpif-properties';
import { accentFlagsOf, harmonicFretOf, harmonicTypeNameOf, pitchOf, slideFlagsOf, trillTicksOf } from './gpif-units';
import { type DrumElement, drumArticulationIndex } from './drum-kit';
import { type XmlChild, type XmlNode, xmlElement, xmlText } from './xml-writer';

/** What a note element needs to know about its track and measure. */
export interface NoteTrackContext {
  readonly strings: readonly GuitarString[];
  /** Capo fret (Track.offset): Midi and concert pitches sound above the fret. */
  readonly capo: number;
  readonly isPercussion: boolean;
  /** The drum track's kit (empty for other tracks). */
  readonly drumKit: readonly DrumElement[];
}

export interface NoteContext extends NoteTrackContext {
  readonly keySignature: number;
  /** The next note on the string is tied to this one. */
  readonly isTieOrigin: boolean;
  /** A hammer-on or pull-off leads to this note. */
  readonly isHopoDestination: boolean;
}

/** Percussion pitches have no spelling: Guitar Pro writes C, octave -1. */
const UNPITCHED = { step: 'C', accidental: '', octave: -1 } as const;
/** A grace bend in GPIF is a bend on the grace note; the reader only checks there is one. */
const GRACE_BEND = { originValue: 0, destinationValue: 50, destinationOffset: 100 } as const;
const GRACE_SLIDE_FLAGS = 0x02;

/** GPIF `<String>`: 0 = lowest string. */
function gpifStringOf(note: Note, context: NoteTrackContext): number {
  return context.strings.length - note.string;
}

/** `<Midi>` of a fret on the note's string: the sounding pitch (a drum note's fret is its MIDI number). */
function midiOf(note: Note, fret: number, context: NoteTrackContext): number {
  if (context.isPercussion) {
    return fret;
  }
  const tuning = context.strings.find((s) => s.number === note.string)?.tuning ?? 0;
  return tuning + context.capo + fret;
}

/** The trill's `<Trill>` pitch; the reader takes the trill fret as fret + trill - Midi. 0 (no trill) when not above 0. */
function trillPitchOf(note: Note, midi: number): number {
  const trill = note.effect.trill;
  return trill === undefined ? 0 : Math.max(0, midi + trill.fret - note.fret);
}

function pitchProperties(name: 'ConcertPitch' | 'TransposedPitch', midi: number, context: NoteContext): XmlNode {
  return pitchProperty(name, context.isPercussion ? UNPITCHED : pitchOf(midi, context.keySignature));
}

function bendProperties(note: Note): readonly XmlNode[] {
  if (note.effect.bend === undefined) {
    return [];
  }
  const curve = bendCurveOf(note.effect.bend);
  const values: readonly (readonly [string, number | undefined])[] = [
    ['BendDestinationOffset', curve.destinationOffset],
    ['BendDestinationValue', curve.destinationValue],
    ['BendMiddleOffset1', curve.middleOffset1],
    ['BendMiddleOffset2', curve.middleOffset2],
    ['BendMiddleValue', curve.middleValue],
    ['BendOriginOffset', curve.originOffset],
    ['BendOriginValue', curve.originValue],
  ];
  return [flagProperty('Bended'), ...values.flatMap(([name, value]) => (value === undefined ? [] : [property(name, 'Float', value)]))];
}

function harmonicProperties(note: Note): readonly XmlNode[] {
  const harmonic = note.effect.harmonic;
  if (harmonic === undefined) {
    return [];
  }
  const fret = harmonicFretOf(harmonic, note.fret);
  return [
    flagProperty('Harmonic'),
    ...(fret === undefined ? [] : [property('HarmonicFret', 'HFret', fret)]),
    property('HarmonicType', 'HType', harmonicTypeNameOf(harmonic.type)),
  ];
}

/** The note's properties in the order Guitar Pro 7.6+ writes them. */
function noteProperties(note: Note, midi: number, context: NoteContext): readonly XmlChild[] {
  const { effect } = note;
  const slideFlags = slideFlagsOf(effect.slides);
  return [
    ...bendProperties(note),
    pitchProperties('ConcertPitch', midi, context),
    property('Fret', 'Fret', note.fret),
    ...harmonicProperties(note),
    context.isHopoDestination && flagProperty('HopoDestination'),
    effect.hammer && flagProperty('HopoOrigin'),
    property('Midi', 'Number', midi),
    effect.deadNote && flagProperty('Muted'),
    effect.palmMute && flagProperty('PalmMuted'),
    slideFlags !== 0 && property('Slide', 'Flags', slideFlags),
    property('String', 'String', gpifStringOf(note, context)),
    effect.tapping && flagProperty('Tapped'),
    pitchProperties('TransposedPitch', midi, context),
  ];
}

function articulationOf(note: Note, context: NoteTrackContext): number {
  return context.isPercussion ? drumArticulationIndex(context.drumKit, note.fret) : 0;
}

function tieOf(note: Note, context: NoteContext): XmlChild {
  if (!note.isTied && !context.isTieOrigin) {
    return undefined;
  }
  return xmlElement('Tie', [], { origin: String(context.isTieOrigin), destination: String(note.isTied) });
}

/** What `noteNode` builds a note element from, apart from the track: equal keys give equal elements within a track. */
export function noteNodeKey(note: Note, context: NoteContext): string {
  return JSON.stringify([note, context.keySignature, context.isTieOrigin, context.isHopoDestination]);
}

/** A note of a beat. */
export function noteNode(id: number, note: Note, context: NoteContext): XmlNode {
  const { effect } = note;
  const accent = accentFlagsOf(effect);
  const vibrato = vibratoOf(effect);
  const midi = midiOf(note, note.fret, context);
  const trillPitch = trillPitchOf(note, midi);
  const trill = trillPitch > 0 ? effect.trill : undefined;
  return xmlElement(
    'Note',
    [
      accent !== 0 && xmlText('Accent', accent),
      effect.ghostNote && xmlText('AntiAccent', 'Normal'),
      effect.letRing && xmlElement('LetRing'),
      vibrato !== 'none' && xmlText('Vibrato', vibrato === 'wide' ? 'Wide' : 'Slight'),
      tieOf(note, context),
      trill !== undefined && xmlText('Trill', trillPitch),
      xmlText('InstrumentArticulation', articulationOf(note, context)),
      xmlElement('Properties', noteProperties(note, midi, context)),
      trill !== undefined && xmlElement('XProperties', [intXProperty(XPROPERTY_TRILL_DURATION, trillTicksOf(trill.duration))]),
    ],
    { id },
  );
}

/** A grace bend is a bend on the grace note (the reader only checks there is one): a semitone up. */
function graceBendProperties(): readonly XmlNode[] {
  return [
    flagProperty('Bended'),
    property('BendDestinationOffset', 'Float', GRACE_BEND.destinationOffset),
    property('BendDestinationValue', 'Float', GRACE_BEND.destinationValue),
    property('BendOriginValue', 'Float', GRACE_BEND.originValue),
  ];
}

/** What `graceNoteNode` builds a grace note from, apart from the track. */
export function graceNoteNodeKey(note: Note, grace: Grace, context: NoteContext): string {
  return JSON.stringify(['grace', note.string, grace, context.keySignature]);
}

/** The grace note of `note` (on the grace beat before it): same string, the grace's fret and transition. */
export function graceNoteNode(id: number, note: Note, grace: Grace, context: NoteContext): XmlNode {
  const fret = Math.max(0, grace.fret);
  const midi = midiOf(note, fret, context);
  const properties: readonly XmlChild[] = [
    ...(grace.transition === 'bend' ? graceBendProperties() : []),
    pitchProperties('ConcertPitch', midi, context),
    property('Fret', 'Fret', fret),
    grace.transition === 'hammer' && flagProperty('HopoOrigin'),
    property('Midi', 'Number', midi),
    grace.isDead && flagProperty('Muted'),
    grace.transition === 'slide' && property('Slide', 'Flags', GRACE_SLIDE_FLAGS),
    property('String', 'String', gpifStringOf(note, context)),
    pitchProperties('TransposedPitch', midi, context),
  ];
  return xmlElement(
    'Note',
    [xmlText('InstrumentArticulation', articulationOf({ ...note, fret }, context)), xmlElement('Properties', properties)],
    { id },
  );
}
