import { DEFAULT_MASTER, QUARTER, buildEffect, findNote } from '@gp-editor/core';
import { type EditorAction, type EditorState, HISTORY_LIMIT, INITIAL_EDITOR_STATE, editorReducer, isEdited } from '../src/state/editor';
import { beat, makeSong, note, toTux } from '../test-support/songs';

/** Bar 1: beat 0 = strings 1 (fret 3) and 2 (fret 5); bar 2: beat 0 = string 6 (fret 0). */
function loadedState(): EditorState {
  const song = makeSong([[beat(960, [note(1, 3), note(2, 5)])], [beat(4800, [note(6, 0)])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const at = (state: EditorState) => state.cursor!;
const song = (state: EditorState) => state.document!.song;

describe('editorReducer: loading and modes', () => {
  it('tracks loading, cancel and failure', () => {
    const loading = editorReducer(INITIAL_EDITOR_STATE, { type: 'loadStarted' });
    expect(loading.isLoading).toBe(true);
    expect(editorReducer(loading, { type: 'loadCancelled' }).isLoading).toBe(false);
    const failed = editorReducer(loading, { type: 'loadFailed', message: 'bad header' });
    expect(failed).toMatchObject({ isLoading: false, error: 'Could not open the file: bad header' });
    expect(editorReducer(failed, { type: 'dismissError' }).error).toBeUndefined();
  });

  it('shows a failed PDF export in the error banner, keeping the document', () => {
    // Arrange
    const loaded = loadedState();

    // Act
    const failed = editorReducer(loaded, { type: 'exportFailed', message: 'disk full' });

    // Assert
    expect(failed.error).toBe('Could not export the PDF: disk full');
    expect(failed.document).toBe(loaded.document);
  });

  it('names what could not be exported when it is not the PDF', () => {
    const failed = editorReducer(loadedState(), { type: 'exportFailed', what: 'the PNG images', message: 'disk full' });
    expect(failed.error).toBe('Could not export the PNG images: disk full');
  });

  it('starts a fresh history with the cursor on the first beat, keeping the score mode', () => {
    const tabMode = editorReducer(INITIAL_EDITOR_STATE, { type: 'setMode', mode: 'tab' });
    const state = editorReducer(tabMode, { type: 'loaded', document: loadedState().document! });
    expect(state).toMatchObject({ past: [], future: [], trackIndex: 0, mode: 'tab' });
    expect(state.cursor).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
  });

  it('creates a blank sheet in the chosen view, unsaved and not yet edited', () => {
    // Arrange
    const opened = editorReducer(loadedState(), { type: 'setNoteFret', fret: 7 });

    // Act
    const state = editorReducer(opened, { type: 'created', mode: 'notation' });

    // Assert
    expect(state).toMatchObject({ mode: 'notation', past: [], future: [], trackIndex: 0, document: { fileName: 'Untitled', path: '' } });
    expect(state.document!.song.tracks).toHaveLength(1);
    expect(state.cursor).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
    expect(isEdited(state)).toBe(false);
  });

  it('shows or hides the score’s chord names and diagrams without editing the song, and a new score shows both', () => {
    // Arrange
    const loaded = loadedState();

    // Act
    const namesOnly = editorReducer(loaded, { type: 'setChordDisplay', display: { showsNames: true, showsDiagrams: false } });
    const reopened = editorReducer(namesOnly, { type: 'loaded', document: loaded.document! });

    // Assert
    expect(loaded.chordDisplay).toEqual({ showsNames: true, showsDiagrams: true });
    expect(namesOnly.chordDisplay).toEqual({ showsNames: true, showsDiagrams: false });
    expect(namesOnly.document).toBe(loaded.document);
    expect(namesOnly.past).toBe(loaded.past);
    expect(reopened.chordDisplay).toEqual({ showsNames: true, showsDiagrams: true });
  });
});

describe('editorReducer: cursor', () => {
  it('moves between strings with ↑/↓, also onto empty strings, and stops at the edges', () => {
    // Arrange
    const start = loadedState();

    // Act
    const down = editorReducer(editorReducer(start, { type: 'moveCursorString', delta: 1 }), { type: 'moveCursorString', delta: 1 });
    const up = editorReducer(start, { type: 'moveCursorString', delta: -1 });

    // Assert
    expect(at(down).string).toBe(3);
    expect(findNote(song(down), at(down))).toBeUndefined();
    expect(at(up).string).toBe(1);
  });

  it('moves between beats with ←/→ across bar lines and stays at the ends', () => {
    const next = editorReducer(loadedState(), { type: 'moveCursorBeat', step: 1 });
    expect(at(next)).toMatchObject({ measureIndex: 1, beatIndex: 0, string: 1 });
    expect(editorReducer(next, { type: 'moveCursorBeat', step: 1 }).cursor).toEqual(at(next));
    expect(at(editorReducer(next, { type: 'moveCursorBeat', step: -1 }))).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('places the cursor where the score was clicked', () => {
    const cursor = { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 6 };
    expect(editorReducer(loadedState(), { type: 'placeCursor', cursor }).cursor).toEqual(cursor);
  });
});

describe('editorReducer: edits at the cursor', () => {
  it('types a fret on an empty string, adding a note', () => {
    const onString3 = editorReducer(loadedState(), { type: 'placeCursor', cursor: { ...at(loadedState()), string: 3 } });
    const typed = editorReducer(onString3, { type: 'setNoteFret', fret: 7 });
    expect(findNote(song(typed), at(typed))?.fret).toBe(7);
    expect(typed.past).toHaveLength(1);
  });

  it('shifts and deletes the note at the cursor; shifting an empty position does nothing', () => {
    const bumped = editorReducer(loadedState(), { type: 'shiftNoteFret', delta: 1 });
    expect(findNote(song(bumped), at(bumped))?.fret).toBe(4);
    const empty = editorReducer(loadedState(), { type: 'moveCursorString', delta: 3 });
    expect(editorReducer(empty, { type: 'shiftNoteFret', delta: 1 })).toBe(empty);
    const removed = editorReducer(bumped, { type: 'deleteNote' });
    expect(findNote(song(removed), at(removed))).toBeUndefined();
  });

  it('moves the note with ⌥↑/↓ and the cursor follows; a taken string is refused', () => {
    const start = editorReducer(loadedState(), { type: 'moveCursorString', delta: 1 });
    expect(editorReducer(start, { type: 'shiftNoteString', delta: -1 })).toBe(start);
    const moved = editorReducer(start, { type: 'shiftNoteString', delta: 1 });
    expect(at(moved).string).toBe(3);
    expect(findNote(song(moved), at(moved))?.fret).toBe(5);
  });

  it('undoes and redoes, keeping the cursor', () => {
    const edited = editorReducer(loadedState(), { type: 'setNoteFret', fret: 9 });
    const undone = editorReducer(edited, { type: 'undo' });
    expect(findNote(song(undone), at(undone))?.fret).toBe(3);
    expect(undone.cursor).toEqual(edited.cursor);
    const redone = editorReducer(undone, { type: 'redo' });
    expect(findNote(song(redone), at(redone))?.fret).toBe(9);
    expect(editorReducer(redone, { type: 'redo' })).toBe(redone);
    expect(editorReducer(loadedState(), { type: 'undo' }).past).toEqual([]);
  });

  it('caps the undo history', () => {
    let state = loadedState();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      state = editorReducer(state, { type: 'setNoteFret', fret: i % 2 === 0 ? 1 : 2 });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('switches tracks only to existing ones and keeps the place in the song', () => {
    const moved = editorReducer(loadedState(), { type: 'moveCursorBeat', step: 1 });
    expect(editorReducer(moved, { type: 'selectTrack', trackIndex: 3 })).toBe(moved);
    expect(editorReducer(moved, { type: 'selectTrack', trackIndex: 0 }).cursor).toMatchObject({ measureIndex: 1 });
  });
});

const DROP_D = [64, 59, 55, 50, 45, 38];
const STANDARD_BASS = [43, 38, 33, 28];
/** Standard an octave up: the low E2 of bar 2 is out of reach. */
const OCTAVE_UP = [76, 71, 67, 62, 57, 52];

describe('editorReducer: track tuning', () => {
  it('retunes the track as one undoable edit, re-fretting notes so they sound the same', () => {
    // Arrange
    const start = loadedState();

    // Act
    const dropD = editorReducer(start, { type: 'setTrackTuning', trackIndex: 0, tuning: DROP_D });

    // Assert: the open low E of bar 2 is now fret 2 of the D string.
    expect(song(dropD).tracks[0]!.strings.map((s) => s.tuning)).toEqual(DROP_D);
    expect(findNote(song(dropD), { ...at(dropD), measureIndex: 1, string: 6 })?.fret).toBe(2);
    expect(dropD.past).toEqual([song(start)]);
    expect(dropD.notice).toBeUndefined();
    expect(isEdited(dropD)).toBe(true);
    expect(song(editorReducer(dropD, { type: 'undo' }))).toBe(song(start));
  });

  it('keeps the cursor on the strings of a track that has fewer of them', () => {
    // Arrange
    const cursor = { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 6 };
    const onString6 = editorReducer(loadedState(), { type: 'placeCursor', cursor });

    // Act
    const bass = editorReducer(onString6, { type: 'setTrackTuning', trackIndex: 0, tuning: STANDARD_BASS });

    // Assert
    expect(song(bass).tracks[0]!.strings).toHaveLength(4);
    expect(at(bass)).toEqual({ ...cursor, string: 4 });
  });

  it('tells when notes moved by an octave; the notice is dismissed by hand or by undo', () => {
    // Act
    const retuned = editorReducer(loadedState(), { type: 'setTrackTuning', trackIndex: 0, tuning: OCTAVE_UP });

    // Assert
    expect(retuned.notice).toContain('1 note moved by an octave');
    expect(editorReducer(retuned, { type: 'dismissNotice' }).notice).toBeUndefined();
    expect(editorReducer(retuned, { type: 'undo' }).notice).toBeUndefined();
  });

  it('ignores a tuning that changes nothing, or a track that does not exist', () => {
    const start = loadedState();
    expect(editorReducer(start, { type: 'setTrackTuning', trackIndex: 0, tuning: [64, 59, 55, 50, 45, 40] })).toBe(start);
    expect(editorReducer(start, { type: 'setTrackTuning', trackIndex: 5, tuning: DROP_D })).toBe(start);
    expect(editorReducer(INITIAL_EDITOR_STATE, { type: 'setTrackTuning', trackIndex: 0, tuning: DROP_D })).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('editorReducer: track instrument', () => {
  const CHANNEL = { id: 1, name: 'Guitar', program: 25, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };

  function withChannel(): EditorState {
    const withGuitar = { ...makeSong([[beat(960, [note(1, 3)])]]), channels: [CHANNEL] };
    return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: withGuitar } });
  }

  it('sets the program of a track as one undo step', () => {
    // Act
    const changed = editorReducer(withChannel(), { type: 'setTrackProgram', trackIndex: 0, program: 30 });

    // Assert
    expect(song(changed).channels[0]?.program).toBe(30);
    expect(changed.past).toHaveLength(1);
    expect(song(editorReducer(changed, { type: 'undo' })).channels[0]?.program).toBe(25);
  });

  it('ignores the current program and a missing track', () => {
    const start = withChannel();
    expect(editorReducer(start, { type: 'setTrackProgram', trackIndex: 0, program: 25 })).toBe(start);
    expect(editorReducer(start, { type: 'setTrackProgram', trackIndex: 3, program: 30 })).toBe(start);
  });

  it.each<[string, EditorAction, (state: EditorState) => unknown, unknown]>([
    ['renames', { type: 'setTrackName', trackIndex: 0, name: ' Lead ' }, (state) => song(state).tracks[0]?.name, 'Lead'],
    ['mutes', { type: 'setTrackMute', trackIndex: 0, isMute: true }, (state) => song(state).tracks[0]?.mute, true],
    ['solos', { type: 'setTrackSolo', trackIndex: 0, isSolo: true }, (state) => song(state).tracks[0]?.solo, true],
    ['sets the volume of', { type: 'setTrackVolume', trackIndex: 0, volume: 90 }, (state) => song(state).channels[0]?.volume, 90],
    ['sets the balance of', { type: 'setTrackBalance', trackIndex: 0, balance: 10 }, (state) => song(state).channels[0]?.balance, 10],
    ['puts a capo on', { type: 'setTrackCapo', trackIndex: 0, capo: 2 }, (state) => song(state).tracks[0]?.offset, 2],
    ['gives lyrics to', { type: 'setTrackLyrics', trackIndex: 0, lyrics: { from: 1, text: 'la la' } }, (state) => song(state).tracks[0]?.lyrics, { from: 1, text: 'la la' }],
    ['gives effects to', { type: 'setTrackEffects', trackIndex: 0, effects: [buildEffect('drive')] }, (state) => song(state).tracks[0]?.effects, [buildEffect('drive')]],
  ])('%s a track as one undo step', (_name, action, read, expected) => {
    // Arrange
    const start = withChannel();

    // Act
    const changed = editorReducer(start, action);
    const undone = editorReducer(changed, { type: 'undo' });

    // Assert
    expect(read(changed)).toEqual(expected);
    expect(changed.past).toEqual([song(start)]);
    expect(song(undone)).toBe(song(start));
  });

  it('sets the master strip as one undo step', () => {
    // Arrange
    const start = withChannel();

    // Act
    const changed = editorReducer(start, { type: 'setMasterMix', master: { ...DEFAULT_MASTER, gainDb: -6 } });

    // Assert
    expect(song(changed).master?.gainDb).toBe(-6);
    expect(song(editorReducer(changed, { type: 'undo' }))).toBe(song(start));
  });

  it.each<EditorAction>([
    { type: 'setTrackName', trackIndex: 0, name: 'Guitar' },
    { type: 'setTrackName', trackIndex: 0, name: '  ' },
    { type: 'setTrackMute', trackIndex: 0, isMute: false },
    { type: 'setTrackSolo', trackIndex: 0, isSolo: false },
    { type: 'setTrackVolume', trackIndex: 0, volume: 127 },
    { type: 'setTrackBalance', trackIndex: 0, balance: 64 },
    { type: 'setTrackCapo', trackIndex: 0, capo: 0 },
    { type: 'setTrackCapo', trackIndex: 4, capo: 3 },
    { type: 'setTrackLyrics', trackIndex: 0, lyrics: { from: 1, text: ' ' } },
    { type: 'setSongInfo', info: { title: 'Test' } },
    { type: 'setTrackEffects', trackIndex: 0, effects: [] },
    { type: 'setMasterMix', master: DEFAULT_MASTER },
  ])('adds no undo step for a track or song edit that changes nothing: %o', (action) => {
    const start = withChannel();
    expect(editorReducer(start, action)).toBe(start);
    expect(editorReducer(INITIAL_EDITOR_STATE, action)).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('editorReducer: song information', () => {
  it('sets the song information as one undo step', () => {
    // Act
    const changed = editorReducer(loadedState(), { type: 'setSongInfo', info: { title: ' New ', artist: 'Band' } });

    // Assert
    expect(song(changed).info).toMatchObject({ title: 'New', artist: 'Band' });
    expect(changed.past).toHaveLength(1);
    expect(isEdited(changed)).toBe(true);
  });
});

describe('editorReducer: multivoice and moving notes between voices', () => {
  /** Bar 1: voice 1 a chord (strings 1 and 6) then three quarters. */
  function chordState(): EditorState {
    const chordSong = makeSong([[beat(960, [note(1, 3), note(6, 0)]), beat(1920, [note(2, 5)]), beat(2880, [note(3, 2)]), beat(3840, [note(4, 7)])]]);
    return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: chordSong } });
  }

  it('moves the note at the cursor to voice 2 in one undo step, the cursor staying in voice 1', () => {
    // Arrange
    const state = editorReducer(chordState(), { type: 'moveCursorString', delta: 5 });

    // Act
    const moved = editorReducer(state, { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 1 } });

    // Assert
    expect(findNote(song(moved), { ...at(moved), voiceIndex: 1 })?.fret).toBe(0);
    expect(at(moved)).toEqual(at(state));
    expect(moved.past).toHaveLength(1);
  });

  it('moves the selected beats, the selection ending', () => {
    // Arrange: beats 2 to 4 selected
    let state = editorReducer(chordState(), { type: 'moveCursorBeat', step: 1 });
    state = editorReducer(editorReducer(state, { type: 'extendSelection', step: 1 }), { type: 'extendSelection', step: 1 });

    // Act
    const moved = editorReducer(state, { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 3 } });

    // Assert
    const voice4 = song(moved).tracks[0]!.measures[0]!.beats.flatMap((b) => b.voices[3]?.notes.map((n) => n.fret) ?? []);
    expect(voice4).toEqual([5, 2, 7]);
    expect(moved.selectionAnchor).toBeUndefined();
  });

  it('keeps the cursor on the moved beat when the rests the move adds before it shift the beat indexes', () => {
    // Arrange: voice 1 = half, dotted quarter, eighth; the cursor on the eighth
    const dottedQuarter = { ...QUARTER, dotted: true };
    const beats = [beat(960, [note(1, 0)], { ...QUARTER, value: 2 }), beat(2880, [note(1, 2)], dottedQuarter), beat(4320, [note(1, 3)], { ...QUARTER, value: 8 })];
    let state = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: makeSong([beats]) } });
    state = editorReducer(editorReducer(state, { type: 'moveCursorBeat', step: 1 }), { type: 'moveCursorBeat', step: 1 });
    const start = song(state).tracks[0]!.measures[0]!.beats[at(state).beatIndex]!.start;

    // Act
    const moved = editorReducer(state, { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 1 } });

    // Assert
    const movedBeat = song(moved).tracks[0]!.measures[0]!.beats[at(moved).beatIndex];
    expect(movedBeat?.start).toBe(start);
    expect(movedBeat?.voices[1]?.notes.map((n) => n.fret)).toEqual([3]);
  });

  it('says why a move did nothing', () => {
    const state = chordState();
    const refused = editorReducer(state, { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 0 } });
    expect(refused.hint).toBe('The notes are in voice 1 already.');
    expect(song(refused)).toBe(song(state));
  });

  it('turns multivoice on and off; with it on, a click on a note puts the cursor in that note’s voice', () => {
    // Arrange: the chord's low note moved to voice 2, the cursor back on voice 1
    const moved = editorReducer(editorReducer(chordState(), { type: 'moveCursorString', delta: 5 }), { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 1 } });

    // Act
    const multivoice = editorReducer(moved, { type: 'toggleMultivoice' });
    const clicked = editorReducer(multivoice, { type: 'placeCursor', cursor: { ...at(moved), string: 6 } });
    const onEmptyString = editorReducer(multivoice, { type: 'placeCursor', cursor: { ...at(moved), string: 4 } });
    const single = editorReducer(moved, { type: 'placeCursor', cursor: { ...at(moved), string: 6 } });

    // Assert
    expect(multivoice.isMultivoice).toBe(true);
    expect(editorReducer(multivoice, { type: 'toggleMultivoice' }).isMultivoice).toBe(false);
    expect(at(clicked)).toMatchObject({ string: 6, voiceIndex: 1 });
    expect(at(onEmptyString)).toMatchObject({ string: 4, voiceIndex: 0 });
    expect(at(single)).toMatchObject({ string: 6, voiceIndex: 0 });
  });
});

describe('editorReducer: second voice', () => {
  const EMPTY_VOICE = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' } as const;

  /** One bar, voice 1 = 16th, dotted 8th, dotted quarter, 8th, quarter; voice 2 empty. */
  function twoVoices(): EditorState {
    const durations = [16, 8, 4, 8, 4] as const;
    const dotted = [false, true, true, false, false];
    let start = 960;
    const beats = durations.map((value, i) => {
      const duration = { ...QUARTER, value, dotted: dotted[i] === true };
      const played = beat(start, [note(1, i)], duration);
      start += [240, 720, 1440, 480, 960][i] ?? 0;
      return { ...played, voices: [...played.voices, EMPTY_VOICE] };
    });
    return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: makeSong([beats]) } });
  }

  /** Each played event of a voice of bar 1: start in the bar, length in ticks and frets. */
  function voiceEvents(state: EditorState, voiceIndex: number): string[] {
    return song(state).tracks[0]!.measures[0]!.beats.flatMap((b) => {
      const voice = b.voices[voiceIndex];
      return voice === undefined || voice.isEmpty ? [] : [`${toTux(b.start) - 960}:${voice.duration.value}${voice.duration.dotted ? '.' : ''}:${voice.notes.map((n) => n.fret).join(',') || 'r'}`];
    });
  }

  it('moves the cursor to the second voice of the same beat and back', () => {
    // Arrange
    const start = editorReducer(twoVoices(), { type: 'moveCursorBeat', step: 1 });

    // Act
    const second = editorReducer(start, { type: 'selectVoice', voiceIndex: 1 });
    const first = editorReducer(second, { type: 'selectVoice', voiceIndex: 0 });

    // Assert
    expect(at(second)).toEqual({ ...at(start), voiceIndex: 1 });
    expect(at(first)).toEqual(at(start));
    expect(second.past).toEqual([]);
  });

  it('selects voices 1 to 4, also on a beat read with fewer voice slots, and no voice past the fourth', () => {
    const start = twoVoices();
    expect(at(editorReducer(start, { type: 'selectVoice', voiceIndex: 2 }))).toEqual({ ...at(start), voiceIndex: 2 });
    expect(at(editorReducer(start, { type: 'selectVoice', voiceIndex: 3 }))).toEqual({ ...at(start), voiceIndex: 3 });
    expect(editorReducer(start, { type: 'selectVoice', voiceIndex: 4 })).toBe(start);
    expect(editorReducer(start, { type: 'selectVoice', voiceIndex: -1 })).toBe(start);
    expect(editorReducer(start, { type: 'selectVoice', voiceIndex: 0 })).toBe(start);
    const oneVoice = loadedState();
    expect(at(editorReducer(oneVoice, { type: 'selectVoice', voiceIndex: 1 }))).toMatchObject({ voiceIndex: 1 });
    expect(editorReducer(INITIAL_EDITOR_STATE, { type: 'selectVoice', voiceIndex: 1 })).toBe(INITIAL_EDITOR_STATE);
  });

  it('types a fret into voice 3 of a bar read with two voice slots, then sets its duration and rests in voice 4', () => {
    // Arrange: the cursor on the third beat (a dotted quarter at 960), voice 3
    let state = twoVoices();
    for (let step = 0; step < 2; step++) {
      state = editorReducer(state, { type: 'moveCursorBeat', step: 1 });
    }
    state = editorReducer(state, { type: 'selectVoice', voiceIndex: 2 });

    // Act
    const typed = editorReducer(state, { type: 'setNoteFret', fret: 9 });
    const halved = editorReducer(typed, { type: 'edit', edit: { type: 'setNoteValue', value: 8 } });
    const inVoice4 = editorReducer(editorReducer(halved, { type: 'selectVoice', voiceIndex: 3 }), { type: 'setNoteFret', fret: 2 });

    // Assert
    expect(voiceEvents(typed, 2)).toEqual(['0:4:r', '960:4.:9', '2400:4.:r']);
    expect(voiceEvents(halved, 2)).toEqual(['0:4:r', '960:8.:9', '1680:8.:r', '2400:4.:r']);
    expect(voiceEvents(inVoice4, 3)).toContain('960:4.:2');
    expect(voiceEvents(inVoice4, 0)).toEqual(voiceEvents(state, 0));
    expect(at(inVoice4)).toMatchObject({ voiceIndex: 3 });
    expect(inVoice4.past).toHaveLength(3);
  });

  it('types a fret into the empty second voice: a note as long as the beat, rests to the bar lines, one undo step', () => {
    // Arrange: the cursor on the fourth beat (an eighth at 2400), second voice
    let state = twoVoices();
    for (let step = 0; step < 3; step++) {
      state = editorReducer(state, { type: 'moveCursorBeat', step: 1 });
    }
    state = editorReducer(state, { type: 'selectVoice', voiceIndex: 1 });

    // Act
    const typed = editorReducer(state, { type: 'setNoteFret', fret: 7 });

    // Assert: the rests before the note add a beat at 1920, and the cursor stays on the note
    expect(voiceEvents(typed, 1)).toEqual(['0:2:r', '1920:8:r', '2400:8:7', '2880:4:r']);
    expect(voiceEvents(typed, 0)).toEqual(voiceEvents(state, 0));
    expect(at(typed)).toMatchObject({ beatIndex: 4, voiceIndex: 1 });
    expect(findNote(song(typed), at(typed))?.fret).toBe(7);
    expect(typed.past).toHaveLength(1);
    expect(song(editorReducer(typed, { type: 'undo' }))).toBe(song(state));
  });
});
