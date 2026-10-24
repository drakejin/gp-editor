import {
  type ChordSpec,
  type KeyMode,
  type NoteSpelling,
  buildChordVoicings,
  chordName,
  keySignatureOf,
  keyTonic,
  parseChordName,
} from '@gp-editor/core';
import type { ExpressionMatch } from './expression-text';

/** Expression Text's chords and key signatures: read from what was typed ("G maj", "Cm7", "E♭ minor", "3 flats"). */

const LETTERS = 'CDEFGAB';
const MAX_ACCIDENTALS = 7;
const SHARP = '♯';
const FLAT = '♭';

/** A note's letter and accidental as the score writes them: "E♭", "F♯". */
function tonicName(letter: number, alter: number): string {
  return `${LETTERS[letter] ?? ''}${alter > 0 ? SHARP : alter < 0 ? FLAT : ''}`;
}

/** A chord symbol with its notes' accidentals as signs ("Bbm7" → "B♭m7"; "C7#9" keeps its "#9"). */
function chordTitle(name: string): string {
  return name
    .replace(/([A-G])b/g, `$1${FLAT}`)
    .replace(/([A-G])#/g, `$1${SHARP}`);
}

/** The chord a typed symbol names: spaces left out, “major” / “minor” as maj / m ("G maj", "E minor 7"). */
function typedChord(
  query: string,
): { readonly spec: ChordSpec; readonly spelling: NoteSpelling } | undefined {
  const symbol = query
    .replace(/\s+/g, '')
    .replace(/minor/gi, 'm')
    .replace(/major/gi, 'maj');
  const spec = parseChordName(symbol);
  return spec === undefined
    ? undefined
    : { spec, spelling: /^[A-Ga-g](b|♭)|\/[A-Ga-g](b|♭)$/.test(symbol) ? 'flat' : 'sharp' };
}

/** The chord a typed symbol names, its diagram the first voicing on the track's strings (none fits: its name only). */
export function chordExpression(
  query: string,
  tuning: readonly number[],
): ExpressionMatch | undefined {
  const typed = typedChord(query);
  if (typed === undefined) {
    return undefined;
  }
  const name = chordName(typed.spec, typed.spelling);
  const edit = () => {
    const voicing = buildChordVoicings(typed.spec, tuning, {
      spelling: typed.spelling,
    })[0];
    const frets = voicing?.frets ?? tuning.map(() => -1);
    return {
      type: 'setBeatChord' as const,
      chord: { name, firstFret: voicing?.firstFret ?? 1, frets },
    };
  };
  return {
    id: `chord.${name}`,
    kind: 'chord',
    title: chordTitle(name),
    scope: 'beat',
    edit,
  };
}

const MODES: Readonly<Record<string, KeyMode>> = {
  '': 'major',
  major: 'major',
  maj: 'major',
  minor: 'minor',
  min: 'minor',
};

/** A key's mode as typed: "major" / "minor" in any case, "M" / "m" by their case (CM, Cm). */
function modeOf(word: string): KeyMode | undefined {
  if (word === 'M' || word === 'm') {
    return word === 'M' ? 'major' : 'minor';
  }
  return MODES[word.toLowerCase()];
}
const ACCIDENTAL_SHIFTS: Readonly<Record<string, number>> = {
  '': 0,
  '#': 1,
  [SHARP]: 1,
  sharp: 1,
  b: -1,
  [FLAT]: -1,
  flat: -1,
};

/** "(3♭)", "(1♯)", "(no sharps or flats)". */
function accidentalsText(keySignature: number): string {
  return keySignature === 0
    ? '(no sharps or flats)'
    : `(${Math.abs(keySignature)}${keySignature > 0 ? SHARP : FLAT})`;
}

function keyMatch(keySignature: number, title: string): ExpressionMatch {
  return {
    id: `keySignature.${keySignature}.${title}`,
    kind: 'keySignature',
    title,
    scope: 'bar',
    edit: () => ({ type: 'setKeySignature', keySignature }),
  };
}

/** A key typed by its tonic and mode: "G", "G major", "Eb minor", "key of F#m". */
function keyByTonic(text: string): ExpressionMatch | undefined {
  const match =
    /^([A-Ga-g])\s*(#|♯|b|♭|-?sharp|-?flat)?\s*(major|maj|minor|min|m)?$/i.exec(
      text,
    );
  const letter = LETTERS.indexOf((match?.[1] ?? '').toUpperCase());
  const alter = ACCIDENTAL_SHIFTS[(match?.[2] ?? '').replace('-', '').toLowerCase()];
  const mode = modeOf(match?.[3] ?? '');
  const keySignature =
    match === null || letter < 0 || alter === undefined || mode === undefined
      ? undefined
      : keySignatureOf(letter, alter, mode);
  return keySignature === undefined
    ? undefined
    : keyMatch(
        keySignature,
        `${tonicName(letter, alter ?? 0)} ${mode} ${accidentalsText(
          keySignature,
        )}`,
      );
}

/** A key typed by its accidentals: "3 flats", "2#", "no sharps". */
function keyByAccidentals(text: string): ExpressionMatch | undefined {
  const none = /^no\s*(sharps|flats|accidentals)$/i.test(text);
  const match = /^(\d)\s*(#|♯|sharps?|b|♭|flats?)$/i.exec(text);
  const count = none ? 0 : Number(match?.[1] ?? Number.NaN);
  if (!(count >= 0 && count <= MAX_ACCIDENTALS)) {
    return undefined;
  }
  const keySignature = /^(#|♯|sharp)/i.test(match?.[2] ?? '#') ? count : -count;
  const [major, minor] = (['major', 'minor'] as const).map(mode => {
    const tonic = keyTonic(keySignature, mode);
    return `${tonicName(tonic.letter, tonic.alter)} ${mode}`;
  });
  return keyMatch(
    keySignature,
    `${major} / ${minor} ${accidentalsText(keySignature)}`,
  );
}

/** The key signature the text names, by tonic or by accidentals ("key" and "key of" may go with it). */
export function keyExpression(query: string): readonly ExpressionMatch[] {
  const text = query
    .trim()
    .replace(/^key\s+(of\s+)?/i, '')
    .replace(/\s+key$/i, '');
  return [keyByTonic(text), keyByAccidentals(text)].flatMap(match =>
    match === undefined ? [] : [match],
  );
}
