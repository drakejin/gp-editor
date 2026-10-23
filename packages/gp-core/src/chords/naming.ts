// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordNamingConvention (LGPL-2.1), writing the chord symbols
// guitarists read (C9, Cm7b5, C/G) where TuxGuitar writes its own (C7/9, Cm7/5-, C \G).
import type { ChordTypeName } from './database';
import { type ChordSpec, type DegreeShift, normalizeChordSpec, pitchClass } from './spec';

/** Black keys named as sharps (C#) or flats (Db); TuxGuitar picks by the key signature. */
export type NoteSpelling = 'sharp' | 'flat';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** TuxGuitar's getTonic: the name of a pitch class. */
export function noteName(value: number, spelling: NoteSpelling = 'sharp'): string {
  return (spelling === 'flat' ? FLAT_NAMES : SHARP_NAMES)[pitchClass(value)] ?? 'C';
}

const TYPE_LABELS: Readonly<Record<ChordTypeName, string>> = {
  M: '',
  '7': '7',
  maj7: 'maj7',
  '6': '6',
  m: 'm',
  m7: 'm7',
  'm/maj7': 'm(maj7)',
  m6: 'm6',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus2': '7sus2',
  '7sus4': '7sus4',
  dim: 'dim',
  dim7: 'dim7',
  aug: 'aug',
  '5': '5',
};

const SIGNS: Readonly<Record<DegreeShift, string>> = { natural: '', sharp: '#', flat: 'b' };

/** A stacked extension in place of the seventh: C9, Cmaj9, Cm11, Cm(maj9), C13sus4. */
function stackedLabel(type: ChordTypeName, extension: string): string {
  switch (type) {
    case 'M':
    case '7':
      return extension;
    case 'maj7':
      return `maj${extension}`;
    case 'm':
    case 'm7':
      return `m${extension}`;
    case 'm/maj7':
      return `m(maj${extension})`;
    case 'sus2':
    case '7sus2':
      return `${extension}sus2`;
    case 'sus4':
    case '7sus4':
      return `${extension}sus4`;
    default:
      return `${TYPE_LABELS[type]}${extension}`;
  }
}

/** The type with the seventh a raised or lowered extension goes with (C7#9, Cm7b9). */
function seventhLabel(type: ChordTypeName): string {
  const withSeventh: Partial<Record<ChordTypeName, string>> = { M: '7', m: 'm7', sus2: '7sus2', sus4: '7sus4' };
  return withSeventh[type] ?? TYPE_LABELS[type];
}

/** The type and its extension: "m7", "add9", "6/9", "9", "7#9", "13b9". */
function extensionLabel(spec: ChordSpec): string {
  const { type, extension, extensionShift, isAdd } = spec;
  const label = TYPE_LABELS[type];
  if (extension === 'none') {
    return label;
  }
  const sign = SIGNS[extensionShift];
  if (isAdd) {
    return extension === '9' && sign === '' && (type === '6' || type === 'm6') ? `${label}/9` : `${label}add${sign}${extension}`;
  }
  const stacked = sign === '' ? stackedLabel(type, extension) : `${seventhLabel(type)}${sign}${extension}`;
  const ninth = spec.ninth === 'natural' ? '' : `${SIGNS[spec.ninth]}9`;
  const eleventh = spec.eleventh === 'natural' ? '' : `${SIGNS[spec.eleventh]}11`;
  return `${stacked}${ninth}${eleventh}`;
}

/** The chord symbol without its root and bass: what parseChordName looks up. */
export function chordQuality(spec: ChordSpec): string {
  const label = extensionLabel(spec);
  if (spec.fifth === 'natural') {
    return label;
  }
  const fifth = `${SIGNS[spec.fifth]}5`;
  // C(b5), C5(b5): written plainly they would read as the root C#, or a power chord on C.
  return label === '' || label === '5' ? `${label}(${fifth})` : `${label}${fifth}`;
}

/** TuxGuitar's createChordName: root, type, extension, altered degrees and a slash bass. */
export function chordName(spec: ChordSpec, spelling: NoteSpelling = 'sharp'): string {
  const normalized = normalizeChordSpec(spec);
  const bass = normalized.bass === normalized.root ? '' : `/${noteName(normalized.bass, spelling)}`;
  return `${noteName(normalized.root, spelling)}${chordQuality(normalized)}${bass}`;
}
