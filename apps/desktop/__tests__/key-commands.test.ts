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

  it('selects beats with ⇧← and ⇧→', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('ArrowLeft', { shiftKey: true }), digit, 0)).toEqual({ type: 'extendSelection', step: -1 });
    expect(keyCommand(press('ArrowRight', { shiftKey: true }), digit, 0)).toEqual({ type: 'extendSelection', step: 1 });
  });

  it('jumps between bars: ⌥←/→ previous and next, Home and End first and last', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('ArrowLeft', { altKey: true }), digit, 0)).toEqual({ type: 'goToBar', jump: 'previous' });
    expect(keyCommand(press('ArrowRight', { altKey: true }), digit, 0)).toEqual({ type: 'goToBar', jump: 'next' });
    expect(keyCommand(press('Home'), digit, 0)).toEqual({ type: 'goToBar', jump: 'first' });
    expect(keyCommand(press('End'), digit, 0)).toEqual({ type: 'goToBar', jump: 'last' });
  });

  it('zooms the score with ⌘- and ⌘= (- and = alone step the fret)', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('=', { metaKey: true }), digit, 0)).toEqual({ type: 'zoom', direction: 1 });
    expect(keyCommand(press('-', { metaKey: true }), digit, 0)).toEqual({ type: 'zoom', direction: -1 });
    expect(keyCommand(press('-'), digit, 0)).toEqual({ type: 'shiftNoteFret', delta: -1 });
  });

  it('types frets, combining two quick digits', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('1'), digit, 0)).toEqual({ type: 'setNoteFret', fret: 1 });
    expect(keyCommand(press('2'), digit, 10)).toEqual({ type: 'setNoteFret', fret: 12 });
    expect(keyCommand(press('5'), digit, 10 + DIGIT_WINDOW_MS + 1)).toEqual({ type: 'setNoteFret', fret: 5 });
  });

  it('maps playback, the playback tempo, fret steps and undo/redo', () => {
    const digit = { current: undefined };
    expect(keyCommand(press(' '), digit, 0)).toEqual({ type: 'togglePlayback' });
    expect(keyCommand(press('Escape'), digit, 0)).toEqual({ type: 'stopPlayback' });
    expect(keyCommand(press(']'), digit, 0)).toEqual({ type: 'shiftPlaybackTempo', delta: 5 });
    expect(keyCommand(press('['), digit, 0)).toEqual({ type: 'shiftPlaybackTempo', delta: -5 });
    expect(keyCommand(press('='), digit, 0)).toEqual({ type: 'shiftNoteFret', delta: 1 });
    expect(keyCommand(press('z', { metaKey: true }), digit, 0)).toEqual({ type: 'undo' });
    expect(keyCommand(press('Z', { metaKey: true, shiftKey: true }), digit, 0)).toEqual({ type: 'redo' });
    expect(keyCommand(press('q'), digit, 0)).toBeUndefined();
  });

  it('erases with ⌫ and ⌦: a note becomes a rest, a rest goes away', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('Backspace'), digit, 0)).toEqual({ type: 'edit', edit: { type: 'erase' } });
    expect(keyCommand(press('Delete'), digit, 0)).toEqual({ type: 'edit', edit: { type: 'erase' } });
    expect(keyCommand(press('Backspace', { shiftKey: true }), digit, 0)).toEqual({ type: 'edit', edit: { type: 'deleteBeat' } });
  });

  it('maps the note keys: r ring, s slide, h hammer, p pull, m palm mute, x dead note', () => {
    const digit = { current: undefined };
    const edit = (key: string) => keyCommand(press(key), digit, 0);
    expect(edit('r')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'letRing' } });
    expect(edit('s')).toEqual({ type: 'edit', edit: { type: 'toggleSlide' } });
    expect(edit('h')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'hammer' } });
    expect(edit('p')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'hammer' } });
    expect(edit('M')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'palmMute' } });
    expect(edit('x')).toEqual({ type: 'edit', edit: { type: 'toggleEffect', effect: 'deadNote' } });
  });

  it('opens the vibrato panel with b and the bend (choking) panel with c', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('b'), digit, 0)).toEqual({ type: 'openNotePanel', panel: 'vibrato' });
    expect(keyCommand(press('c'), digit, 0)).toEqual({ type: 'openNotePanel', panel: 'bend' });
  });

  it('keeps the other edit keys and moves the duration to ⌥[ and ⌥]', () => {
    const digit = { current: undefined };
    const edit = (key: string, modifiers = {}) => keyCommand(press(key, modifiers), digit, 0);
    expect(edit('[', { altKey: true })).toEqual({ type: 'edit', edit: { type: 'shiftNoteValue', step: -1 } });
    expect(edit(']', { altKey: true })).toEqual({ type: 'edit', edit: { type: 'shiftNoteValue', step: 1 } });
    expect(edit('.')).toEqual({ type: 'edit', edit: { type: 'toggleDot' } });
    expect(edit('/')).toEqual({ type: 'edit', edit: { type: 'toggleTriplet' } });
    expect(edit('i')).toEqual({ type: 'edit', edit: { type: 'insertBeat' } });
    expect(edit('s', { metaKey: true })).toBeUndefined();
  });

  it('copies, cuts and pastes with ⌘C, ⌘X and ⌘V', () => {
    const digit = { current: undefined };
    expect(keyCommand(press('c', { metaKey: true }), digit, 0)).toEqual({ type: 'copy' });
    expect(keyCommand(press('x', { metaKey: true }), digit, 0)).toEqual({ type: 'cut' });
    expect(keyCommand(press('v', { metaKey: true }), digit, 0)).toEqual({ type: 'paste' });
  });
});
