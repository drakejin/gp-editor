import {
  type Beat,
  type Duration,
  QUARTER,
  type Song,
  type StringAddress,
} from '@gp-editor/core';
import {
  type EditorAction,
  type EditorState,
  INITIAL_EDITOR_STATE,
  editorReducer,
} from '../src/state/editor';
import { noNoteHint } from '../src/state/edit-hints';
import { t } from '../src/lib/i18n/i18n';
import { keyCommand } from '../src/lib/key-commands';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const BAR = 3840;
const WHOLE: Duration = { ...QUARTER, value: 1 };
const QUARTER_TICKS = 960;

/** Bar `index` of quarters on string 1, frets index×4 … index×4+3; bar 1's first beat a chord with string 6. */
function quarters(index: number): Beat[] {
  return [0, 1, 2, 3].map(i =>
    beat(
      960 + index * BAR + i * QUARTER_TICKS,
      index === 0 && i === 0
        ? [note(1, 0), note(6, 3)]
        : [note(1, index * 4 + i)],
    ),
  );
}

const bars = (count: number): Song =>
  makeSong(Array.from({ length: count }, (_, index) => quarters(index)));

function loaded(song: Song = bars(4)): EditorState {
  return editorReducer(INITIAL_EDITOR_STATE, {
    type: 'loaded',
    document: { fileName: 'a.gp5', path: '/a.gp5', song },
  });
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const at = (
  measureIndex: number,
  beatIndex: number,
  overrides: Partial<StringAddress> = {},
): StringAddress => ({
  trackIndex: 0,
  measureIndex,
  beatIndex,
  voiceIndex: 0,
  string: 1,
  ...overrides,
});
const place = (cursor: StringAddress): EditorAction => ({
  type: 'placeCursor',
  cursor,
});
/** A drag from `from` to `to`: the mouse goes down on one beat and is let go on the other. */
const drag = (from: StringAddress, to: StringAddress): EditorAction[] => [
  place(from),
  { type: 'selectTo', cursor: to },
];

/** What a key press runs on the score (D, ⌘D …): an edit at the cursor. */
function keyAction(key: string, metaKey = false): EditorAction {
  const command = keyCommand(
    { key, metaKey, shiftKey: false, altKey: false },
    { current: undefined },
    0,
  );
  if (command?.type !== 'edit') {
    throw new Error(`no edit for ${key}`);
  }
  return command;
}

const D = keyAction('d');
const CMD_D = keyAction('d', true);

/** Frets of a bar's beats in a voice, `r` for a rest. */
function frets(
  state: EditorState,
  measureIndex: number,
  trackIndex = 0,
  voiceIndex = 0,
): string[] {
  const beats =
    state.document?.song.tracks[trackIndex]?.measures[measureIndex]?.beats ??
    [];
  return beats.map(
    b => b.voices[voiceIndex]?.notes.map(n => String(n.fret)).join(',') || 'r',
  );
}

describe('D: the selected notes deleted, the beats staying as rests', () => {
  it('turns the notes dragged over in two bars into rests, in one undo step that brings them back', () => {
    // Arrange: a drag from bar 1's third beat to bar 2's second
    const state = reduce(loaded(), ...drag(at(0, 2), at(1, 1)));

    // Act
    const deleted = reduce(state, D);

    // Assert
    expect(frets(deleted, 0)).toEqual(['0,3', '1', 'r', 'r']);
    expect(frets(deleted, 1)).toEqual(['r', 'r', '6', '7']);
    expect(deleted.past).toHaveLength(state.past.length + 1);
    expect(deleted.selectionAnchor).toBeUndefined();
    expect(reduce(deleted, { type: 'undo' }).document?.song).toBe(
      state.document?.song,
    );
  });

  it('deletes a selection dragged backwards, or grown with ⇧→, the same way', () => {
    // Arrange
    const backwards = reduce(loaded(), ...drag(at(1, 1), at(0, 2)));
    const shifted = reduce(
      loaded(),
      place(at(0, 2)),
      ...Array.from(
        { length: 3 },
        (): EditorAction => ({ type: 'extendSelection', step: 1 }),
      ),
    );

    // Act / Assert
    expect([0, 1].map(bar => frets(reduce(backwards, D), bar))).toEqual([
      ['0,3', '1', 'r', 'r'],
      ['r', 'r', '6', '7'],
    ]);
    expect([0, 1].map(bar => frets(reduce(shifted, D), bar))).toEqual([
      ['0,3', '1', 'r', 'r'],
      ['r', 'r', '6', '7'],
    ]);
  });

  it('deletes only the note at the cursor without a selection, as the palette’s Delete does', () => {
    // Arrange: the cursor on the chord's string 6
    const state = reduce(loaded(), place(at(0, 0, { string: 6 })));

    // Act
    const deleted = reduce(state, D);

    // Assert
    expect(frets(deleted, 0)).toEqual(['0', '1', '2', '3']);
    expect(deleted.past).toHaveLength(state.past.length + 1);
  });

  it('sounds the note tied to the one D deleted at the cursor again (its tie undone), as over a selection', () => {
    // Arrange: bar 1 plays 1/2, then 1/2 tied to it
    const song = makeSong([[beat(960, [note(1, 2)]), beat(1920, [{ ...note(1, 2), isTied: true }]), beat(2880, [note(1, 3)]), beat(3840, [note(1, 5)])]]);
    const state = reduce(loaded(song), place(at(0, 0)));

    // Act
    const deleted = reduce(state, D);

    // Assert
    expect(frets(deleted, 0)).toEqual(['r', '2', '3', '5']);
    expect(deleted.document?.song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes[0]?.isTied).toBe(false);
  });

  it('says why nothing was deleted: no note on the cursor’s string, or no notes in the selected beats', () => {
    // Arrange
    const emptyString = reduce(loaded(), place(at(0, 1, { string: 3 })));
    const overRests = reduce(loaded(withRests()), ...drag(at(0, 1), at(0, 2)));

    // Act / Assert
    expect(reduce(emptyString, D).hint).toBe(noNoteHint(3));
    expect(reduce(emptyString, D).document?.song).toBe(
      emptyString.document?.song,
    );
    expect(reduce(overRests, D).hint).toBe(t('palette.hint.noSelectedNotes'));
    expect(reduce(overRests, D).document?.song).toBe(overRests.document?.song);
  });

  it('deletes in the cursor’s voice only: voice 2 plays on under the deleted voice 1, and the other way round', () => {
    // Arrange: bar 1 also holds a whole note in voice 2
    const song = withVoice2(bars(2));
    const voice1 = reduce(loaded(song), ...drag(at(0, 0), at(0, 3)));
    const voice2 = reduce(
      loaded(song),
      ...drag(
        at(0, 0, { voiceIndex: 1, string: 5 }),
        at(0, 3, { voiceIndex: 1, string: 5 }),
      ),
    );

    // Act
    const deleted1 = reduce(voice1, D);
    const deleted2 = reduce(voice2, D);

    // Assert
    expect([frets(deleted1, 0), frets(deleted1, 0, 0, 1)[0]]).toEqual([
      ['r', 'r', 'r', 'r'],
      '7',
    ]);
    expect([frets(deleted2, 0), frets(deleted2, 0, 0, 1)[0]]).toEqual([
      ['0,3', '1', '2', '3'],
      'r',
    ]);
  });

  it('deletes on the cursor’s track in the multitrack view, the other track as it was', () => {
    // Arrange: track 2 plays the same two bars; the drag is on its staff
    const song = withTrack(bars(2), [quarters(0), quarters(1)]);
    const state = reduce(
      loaded(song),
      { type: 'toggleMultitrack' },
      ...drag(at(0, 3, { trackIndex: 1 }), at(1, 0, { trackIndex: 1 })),
    );

    // Act
    const deleted = reduce(state, D);

    // Assert
    expect([frets(deleted, 0, 1), frets(deleted, 1, 1)]).toEqual([
      ['0,3', '1', '2', 'r'],
      ['r', '5', '6', '7'],
    ]);
    expect(deleted.document?.song.tracks[0]).toBe(song.tracks[0]);
  });

  it('passes over a bar without beats (the track rests there) inside the selection', () => {
    // Arrange: bar 2 holds no beats
    const song = makeSong([quarters(0), [], quarters(2)]);
    const state = reduce(loaded(song), ...drag(at(0, 3), at(2, 0)));

    // Act
    const deleted = reduce(state, D);

    // Assert
    expect([frets(deleted, 0), frets(deleted, 1), frets(deleted, 2)]).toEqual([
      ['0,3', '1', '2', 'r'],
      [],
      ['r', '9', '10', '11'],
    ]);
  });
});

describe('⌘D: the selected bars deleted, or the cursor’s bar, as − Bar does', () => {
  it('runs the same edit as the palette’s − Bar', () => {
    expect(CMD_D).toEqual({ type: 'edit', edit: { type: 'deleteMeasure' } });
  });

  it('deletes the three bars a selection spans in one undo step that brings them back', () => {
    // Arrange: five bars, the selection from bar 2 to bar 4
    const state = reduce(loaded(bars(5)), ...drag(at(1, 2), at(3, 1)));

    // Act
    const deleted = reduce(state, CMD_D);

    // Assert
    expect(deleted.document?.song.measureHeaders).toHaveLength(2);
    expect([frets(deleted, 0), frets(deleted, 1)]).toEqual([
      ['0,3', '1', '2', '3'],
      ['16', '17', '18', '19'],
    ]);
    expect(deleted.past).toHaveLength(state.past.length + 1);
    expect(reduce(deleted, { type: 'undo' }).document?.song).toBe(
      state.document?.song,
    );
  });

  it('deletes the bar clicked when nothing is selected, the cursor on the bar that took its place', () => {
    // Arrange
    const state = reduce(loaded(), place(at(2, 1)));

    // Act
    const deleted = reduce(state, CMD_D);

    // Assert
    expect(deleted.document?.song.measureHeaders).toHaveLength(3);
    expect(frets(deleted, 2)).toEqual(['12', '13', '14', '15']);
    expect(deleted.cursor?.measureIndex).toBe(2);
  });

  it('keeps the song’s only bar, saying why', () => {
    // Arrange
    const state = loaded(bars(1));

    // Act
    const refused = reduce(state, CMD_D);

    // Assert
    expect(refused.document?.song).toBe(state.document?.song);
    expect(refused.hint).toBe(t('palette.hint.lastBar'));
  });
});

/** Bar 1 a quarter on string 1, then two quarter rests and a quarter on string 1. */
function withRests(): Song {
  const rest = (start: number): Beat => beat(start, []);
  return makeSong([
    [beat(960, [note(1, 0)]), rest(1920), rest(2880), beat(3840, [note(1, 3)])],
  ]);
}

/** The song with a whole note on string 5 (fret 7) in voice 2 of bar 1, under its first beat. */
function withVoice2(song: Song): Song {
  const [track] = song.tracks;
  const [first, ...others] = track?.measures ?? [];
  if (track === undefined || first === undefined) {
    return song;
  }
  const beats = first.beats.map((b, beatIndex) => ({
    ...b,
    voices: [
      ...b.voices,
      beatIndex === 0
        ? {
            duration: WHOLE,
            notes: [note(5, 7)],
            isEmpty: false,
            direction: 'none' as const,
          }
        : {
            duration: QUARTER,
            notes: [],
            isEmpty: true,
            direction: 'none' as const,
          },
    ],
  }));
  return {
    ...song,
    tracks: [{ ...track, measures: [{ ...first, beats }, ...others] }],
  };
}
