import { DELETE_COMMANDS, HANDLED_KEYS, keyCommand } from '../src/lib/key-commands';

const press = (key: string, modifiers: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('keyCommand practice keys', () => {
  it('toggles the metronome (⌥M), the count-in (⌥C) and the tempo lock (⌥L), and steps the speed by 5% (⌥- / ⌥=)', () => {
    expect(keyCommand(press('m', { altKey: true }))).toEqual({ type: 'togglePractice', practice: 'metronome' });
    expect(keyCommand(press('c', { altKey: true }))).toEqual({ type: 'togglePractice', practice: 'countIn' });
    expect(keyCommand(press('l', { altKey: true }))).toEqual({ type: 'togglePractice', practice: 'tempoLock' });
    expect(keyCommand(press('=', { altKey: true }))).toEqual({ type: 'shiftPlaybackSpeed', delta: 5 });
    expect(keyCommand(press('-', { altKey: true }))).toEqual({ type: 'shiftPlaybackSpeed', delta: -5 });
  });

  it('claims those keys from react-native-macos, M and C alone staying palm mute and the bend panel', () => {
    for (const key of ['m', 'c', 'l', '=', '-']) {
      expect(HANDLED_KEYS).toContainEqual({ key, altKey: true });
    }
    expect(keyCommand(press('m'))).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'palmMute' } });
    expect(keyCommand(press('c'))).toEqual({ type: 'openNotePanel', panel: 'bend' });
  });
});

describe('keyCommand voices', () => {
  it('puts the cursor on voice 1 to 4 with ⌘1 to ⌘4, as Guitar Pro 8 does', () => {
    expect(['1', '2', '3', '4'].map((key) => keyCommand(press(key, { metaKey: true })))).toEqual([0, 1, 2, 3].map((voiceIndex) => ({ type: 'selectVoice', voiceIndex })));
    expect(keyCommand(press('5', { metaKey: true }))).toBeUndefined();
  });

  it('moves the note (or the selected beats) to voice 1 to 4 with ⌥1 to ⌥4 (Guitar Pro 8’s Move Voice)', () => {
    expect(['1', '2', '3', '4'].map((key) => keyCommand(press(key, { altKey: true })))).toEqual([0, 1, 2, 3].map((voiceIndex) => ({ type: 'edit', edit: { type: 'moveToVoice', voiceIndex } })));
    expect(keyCommand(press('5', { altKey: true }))).toEqual({ type: 'typeFretDigit', press: { digit: 5, at: 0, keyIndex: 0 } });
  });

  it('claims ⌘1 to ⌘4 and ⌥1 to ⌥4 from react-native-macos, the digits alone still typing frets', () => {
    for (const key of ['1', '2', '3', '4']) {
      expect(HANDLED_KEYS).toContainEqual({ key, metaKey: true });
      expect(HANDLED_KEYS).toContainEqual({ key, altKey: true });
    }
    expect(keyCommand(press('3'))).toEqual({ type: 'typeFretDigit', press: { digit: 3, at: 0, keyIndex: 0 } });
  });
});

describe('keyCommand', () => {
  it('maps arrows to cursor moves and ⌥↑/↓ to moving the note', () => {
    expect(keyCommand(press('ArrowUp'))).toEqual({ type: 'moveCursorString', delta: -1 });
    expect(keyCommand(press('ArrowDown'))).toEqual({ type: 'moveCursorString', delta: 1 });
    expect(keyCommand(press('ArrowLeft'))).toEqual({ type: 'moveCursorBeat', step: -1 });
    expect(keyCommand(press('ArrowRight'))).toEqual({ type: 'moveCursorBeat', step: 1 });
    expect(keyCommand(press('ArrowUp', { altKey: true }))).toEqual({ type: 'shiftNoteString', delta: -1 });
    expect(keyCommand(press('ArrowDown', { altKey: true }))).toEqual({ type: 'shiftNoteString', delta: 1 });
  });

  it('selects beats with ⇧← and ⇧→', () => {
    expect(keyCommand(press('ArrowLeft', { shiftKey: true }))).toEqual({ type: 'extendSelection', step: -1 });
    expect(keyCommand(press('ArrowRight', { shiftKey: true }))).toEqual({ type: 'extendSelection', step: 1 });
  });

  it('jumps between bars: ⌥←/→ previous and next, Home and End first and last', () => {
    expect(keyCommand(press('ArrowLeft', { altKey: true }))).toEqual({ type: 'goToBar', jump: 'previous' });
    expect(keyCommand(press('ArrowRight', { altKey: true }))).toEqual({ type: 'goToBar', jump: 'next' });
    expect(keyCommand(press('Home'))).toEqual({ type: 'goToBar', jump: 'first' });
    expect(keyCommand(press('End'))).toEqual({ type: 'goToBar', jump: 'last' });
  });

  it('zooms in with ⌘+ (⇧⌘=) too, and back to 100 % with ⌘0', () => {
    expect(keyCommand(press('+', { metaKey: true, shiftKey: true }))).toEqual({ type: 'zoom', direction: 1 });
    expect(keyCommand(press('0', { metaKey: true }))).toEqual({ type: 'zoomTo', zoom: 1 });
    expect(HANDLED_KEYS).toContainEqual({ key: '0', metaKey: true });
    expect(HANDLED_KEYS).toContainEqual({ key: '+', metaKey: true, shiftKey: true });
  });

  it('moves the selected notes, or the cursor’s, a semitone with ⌥⇧↑ / ⌥⇧↓ (Guitar Pro 8’s keys); ⌥↑ / ⌥↓ stay the string moves', () => {
    expect(keyCommand(press('ArrowUp', { altKey: true, shiftKey: true }))).toEqual({ type: 'shiftPitch', delta: 1 });
    expect(keyCommand(press('ArrowDown', { altKey: true, shiftKey: true }))).toEqual({ type: 'shiftPitch', delta: -1 });
    expect(keyCommand(press('ArrowUp', { altKey: true }))).toEqual({ type: 'shiftNoteString', delta: -1 });
    expect(HANDLED_KEYS).toContainEqual({ key: 'ArrowUp', altKey: true, shiftKey: true });
    expect(HANDLED_KEYS).toContainEqual({ key: 'ArrowDown', altKey: true, shiftKey: true });
  });

  it('zooms the score with ⌘- and ⌘= (- and = alone step the fret)', () => {
    expect(keyCommand(press('=', { metaKey: true }))).toEqual({ type: 'zoom', direction: 1 });
    expect(keyCommand(press('-', { metaKey: true }))).toEqual({ type: 'zoom', direction: -1 });
    expect(keyCommand(press('-'))).toEqual({ type: 'shiftNoteFret', delta: -1 });
  });

  it('types a digit with the moment it was pressed: when and which key press it was (the reducer combines two)', () => {
    expect(keyCommand(press('1'), { at: 250, index: 7 })).toEqual({ type: 'typeFretDigit', press: { digit: 1, at: 250, keyIndex: 7 } });
    expect(keyCommand(press('0'), { at: 300, index: 8 })).toEqual({ type: 'typeFretDigit', press: { digit: 0, at: 300, keyIndex: 8 } });
  });

  it('maps playback, the playback tempo, fret steps and undo/redo', () => {
    expect(keyCommand(press(' '))).toEqual({ type: 'togglePlayback' });
    expect(keyCommand(press('Escape'))).toEqual({ type: 'stopPlayback' });
    expect(keyCommand(press(']'))).toEqual({ type: 'shiftPlaybackTempo', delta: 5 });
    expect(keyCommand(press('['))).toEqual({ type: 'shiftPlaybackTempo', delta: -5 });
    expect(keyCommand(press('='))).toEqual({ type: 'shiftNoteFret', delta: 1 });
    expect(keyCommand(press('z', { metaKey: true }))).toEqual({ type: 'undo' });
    expect(keyCommand(press('Z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
    expect(keyCommand(press('q'))).toBeUndefined();
  });

  it('erases with ⌫ and ⌦: a note becomes a rest, a rest goes away', () => {
    expect(keyCommand(press('Backspace'))).toEqual({ type: 'edit', edit: { type: 'erase' } });
    expect(keyCommand(press('Delete'))).toEqual({ type: 'edit', edit: { type: 'erase' } });
    expect(keyCommand(press('Backspace', { shiftKey: true }))).toEqual({ type: 'edit', edit: { type: 'deleteBeat' } });
  });

  it('maps the note keys: r ring, s slide, h hammer, p pull, m palm mute, x dead note', () => {
    const edit = (key: string) => keyCommand(press(key));
    expect(edit('r')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'letRing' } });
    expect(edit('s')).toEqual({ type: 'edit', edit: { type: 'toggleSlide' } });
    expect(edit('h')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'hammer' } });
    expect(edit('p')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'hammer' } });
    expect(edit('M')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'palmMute' } });
    expect(edit('x')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'deadNote' } });
  });

  it('opens the vibrato panel with b and the bend (choking) panel with c', () => {
    expect(keyCommand(press('b'))).toEqual({ type: 'openNotePanel', panel: 'vibrato' });
    expect(keyCommand(press('c'))).toEqual({ type: 'openNotePanel', panel: 'bend' });
    expect(keyCommand(press('k'))).toEqual({ type: 'openChordPanel' });
    expect(keyCommand(press('K'))).toEqual({ type: 'openChordPanel' });
  });

  it('keeps the other edit keys and moves the duration to ⌥[ and ⌥]', () => {
    const edit = (key: string, modifiers = {}) => keyCommand(press(key, modifiers));
    expect(edit('[', { altKey: true })).toEqual({ type: 'edit', edit: { type: 'shiftNoteValue', step: -1 } });
    expect(edit(']', { altKey: true })).toEqual({ type: 'edit', edit: { type: 'shiftNoteValue', step: 1 } });
    expect(edit('.')).toEqual({ type: 'edit', edit: { type: 'toggleDot' } });
    expect(edit('/')).toEqual({ type: 'edit', edit: { type: 'toggleTriplet' } });
    expect(edit('i')).toEqual({ type: 'edit', edit: { type: 'insertBeat' } });
    expect(edit('s', { metaKey: true })).toBeUndefined();
  });

  it('puts a triplet inside the beat’s tuplet with ⌥/ (and claims the key)', () => {
    expect(keyCommand(press('/', { altKey: true }))).toEqual({ type: 'edit', edit: { type: 'toggleInnerTriplet' } });
    expect(HANDLED_KEYS).toContainEqual({ key: '/', altKey: true });
  });

  it('copies, cuts and pastes with ⌘C, ⌘X and ⌘V', () => {
    expect(keyCommand(press('c', { metaKey: true }))).toEqual({ type: 'copy' });
    expect(keyCommand(press('x', { metaKey: true }))).toEqual({ type: 'cut' });
    expect(keyCommand(press('v', { metaKey: true }))).toEqual({ type: 'paste' });
  });
});

describe('keyCommand tracks', () => {
  it('goes to the previous and next track with ⌘↑ and ⌘↓, as Guitar Pro 8 does (and claims the keys)', () => {
    expect(keyCommand(press('ArrowUp', { metaKey: true }))).toEqual({ type: 'moveCursorTrack', step: -1 });
    expect(keyCommand(press('ArrowDown', { metaKey: true }))).toEqual({ type: 'moveCursorTrack', step: 1 });
    expect(HANDLED_KEYS).toContainEqual({ key: 'ArrowUp', metaKey: true });
    expect(HANDLED_KEYS).toContainEqual({ key: 'ArrowDown', metaKey: true });
  });
});

describe('keyCommand delete keys', () => {
  it('deletes the note, or the selected notes, with D, and the bar, or the selected bars, with ⌘D (− Bar’s edit)', () => {
    expect(keyCommand(press('d'))).toEqual({ type: 'edit', edit: { type: 'deleteNotes' } });
    expect(keyCommand(press('d', { metaKey: true }))).toEqual({ type: 'edit', edit: { type: 'deleteMeasure' } });
  });

  it('claims D and ⌘D from react-native-macos', () => {
    expect(HANDLED_KEYS).toContainEqual({ key: 'd' });
    expect(HANDLED_KEYS).toContainEqual({ key: 'd', metaKey: true });
  });

  it('gives Edit ▸ Delete Notes and Delete Bars the commands of their keys', () => {
    expect(DELETE_COMMANDS.notes).toEqual(keyCommand(press('d')));
    expect(DELETE_COMMANDS.bars).toEqual(keyCommand(press('d', { metaKey: true })));
  });
});
