import { DIGIT_WINDOW_MS } from '../src/lib/fret-input';
import { keyCommand } from '../src/lib/key-commands';

const press = (key: string, modifiers: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('keyCommand', () => {
  it('maps arrows to cursor moves and ⌥↑/↓ to moving the note', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('ArrowUp'), digit, 0)).toEqual({ type: 'moveCursorString', delta: -1 });
    expect(keyCommand(press('ArrowDown'), digit, 0)).toEqual({ type: 'moveCursorString', delta: 1 });
    expect(keyCommand(press('ArrowLeft'), digit, 0)).toEqual({ type: 'moveCursorBeat', step: -1 });
    expect(keyCommand(press('ArrowRight'), digit, 0)).toEqual({ type: 'moveCursorBeat', step: 1 });
    expect(keyCommand(press('ArrowUp', { altKey: true }), digit, 0)).toEqual({ type: 'shiftNoteString', delta: -1 });
    expect(keyCommand(press('ArrowDown', { altKey: true }), digit, 0)).toEqual({ type: 'shiftNoteString', delta: 1 });
  });

  it('types frets, combining two quick digits', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('1'), digit, 0)).toEqual({ type: 'setNoteFret', fret: 1 });
    expect(keyCommand(press('2'), digit, 10)).toEqual({ type: 'setNoteFret', fret: 12 });
    expect(keyCommand(press('5'), digit, 10 + DIGIT_WINDOW_MS + 1)).toEqual({ type: 'setNoteFret', fret: 5 });
  });

  it('maps playback, delete, fret steps and undo/redo', () => {
    const digit = { current: undefined };
    expect(keyCommand(press(' '), digit, 0)).toEqual({ type: 'togglePlayback' });
    expect(keyCommand(press('Escape'), digit, 0)).toEqual({ type: 'stopPlayback' });
    expect(keyCommand(press('Backspace'), digit, 0)).toEqual({ type: 'deleteNote' });
    expect(keyCommand(press('='), digit, 0)).toEqual({ type: 'shiftNoteFret', delta: 1 });
    expect(keyCommand(press('z', { metaKey: true }), digit, 0)).toEqual({ type: 'undo' });
    expect(keyCommand(press('Z', { metaKey: true, shiftKey: true }), digit, 0)).toEqual({ type: 'redo' });
    expect(keyCommand(press('q'), digit, 0)).toBeUndefined();
  });
});
