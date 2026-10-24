// Chord collections of a GPIF staff (no TuxGuitar counterpart): the inverse of the reader's readChords / buildChord.
import { hasChordDiagram } from '../../chords/shape';
import type { Chord, Track } from '../../model/song';
import { type XmlNode, xmlElement } from './xml-writer';

/** The fret Guitar Pro writes for a string a diagram's fingering leaves out (-1 as an unsigned 32-bit number). */
const NO_FINGERING_FRET = 4294967295;
const MIN_FRET_COUNT = 5;

/** Identity of a chord within a track: equal chords share one collection item. */
export function chordKeyOf(chord: Chord): string {
  return JSON.stringify([chord.name, chord.firstFret, chord.frets]);
}

/** Item id of every distinct chord of a track, in the order its beats use them. */
export function chordIdsOf(track: Track): ReadonlyMap<string, number> {
  const ids = new Map<string, number>();
  for (const measure of track.measures) {
    for (const beat of measure.beats) {
      if (beat.chord !== undefined && !ids.has(chordKeyOf(beat.chord))) {
        ids.set(chordKeyOf(beat.chord), ids.size);
      }
    }
  }
  return ids;
}

const ACCIDENTALS: Readonly<Record<string, string>> = { '#': 'Sharp', b: 'Flat', '': 'Natural' };

function noteAttributes(match: RegExpMatchArray | null): Readonly<Record<string, string>> {
  return { step: match?.[1] ?? 'C', accidental: ACCIDENTALS[match?.[2] ?? ''] ?? 'Natural' };
}

/** Guitar Pro's chord details, read off the name: root, bass, a major or minor triad. */
function chordDetailsNode(name: string): XmlNode {
  const root = name.match(/^([A-G])([#b]?)/);
  const bass = name.match(/\/([A-G])([#b]?)/) ?? root;
  const isMinor = /^[A-G][#b]?m(?!aj)/.test(name);
  return xmlElement('Chord', [
    xmlElement('KeyNote', [], noteAttributes(root)),
    xmlElement('BassNote', [], noteAttributes(bass)),
    xmlElement('Degree', [], { interval: 'Third', alteration: isMinor ? 'Minor' : 'Major', omitted: 'false' }),
    xmlElement('Degree', [], { interval: 'Fifth', alteration: 'Perfect', omitted: 'false' }),
  ]);
}

function boolProperty(name: string): XmlNode {
  return xmlElement('Property', [], { name, type: 'bool', value: 'true' });
}

/**
 * The diagram of a chord. Frets are written relative to the base fret (GPIF string 0 = the lowest string); the base fret
 * is the chord's first fret minus one, lowered to the lowest played fret so that no fret is below it.
 */
function diagramNode(chord: Chord): XmlNode {
  const played = chord.frets.filter((fret) => fret >= 0);
  const baseFret = Math.max(0, Math.min(chord.firstFret - 1, ...played));
  const count = chord.frets.length;
  const strings = chord.frets.map((_, gpifString) => ({ gpifString, fret: chord.frets[count - 1 - gpifString] ?? -1 }));
  const fretCount = Math.max(MIN_FRET_COUNT, ...played.map((fret) => fret - baseFret));
  return xmlElement(
    'Diagram',
    [
      ...strings.flatMap(({ gpifString, fret }) => (fret < 0 ? [] : [xmlElement('Fret', [], { string: gpifString, fret: fret - baseFret })])),
      xmlElement(
        'Fingering',
        strings.map(({ gpifString, fret }) =>
          xmlElement('Position', [], { finger: 'None', fret: fret < 0 ? NO_FINGERING_FRET : fret - baseFret, string: gpifString }),
        ),
      ),
      boolProperty('ShowDiagram'),
      boolProperty('ShowName'),
      boolProperty('ShowFingering'),
    ],
    { stringCount: count, fretCount, baseFret, barsStates: Array.from({ length: fretCount }, () => '1').join(' ') },
  );
}

function itemNode(chord: Chord, id: number): XmlNode {
  const diagram = hasChordDiagram(chord) ? diagramNode(chord) : undefined;
  return xmlElement('Item', [diagram, chordDetailsNode(chord.name)], { id, name: chord.name });
}

function collection(name: string, items: readonly XmlNode[]): XmlNode {
  return xmlElement('Property', [xmlElement('Items', items)], { name });
}

/**
 * The staff's chord properties: chords with a diagram in DiagramCollection, chords with a name only in ChordCollection
 * (the reader reads both, by item id), and empty working sets (Guitar Pro's chord palette).
 */
export function chordPropertiesOf(track: Track, chordIds: ReadonlyMap<string, number>): readonly XmlNode[] {
  const chords = new Map<string, Chord>();
  for (const beat of track.measures.flatMap((measure) => measure.beats)) {
    if (beat.chord !== undefined && !chords.has(chordKeyOf(beat.chord))) {
      chords.set(chordKeyOf(beat.chord), beat.chord);
    }
  }
  const items = [...chords.entries()].map(([key, chord]) => ({ chord, id: chordIds.get(key) ?? 0 }));
  return [
    collection('ChordCollection', items.filter(({ chord }) => !hasChordDiagram(chord)).map(({ chord, id }) => itemNode(chord, id))),
    collection('ChordWorkingSet', []),
    collection('DiagramCollection', items.filter(({ chord }) => hasChordDiagram(chord)).map(({ chord, id }) => itemNode(chord, id))),
    collection('DiagramWorkingSet', []),
  ];
}
