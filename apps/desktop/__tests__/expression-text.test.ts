import { STANDARD_TUNING } from '@gp-editor/core';
import type {
  Command,
  CommandActions,
  CommandState,
} from '../src/lib/command-types';
import {
  expressionCommands,
  expressionQuery,
  isExpressionQuery,
} from '../src/lib/expression-commands';
import {
  type ExpressionContext,
  type ExpressionMatch,
  searchExpressions,
} from '../src/lib/expression-text';
import { setLanguage } from '../src/lib/i18n/i18n';
import type { AppCommand } from '../src/state/app-command';
import type { SongEdit } from '../src/state/song-edits';
import { beat, header, makeSong, note } from '../test-support/songs';
import { paletteContext } from '../src/components/palette/palette-tools';

const SONG = makeSong(
  [[beat(960, [note(1, 3)])]],
  [header(1, { directions: ['segno'] })],
);
const CURSOR = {
  trackIndex: 0,
  measureIndex: 0,
  beatIndex: 0,
  voiceIndex: 0,
  string: 1,
};
const CONTEXT: ExpressionContext = {
  palette: paletteContext(SONG, CURSOR),
  tuning: STANDARD_TUNING,
};

const search = (query: string): readonly ExpressionMatch[] =>
  searchExpressions(query, CONTEXT);
const titles = (query: string): readonly string[] =>
  search(query).map(match => match.title);
const first = (query: string): ExpressionMatch => {
  const match = search(query)[0];
  if (match === undefined) {
    throw new Error(`nothing matches ${query}`);
  }
  return match;
};

describe('searchExpressions: dynamics', () => {
  it('finds a dynamic by its mark and by its Italian name', () => {
    expect(first('ff')).toMatchObject({
      kind: 'dynamic',
      title: 'ff (fortissimo)',
      scope: 'note',
    });
    expect(first('ff').edit()).toEqual({ type: 'setDynamic', dynamic: 'ff' });
    expect(first('mezzo piano').edit()).toEqual({
      type: 'setDynamic',
      dynamic: 'mp',
    });
    expect(titles('fort')).toEqual([
      'f (forte)',
      'ff (fortissimo)',
      'fff (fortississimo)',
      'mf (mezzo forte)',
    ]);
  });
});

describe('searchExpressions: chords and key signatures', () => {
  it('puts “G maj” as the chord G first, then the key of G major', () => {
    // Act
    const [chord, key] = search('G maj');

    // Assert
    expect(chord).toMatchObject({ kind: 'chord', title: 'G', scope: 'beat' });
    const edit = chord!.edit();
    expect(edit).toMatchObject({
      type: 'setBeatChord',
      chord: { name: 'G', frets: [3, 0, 0, 0, 2, 3] },
    });
    expect(key).toMatchObject({
      kind: 'keySignature',
      title: 'G major (1♯)',
      scope: 'bar',
    });
    expect(key!.edit()).toEqual({ type: 'setKeySignature', keySignature: 1 });
  });

  it('reads minor keys, flats and sharps, and the number of accidentals', () => {
    expect(first('Cm').title).toBe('Cm');
    expect(search('Cm')[1]?.edit()).toEqual({
      type: 'setKeySignature',
      keySignature: -3,
    });
    expect(
      search('Eb minor').find(match => match.kind === 'keySignature')?.title,
    ).toBe('E♭ minor (6♭)');
    expect(
      search('F# major')
        .find(match => match.kind === 'keySignature')
        ?.edit(),
    ).toEqual({ type: 'setKeySignature', keySignature: 6 });
    expect(first('3 flats')).toMatchObject({
      kind: 'keySignature',
      title: 'E♭ major / C minor (3♭)',
    });
    expect(first('2#').edit()).toEqual({
      type: 'setKeySignature',
      keySignature: 2,
    });
    expect(first('no sharps').edit()).toEqual({
      type: 'setKeySignature',
      keySignature: 0,
    });
  });

  it('spells a chord with the flats it was typed with', () => {
    expect(first('Bbm7').title).toBe('B♭m7');
    expect(first('Bbm7').edit()).toMatchObject({ chord: { name: 'Bbm7' } });
  });

  it('reads major and minor in any case, and spells a chord’s bass with the flat it was typed with', () => {
    expect(search('G Major').find((match) => match.kind === 'keySignature')?.edit()).toEqual({ type: 'setKeySignature', keySignature: 1 });
    expect(search('E MINOR').find((match) => match.kind === 'keySignature')?.edit()).toEqual({ type: 'setKeySignature', keySignature: 1 });
    expect(search('CM').find((match) => match.kind === 'keySignature')?.edit()).toEqual({ type: 'setKeySignature', keySignature: 0 });
    expect(first('C/Bb')).toMatchObject({ title: 'C/B♭' });
    expect(first('C/Bb').edit()).toMatchObject({ chord: { name: 'C/Bb' } });
  });

  it('leaves out keys beyond seven accidentals', () => {
    expect(
      search('G# major').some(match => match.kind === 'keySignature'),
    ).toBe(false);
  });
});

describe('searchExpressions: octave signs, clefs and directions', () => {
  it('finds octave signs, and loco to take one off', () => {
    expect(first('8va')).toMatchObject({
      kind: 'octaveSign',
      title: '8va — an octave higher',
      scope: 'beat',
    });
    expect(first('8va').edit()).toEqual({ type: 'setOttava', ottava: '8va' });
    expect(titles('8')).toEqual([
      '8va — an octave higher',
      '8vb — an octave lower',
    ]);
    expect(first('15vb').edit()).toEqual({ type: 'setOttava', ottava: '15mb' });
    expect(first('loco').edit()).toEqual({ type: 'setOttava', ottava: 'none' });
  });

  it('finds clefs by name and by letter', () => {
    expect(first('bass clef')).toMatchObject({
      kind: 'clef',
      title: 'Bass clef (F)',
      scope: 'bar',
    });
    expect(first('bass clef').edit()).toEqual({
      type: 'setClef',
      clef: 'bass',
    });
    expect(first('c clef').edit()).toEqual({ type: 'setClef', clef: 'alto' });
    expect(titles('clef')).toEqual([
      'Treble clef (G)',
      'Bass clef (F)',
      'Alto clef (C)',
      'Tenor clef (C)',
    ]);
  });

  it('finds directions without dots or spaces, exact names first, and says when it takes one off', () => {
    expect(first('ds al coda')).toMatchObject({
      kind: 'direction',
      title: 'D.S. al Coda',
    });
    expect(first('ds al coda').edit()).toEqual({
      type: 'toggleDirection',
      direction: 'daSegnoAlCoda',
    });
    expect(titles('coda')[0]).toBe('Coda');
    expect(titles('coda')).toContain('Da Coda');
    expect(titles('to coda')[0]).toBe('Da Coda');
    expect(first('segno').title).toBe('Remove Segno');
  });
});

describe('searchExpressions: the list', () => {
  it('lists the dynamics, octave signs, clefs and directions when nothing is typed', () => {
    // Act
    const kinds = search('').map(match => match.kind);

    // Assert
    expect(new Set(kinds)).toEqual(
      new Set(['dynamic', 'octaveSign', 'clef', 'direction']),
    );
    expect(kinds.indexOf('dynamic')).toBeLessThan(kinds.indexOf('direction'));
  });

  it('finds nothing for words it does not know', () => {
    expect(search('banana')).toEqual([]);
  });
});

describe('expression commands', () => {
  const STATE: CommandState = {
    hasDocument: true,
    hasSelection: false,
    canUndo: false,
    canRedo: false,
    tabCount: 1,
    isPercussion: false,
    palette: CONTEXT.palette,
    tuning: STANDARD_TUNING,
  };

  function runOf(
    command: Command | undefined,
  ): readonly (AppCommand | unknown)[] {
    const ran: unknown[] = [];
    const actions = {
      runCommand: (run: unknown) => ran.push(run),
    } as unknown as CommandActions;
    command?.run(actions);
    return ran;
  }

  it('tells an Expression Text query by its “>”', () => {
    expect([
      isExpressionQuery('>ff'),
      isExpressionQuery(' > ff'),
      isExpressionQuery('ff'),
    ]).toEqual([true, true, false]);
    expect(expressionQuery('> G maj')).toBe('G maj');
  });

  it('turns each match into a command the palette runs as an edit at the cursor, grouped by kind', () => {
    // Act
    const [ff] = expressionCommands('ff', STATE);
    const ran = runOf(ff);

    // Assert
    expect(ff).toMatchObject({
      id: 'expression.dynamic.ff',
      title: 'ff (fortissimo)',
      group: 'Dynamic',
    });
    expect(ran).toEqual([
      {
        type: 'edit',
        edit: { type: 'setDynamic', dynamic: 'ff' } satisfies SongEdit,
      },
    ]);
  });

  it('needs a note for a dynamic, a pitched track for a chord, clef or octave sign, and a document for the rest', () => {
    // Arrange
    const restState: CommandState = {
      ...STATE,
      palette: { ...STATE.palette, note: undefined },
    };
    const drums: CommandState = { ...STATE, isPercussion: true };
    const enabled = (query: string, state: CommandState) =>
      expressionCommands(query, state)[0]?.isEnabled(state);

    // Act / Assert
    expect([enabled('ff', STATE), enabled('ff', restState)]).toEqual([
      true,
      false,
    ]);
    expect([
      enabled('G', drums),
      enabled('bass clef', drums),
      enabled('8va', drums),
    ]).toEqual([false, false, false]);
    expect([enabled('3 flats', drums), enabled('coda', drums)]).toEqual([
      true,
      true,
    ]);
    expect(enabled('coda', { ...STATE, hasDocument: false })).toBe(false);
  });
});

describe('Expression Text in Korean', () => {
  beforeEach(() => setLanguage('ko'));
  afterEach(() => setLanguage('en'));

  it('titles octave signs, clefs and keys in Korean and groups them by their Korean kind', () => {
    expect(first('8va').title).toBe('8va — 한 옥타브 위');
    expect(first('bass clef').title).toBe('낮은음자리표 (F)');
    expect(titles('E minor')).toContain('E 단조 (1♯)');
    const state: CommandState = { hasDocument: true, hasSelection: false, canUndo: false, canRedo: false, tabCount: 1, isPercussion: false, palette: CONTEXT.palette, tuning: STANDARD_TUNING };
    expect(expressionCommands('bass clef', state)[0]?.group).toBe('음자리표');
  });

  it('reads keys, clefs and chords typed with Korean words', () => {
    expect(first('E 단조')).toMatchObject({ kind: 'keySignature', title: 'E 단조 (1♯)' });
    expect(first('플랫 3개')).toMatchObject({ kind: 'keySignature', title: 'E♭ 장조 / C 단조 (3♭)' });
    expect(first('2 샵').title).toBe('D 장조 / B 단조 (2♯)');
    expect(first('조표 없음').title).toBe('C 장조 / A 단조 (조표 없음)');
    expect(first('높은음').title).toBe('높은음자리표 (G)');
    expect(first('A 마이너')).toMatchObject({ kind: 'chord', title: 'Am' });
  });

  it('still reads English names', () => {
    expect(first('treble').title).toBe('높은음자리표 (G)');
    expect(first('mezzo forte').title).toBe('mf (mezzo forte)');
  });
});
