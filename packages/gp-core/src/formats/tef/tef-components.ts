// Port of TuxGuitar app.tuxguitar.io.tef3.TEInputStream.readComponents (the component readers the song uses) and
// base.TEPosition.createPositionFromLocation (LGPL-2.1).
import type { ByteReader } from '../../io/byte-reader';
import type { TeComponent, TeMeasure, TePosition, TeTrack } from './tef-model';

/** A component is a 4-byte location, a type byte and 7 data bytes; a location of -1 is the end of the file. */
const DATA_SIZE = 8;
const END_OF_COMPONENTS = -1;
/** Sixty-fourth notes per whole note: TablEdit's grid. */
const GRID_PER_WHOLE = 64;
/** A location counts 8 per string slot. */
const LOCATION_PER_STRING = 8;

const TYPE = {
  REST: 0x33,
  CHORD: 0x35,
  TEXT: 0x39,
  SPACING_OR_GRACE: 0x7d,
  ENDING: 0xb7,
  TEMPO: 0xfe,
} as const;
/** The low six bits of a note's type are its fret + 1; values from the rest code up are other components. */
const NOTE_MARKER_MASK = 0x3f;
const GRACE_NOTE = 0x40;
const TIE = 0x20;
const LOWER_VOICE = 0x30;

/** Where a location is: the grid start of each measure (plus the end) and each track's string count. */
interface Layout {
  readonly measureStarts: readonly number[];
  readonly totalStrings: number;
  readonly stringCounts: readonly number[];
}

/**
 * readComponents: every component up to the end marker. Components the song does not use (line breaks, accents,
 * crescendos, connections, scale diagrams, drum and voice changes, spacing, symbols, beam breaks, stem lengths,
 * syncopation) and unknown types (TuxGuitar rejects the file) are skipped: each is a fixed-size record.
 */
export function readComponents(reader: ByteReader, measures: readonly TeMeasure[], tracks: readonly TeTrack[]): readonly TeComponent[] {
  const layout = buildLayout(measures, tracks);
  const components: TeComponent[] = [];
  for (let location = reader.readInt(); location !== END_OF_COMPONENTS; location = reader.readInt()) {
    const data = reader.readBytes(DATA_SIZE);
    const at = toPosition(layout, location);
    const component = at === undefined ? undefined : readComponent(data, at);
    if (component !== undefined) {
      components.push(component);
    }
  }
  return components;
}

function buildLayout(measures: readonly TeMeasure[], tracks: readonly TeTrack[]): Layout {
  const measureStarts = [0];
  for (const measure of measures) {
    measureStarts.push((measureStarts[measureStarts.length - 1] ?? 0) + gridLength(measure));
  }
  const stringCounts = tracks.map((track) => track.stringCount);
  return { measureStarts, totalStrings: stringCounts.reduce((sum, count) => sum + count, 0), stringCounts };
}

/** Sixty-fourth notes in a measure. */
export function gridLength(measure: TeMeasure): number {
  return (GRID_PER_WHOLE * measure.timeSignature.numerator) / measure.timeSignature.denominator;
}

/**
 * createPositionFromLocation: a location counts string slots (all tracks' strings, 8 apart) at each sixty-fourth of the
 * score. TuxGuitar steps by sixteenths, which puts every note off the sixteenth grid on a string that does not exist,
 * and counts a location at a measure's end in that measure. Locations outside the score are undefined.
 */
function toPosition(layout: Layout, location: number): TePosition | undefined {
  if (location < 0) {
    return undefined;
  }
  const slot = Math.floor(location / LOCATION_PER_STRING);
  const grid = Math.floor(slot / layout.totalStrings);
  const measure = findMeasure(layout.measureStarts, grid);
  if (measure === undefined) {
    return undefined;
  }
  let string = slot % layout.totalStrings;
  for (const [trackIndex, count] of layout.stringCounts.entries()) {
    if (string < count) {
      return { measure, position: grid - (layout.measureStarts[measure] ?? 0), string, trackIndex };
    }
    string -= count;
  }
  return undefined;
}

/** The measure whose grid span holds `grid` (a binary search over the measure starts). */
function findMeasure(starts: readonly number[], grid: number): number | undefined {
  let low = 0;
  let high = starts.length - 2;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = starts[middle] ?? 0;
    const end = starts[middle + 1] ?? 0;
    if (grid < start) {
      high = middle - 1;
    } else if (grid >= end) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return undefined;
}

function readComponent(data: Uint8Array, at: TePosition): TeComponent | undefined {
  const type = data[0] ?? 0;
  const byte = (index: number): number => data[index + 1] ?? 0;
  const word = (index: number): number => byte(index) | (byte(index + 1) << 8);
  switch (type) {
    case TYPE.REST:
      return { kind: 'rest', at, duration: byte(0) & 0x1f, isLowerVoice: (byte(1) & LOWER_VOICE) === LOWER_VOICE };
    case TYPE.CHORD:
      return { kind: 'chord', at, chordIndex: word(0) };
    case TYPE.TEXT:
      return { kind: 'text', at, textIndex: word(0) };
    case TYPE.TEMPO:
      return { kind: 'tempo', at, bpm: word(0) };
    case TYPE.ENDING:
      return { kind: 'ending', at, endingNumber: byte(1) & 0x07, isOpenBracket: (byte(1) & 0x40) !== 0, isCloseBracket: (byte(1) & 0x80) !== 0 };
    case TYPE.SPACING_OR_GRACE:
      // A first byte of 0 is a spacing marker; anything else describes a grace note.
      return byte(0) === 0 ? undefined : { kind: 'graceMetadata', at, duration: byte(0), doubleNoteOne: byte(3) & 0x7f };
    default:
      return readNote(type, byte, at);
  }
}

/**
 * readNoteComponent. The fret takes the type's low six bits (TuxGuitar reads five, so frets from 31 up and codes from
 * 0x1a are lost); bit 6 marks a grace note.
 */
function readNote(type: number, byte: (index: number) => number, at: TePosition): TeComponent | undefined {
  const marker = type & NOTE_MARKER_MASK;
  if (marker === 0 || marker >= TYPE.REST) {
    return undefined;
  }
  return {
    kind: 'note',
    at,
    fret: marker - 1,
    isGraceNote: (type & GRACE_NOTE) !== 0,
    duration: byte(0) & 0x1f,
    dynamics: byte(0) >> 5,
    effect1: byte(1) & 0x0f,
    attributes: (byte(1) >> 4) & 0x03,
    graceNoteEffect: byte(2) >> 5,
    graceNoteFret: byte(2) & 0x1f,
    effect2: byte(3) & 0x0f,
    effect3: byte(3) >> 4,
    stroke: byte(5) >> 5,
    isTied: (byte(6) & TIE) !== 0,
  };
}
