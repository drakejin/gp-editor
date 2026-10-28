import {
  type Clef,
  DYNAMICS,
  type DynamicName,
  MUSICAL_DIRECTIONS,
  type MusicalDirection,
  type Ottava,
} from '@gp-editor/core';
import { directionName } from '../components/palette/palette-marks';
import type {
  PaletteContext,
  ToolScope,
} from '../components/palette/palette-tools';
import type { SongEdit } from '../state/song-edits';
import { chordExpression, keyExpression } from './expression-keys';
import { t } from './i18n/i18n';
import { DIRECTION_TEXTS } from '../score/directions';

/**
 * Guitar Pro 8's Expression Text (Tools ▸ Expression Text, or “>” in the command palette): the name of a chord, a
 * dynamic, a key signature, an octave sign, a clef or a direction, typed without a command's prefix, becomes the edit
 * that puts it on the score at the cursor.
 */

/** What an expression puts on the score, in the order Guitar Pro 8's guide lists them. */
export type ExpressionKind =
  | 'chord'
  | 'dynamic'
  | 'keySignature'
  | 'octaveSign'
  | 'clef'
  | 'direction';

const KIND_ORDER: readonly ExpressionKind[] = [
  'chord',
  'dynamic',
  'keySignature',
  'octaveSign',
  'clef',
  'direction',
];

/** What a kind of expression is called, in the shown language (the palette's group column). */
export function expressionKindName(kind: ExpressionKind): string {
  return t(`commands.expression.kind.${kind}`);
}

/** One thing the typed text can name, and the edit at the cursor that puts it on the score. */
export interface ExpressionMatch {
  readonly id: string;
  readonly kind: ExpressionKind;
  readonly title: string;
  /** What it needs at the cursor: a note (a dynamic), a beat or a bar. */
  readonly scope: ToolScope;
  /** Made when it runs (a chord's diagram is worked out then). */
  readonly edit: () => SongEdit;
}

/** What the matches read: the cursor's note, beat and bar, and the open strings of its track (string 1 first). */
export interface ExpressionContext {
  readonly palette: PaletteContext;
  readonly tuning: readonly number[];
}

/** How well the text names a match: 0 its name, 1 the start of a name, 2 a part of one. */
export type MatchScore = 0 | 1 | 2;

export interface ScoredExpression {
  readonly match: ExpressionMatch;
  readonly score: MatchScore;
}

/** Lower case, without dots or spaces: “D.S. al Coda” and “ds al coda” are both “dsalcoda”. */
export function compactText(text: string): string {
  return text.toLowerCase().replace(/[.\s]+/g, '');
}

/** The best way `query` names one of `names`; undefined when it names none. */
export function nameScore(
  query: string,
  names: readonly string[],
): MatchScore | undefined {
  const typed = compactText(query);
  const scores = names.map(compactText).map((name): MatchScore | undefined => {
    if (name === typed) {
      return 0;
    }
    if (name.startsWith(typed)) {
      return 1;
    }
    return name.includes(typed) ? 2 : undefined;
  });
  return scores.reduce<MatchScore | undefined>(
    (best, score) =>
      score === undefined || (best !== undefined && best <= score)
        ? best
        : score,
    undefined,
  );
}

/** The dynamics' Italian names, as notation writes them in every language. */
const ITALIAN: Readonly<Record<DynamicName, string>> = {
  ppp: 'pianississimo',
  pp: 'pianissimo',
  p: 'piano',
  mp: 'mezzo piano', // i18n-exempt: Italian, as notation writes it
  mf: 'mezzo forte', // i18n-exempt: Italian, as notation writes it
  f: 'forte',
  ff: 'fortissimo',
  fff: 'fortississimo',
};

interface Entry {
  readonly match: ExpressionMatch;
  readonly names: readonly string[];
}

function dynamicEntries(): readonly Entry[] {
  return DYNAMICS.map(({ name }) => ({
    names: [name, ITALIAN[name]],
    match: {
      id: `dynamic.${name}`,
      kind: 'dynamic',
      title: `${name} (${ITALIAN[name]})`,
      scope: 'note',
      edit: () => ({ type: 'setDynamic', dynamic: name }),
    },
  }));
}

/** The names an octave sign is typed by — Italian and English in every language; its title (shown language) too. */
const OCTAVE_SIGNS: readonly (readonly [Ottava | 'none', readonly string[]])[] = [
  ['8va', ['8va', '8va alta', 'ottava', 'ottava alta']], // i18n-exempt: names typed, as notation writes them
  ['8vb', ['8vb', '8va bassa', 'ottava bassa']], // i18n-exempt: names typed, as notation writes them
  ['15ma', ['15ma', '15va', 'quindicesima', 'quindicesima alta']], // i18n-exempt: names typed, as notation writes them
  ['15mb', ['15mb', '15vb', 'quindicesima bassa']], // i18n-exempt: names typed, as notation writes them
  ['none', ['loco', 'no octave sign']], // i18n-exempt: names typed, English in every language
];

function octaveEntries(): readonly Entry[] {
  return OCTAVE_SIGNS.map(([ottava, names]) => {
    const title = t(`commands.expression.ottava.${ottava}`);
    return {
      names: [...names, title],
      match: { id: `octaveSign.${ottava}`, kind: 'octaveSign', title, scope: 'beat', edit: () => ({ type: 'setOttava', ottava }) },
    };
  });
}

/** The names a clef is typed by — English in every language; its title (shown language) too. */
const CLEFS: readonly (readonly [Exclude<Clef, 'neutral'>, readonly string[]])[] = [
  ['treble', ['treble', 'treble clef', 'g clef', 'violin clef']], // i18n-exempt: names typed, English in every language
  ['bass', ['bass', 'bass clef', 'f clef']], // i18n-exempt: names typed, English in every language
  ['alto', ['alto', 'alto clef', 'c clef', 'viola clef']], // i18n-exempt: names typed, English in every language
  ['tenor', ['tenor', 'tenor clef']], // i18n-exempt: names typed, English in every language
];

function clefEntries(): readonly Entry[] {
  return CLEFS.map(([clef, names]) => {
    const title = t(`commands.expression.clef.${clef}`);
    return {
      names: [...names, title],
      match: { id: `clef.${clef}`, kind: 'clef', title, scope: 'bar', edit: () => ({ type: 'setClef', clef }) },
    };
  });
}

/** Other names a direction goes by: the words Guitar Pro writes for it, and the Italian. */
const DIRECTION_ALIASES: Readonly<
  Partial<Record<MusicalDirection, readonly string[]>>
> = {
  daCapo: ['da capo'], // i18n-exempt: names typed, as notation writes them
  daSegno: ['dal segno'], // i18n-exempt: names typed, as notation writes them
  daSegnoSegno: ['dal segno segno'], // i18n-exempt: names typed, as notation writes them
  daCoda: ['to coda'], // i18n-exempt: names typed, as notation writes them
  daDoubleCoda: ['to double coda'], // i18n-exempt: names typed, as notation writes them
};

function directionEntries(context: ExpressionContext): readonly Entry[] {
  const directions = context.palette.header?.directions ?? [];
  return MUSICAL_DIRECTIONS.map(direction => {
    const [label] = directionName(direction);
    const words =
      direction in DIRECTION_TEXTS
        ? [DIRECTION_TEXTS[direction as keyof typeof DIRECTION_TEXTS]]
        : [];
    const title = directions.includes(direction) ? t('commands.expression.removeDirection', { direction: label }) : label;
    return {
      names: [label, ...words, ...(DIRECTION_ALIASES[direction] ?? [])],
      match: {
        id: `direction.${direction}`,
        kind: 'direction',
        title,
        scope: 'bar',
        edit: () => ({ type: 'toggleDirection', direction }),
      },
    };
  });
}

/** What can be listed by name (chords and key signatures are read from the text instead). */
function namedEntries(context: ExpressionContext): readonly Entry[] {
  return [
    ...dynamicEntries(),
    ...octaveEntries(),
    ...clefEntries(),
    ...directionEntries(context),
  ];
}

function kindRank(scored: ScoredExpression): number {
  return KIND_ORDER.indexOf(scored.match.kind);
}

/**
 * Everything the text can name, best first: its name before the start of a name before a part of one, then by kind in
 * Guitar Pro's order (chords, dynamics, key signatures, octave signs, clefs, directions). With nothing typed, the
 * dynamics, octave signs, clefs and directions to choose from.
 */
export function searchExpressions(
  query: string,
  context: ExpressionContext,
): readonly ExpressionMatch[] {
  const named = namedEntries(context);
  if (query.trim() === '') {
    return named.map(entry => entry.match);
  }
  const parsed: ScoredExpression[] = [
    chordExpression(query, context.tuning),
    ...keyExpression(query),
  ].flatMap(match => (match === undefined ? [] : [{ match, score: 0 }]));
  const found = named.flatMap((entry): ScoredExpression[] => {
    const score = nameScore(query, entry.names);
    return score === undefined ? [] : [{ match: entry.match, score }];
  });
  return [...parsed, ...found]
    .map((scored, order) => ({ scored, order }))
    .sort(
      (a, b) =>
        a.scored.score - b.scored.score ||
        kindRank(a.scored) - kindRank(b.scored) ||
        a.order - b.order,
    )
    .map(({ scored }) => scored.match);
}
