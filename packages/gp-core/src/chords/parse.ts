// Chord symbols ("Am7", "C/G", "F#m7b5") back to a ChordSpec: the inverse of naming.ts, for the chord library's search.
import { letterPitchClass } from '../edit/key-spelling';
import { CHORD_TYPES } from './database';
import { chordQuality } from './naming';
import { CHORD_EXTENSIONS, type ChordSpec, type ChordSpecOptions, DEGREE_SHIFTS, buildChordSpec, pitchClass } from './spec';

type ChordQuality = Omit<ChordSpec, 'root' | 'bass'>;

type QualityOptions = Required<Pick<ChordSpecOptions, 'extension' | 'isAdd' | 'extensionShift' | 'fifth' | 'ninth' | 'eleventh'>>;

/** `partials` with each of `values` set as `key`, the earlier keys varying slower (nested loops' order). */
function withEach<K extends keyof QualityOptions>(partials: readonly Partial<QualityOptions>[], key: K, values: readonly QualityOptions[K][]): Partial<QualityOptions>[] {
  return partials.flatMap((partial) => values.map((value) => ({ ...partial, [key]: value })));
}

/** Every choice of the selector's lists below the chord type, in the selector's order. */
function qualityOptions(): readonly Partial<QualityOptions>[] {
  const extensions = withEach([{}], 'extension', CHORD_EXTENSIONS);
  const adds = withEach(extensions, 'isAdd', [false, true]);
  const shifts = withEach(adds, 'extensionShift', DEGREE_SHIFTS);
  const fifths = withEach(shifts, 'fifth', DEGREE_SHIFTS);
  return withEach(withEach(fifths, 'ninth', DEGREE_SHIFTS), 'eleventh', DEGREE_SHIFTS);
}

/** Every quality chordName can write, first spec first (so "9" reads as the major chord's ninth). */
function buildQualityTable(): ReadonlyMap<string, ChordQuality> {
  const table = new Map<string, ChordQuality>();
  const options = qualityOptions();
  for (const type of CHORD_TYPES) {
    for (const option of options) {
      // Built on root C, so the spec is its own quality's label source (root and bass 0).
      const spec = buildChordSpec(0, type.name, option);
      const label = chordQuality(spec);
      if (!table.has(label)) {
        const { root: _root, bass: _bass, ...quality } = spec;
        table.set(label, quality);
      }
    }
  }
  return table;
}

const QUALITIES = buildQualityTable();

/** Other ways to write a quality, tried in order when it is not one chordName writes. */
const ALIASES: readonly (readonly [RegExp, string])[] = [
  [/[()]/g, ''],
  [/^(min|mi|-)/, 'm'],
  [/^m(M|Maj|maj|Ma|ma|Δ|\/maj|\/M)(\d+)$/, 'm(maj$2)'],
  [/^(Maj|Ma|ma|M|Δ)(?=\d)/, 'maj'],
  [/^Δ$/, 'maj7'],
  [/^(maj|Maj|M)$/, ''],
  [/^[øØ]7?/, 'm7b5'],
  [/^[°o]7$/, 'dim7'],
  [/^[°o]$/, 'dim'],
  [/^\+$/, 'aug'],
  [/sus$/, 'sus4'],
  [/add2$/, 'add9'],
  [/add4$/, 'add11'],
  [/^(m?)6(add)?9$/, '$16/9'],
];

function lookupQuality(text: string): ChordQuality | undefined {
  let quality = text;
  const direct = QUALITIES.get(quality);
  if (direct !== undefined) {
    return direct;
  }
  for (const [pattern, replacement] of ALIASES) {
    quality = quality.replace(pattern, replacement);
    const found = QUALITIES.get(quality);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

const NOTE = /^([A-Ga-g])([#b♯♭]?)/;

/** A note name at the start of the text: its pitch class and length. */
function readNote(text: string): { readonly pitchClass: number; readonly length: number } | undefined {
  const match = NOTE.exec(text);
  const letter = match?.[1]?.toUpperCase();
  const base = letterPitchClass(letter);
  if (match === null || base === undefined) {
    return undefined;
  }
  const accidental = match[2] ?? '';
  const shift = accidental === '#' || accidental === '♯' ? 1 : accidental === '' ? 0 : -1;
  return { pitchClass: pitchClass(base + shift), length: match[0].length };
}

/** The bass after the last slash, when what follows it is a note name (C/G); a slash in "6/9" stays in the quality. */
function splitBass(text: string): { readonly chord: string; readonly bass?: number } {
  const slash = text.lastIndexOf('/');
  const after = text.slice(slash + 1);
  const note = slash > 0 ? readNote(after) : undefined;
  return note !== undefined && note.length === after.length ? { chord: text.slice(0, slash), bass: note.pitchClass } : { chord: text };
}

/** The chord a symbol names (root, type, extension, altered degrees, bass); undefined when it is not a chord symbol. */
export function parseChordName(text: string): ChordSpec | undefined {
  const { chord, bass } = splitBass(text.trim());
  const root = readNote(chord);
  const quality = root === undefined ? undefined : lookupQuality(chord.slice(root.length));
  if (root === undefined || quality === undefined) {
    return undefined;
  }
  return { ...quality, root: root.pitchClass, bass: bass ?? root.pitchClass };
}
