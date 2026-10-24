import { QUARTER } from '@gp-editor/core';
import { type CommandActions, type CommandState, press, pressLabel } from '../src/lib/command-types';
import { APP_COMMANDS, COMMANDS } from '../src/lib/commands';
import { PALETTE_COMMANDS, optionTitle, toolName, withoutKeyNote } from '../src/lib/palette-commands';
import { header, note } from '../test-support/songs';

const NO_DOCUMENT: CommandState = { hasDocument: false, hasSelection: false, canUndo: false, canRedo: false, tabCount: 0, isPercussion: false, palette: { keySignature: 0 } };

/** A document with the cursor on a note of a bar. */
const ON_NOTE: CommandState = {
  ...NO_DOCUMENT,
  hasDocument: true,
  tabCount: 1,
  palette: { keySignature: 0, note: note(1, 3), voice: { duration: QUARTER, notes: [note(1, 3)], isEmpty: false, direction: 'none' }, header: header(1) },
};

function find(id: string) {
  const command = COMMANDS.find((candidate) => candidate.id === id);
  if (command === undefined) {
    throw new Error(`no command ${id}`);
  }
  return command;
}

function mockActions(): jest.Mocked<CommandActions> {
  return {
    runCommand: jest.fn(),
    save: jest.fn(),
    exportPng: jest.fn(),
    exportMidi: jest.fn(),
    exportAsciiTab: jest.fn(),
    exportMusicXml: jest.fn(),
    exportCompressedMusicXml: jest.fn(),
    exportAudio: jest.fn(),
    print: jest.fn(),
    closeTab: jest.fn(),
    cycleTab: jest.fn(),
    openRecentFiles: jest.fn(),
    openSongWriter: jest.fn(),
    openShortcuts: jest.fn(),
    openTranspose: jest.fn(),
    openTuner: jest.fn(),
    openScales: jest.fn(),
    openLineIn: jest.fn(),
    openLyrics: jest.fn(),
    pickInstrument: jest.fn(),
    togglePanel: jest.fn(),
    toggleLoop: jest.fn(),
  };
}

describe('command registry', () => {
  it('gives every command its own id, a title and a group', () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of COMMANDS) {
      expect(command.title).not.toBe('');
      expect(command.group).not.toBe('');
    }
  });

  it('lists every menu command, panel and file event the app answers', () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'file.new',
        'file.newScore',
        'file.newTab',
        'file.open',
        'file.recent',
        'file.importPdf',
        'file.save',
        'file.saveAs',
        'file.exportPdf',
        'file.exportPng',
        'file.exportMidi',
        'file.exportAsciiTab',
        'file.exportMusicXml',
        'file.exportCompressedMusicXml',
        'file.exportAudio',
        'file.print',
        'file.closeTab',
        'file.nextTab',
        'file.previousTab',
        'edit.undo',
        'edit.redo',
        'edit.songWriter',
        'tools.tuner',
        'tools.scales',
        'edit.lyrics',
        'tools.transpose',
        'tools.instrument',
        'tools.lineIn',
        'view.panel.mixer',
        'beat.chord',
        'help.shortcuts',
        'play.toggle',
        'play.loop',
      ]),
    );
  });

  it('shows each key the way the shortcut sheet writes it, and runs what the key does', () => {
    expect(find('edit.redo')).toMatchObject({ shortcut: '⇧⌘Z', command: { type: 'redo' } });
    expect(find('note.stringUp')).toMatchObject({ shortcut: '⌥↑', command: { type: 'shiftNoteString', delta: -1 } });
    expect(find('beat.delete')).toMatchObject({ shortcut: '⇧⌫', command: { type: 'edit', edit: { type: 'deleteBeat' } } });
    expect(find('note.letRing')).toMatchObject({ shortcut: 'R', command: { type: 'edit', edit: { type: 'toggleEffect', effect: 'letRing' } } });
    expect(find('play.toggle').shortcut).toBe('Space');
  });

  it('lists a palette tool that does what a key does once, with the key', () => {
    const commands = COMMANDS.flatMap((command) => (command.command === undefined ? [] : [JSON.stringify(command.command)]));
    expect(new Set(commands).size).toBe(commands.length);
    expect(COMMANDS.some((command) => command.id === 'palette.letRing')).toBe(false);
    expect(PALETTE_COMMANDS.some((command) => command.id === 'palette.letRing')).toBe(true);
  });

  it('turns the edition palette’s tools, options and steppers into commands; text tools stay in the palette', () => {
    expect(find('palette.value8')).toMatchObject({ title: 'Eighth note', group: 'Rhythm', command: { type: 'edit', edit: { type: 'setNoteValue', value: 8 } } });
    expect(COMMANDS.map((command) => command.title)).toEqual(expect.arrayContaining(['Tuplet: 3-tuplet', 'Trill: Off', 'Dynamic mf', 'Repeat start']));
    expect(find('palette.whammy')).toMatchObject({ title: 'Whammy bar: presets and your own curve', command: { type: 'openNotePanel', panel: 'tremoloBar' } });
    expect(find('palette.tempo.plus')).toMatchObject({ title: 'Written tempo from this bar (+)', command: { type: 'edit', edit: { type: 'shiftTempo', delta: 5 } } });
    expect(COMMANDS.some((command) => command.id.startsWith('palette.section'))).toBe(false);
  });

  it('writes palette titles from the tooltips', () => {
    expect(withoutKeyNote('Tie to the previous note (T)')).toBe('Tie to the previous note');
    expect(withoutKeyNote('Bend (choking): shape and amount (C)')).toBe('Bend (choking): shape and amount');
    expect(toolName('Slides: shift, legato, in and out')).toBe('Slides');
    expect(toolName('Trill (with the fret 2 above)')).toBe('Trill');
    expect(toolName('Harmonics — the key toggles a natural harmonic')).toBe('Harmonics');
    const tool = { id: 'x', face: 'X', tooltip: 'Grace note (2 frets below)', scope: 'note' as const, run: { kind: 'options' as const, options: [] } };
    expect(optionTitle(tool, { label: 'On', tooltip: 'Grace note on the beat', edit: { type: 'toggleDot' } })).toBe('Grace note on the beat');
    expect(optionTitle(tool, { label: 'None', tooltip: 'None', edit: { type: 'toggleDot' } })).toBe('Grace note: None');
  });

  it('writes key presses as macOS menus do', () => {
    expect(pressLabel(press('z', { metaKey: true, shiftKey: true }))).toBe('⇧⌘Z');
    expect(pressLabel(press('ArrowLeft', { altKey: true }))).toBe('⌥←');
    expect(pressLabel(press('Backspace'))).toBe('⌫');
    expect(pressLabel(press('Delete'))).toBe('⌦');
    expect(pressLabel(press('Escape'))).toBe('Esc');
    expect(pressLabel(press('Home'))).toBe('Home');
    expect(pressLabel(press('.'))).toBe('.');
  });
});

describe('command registry: when a command can run', () => {
  it('runs only what needs no document when none is open', () => {
    const enabled = APP_COMMANDS.filter((command) => command.isEnabled(NO_DOCUMENT)).map((command) => command.id);
    expect(enabled).toEqual(['file.new', 'file.newScore', 'file.newTab', 'file.open', 'file.recent', 'file.importPdf', 'edit.songWriter', 'tools.tuner', 'tools.scales', 'help.shortcuts']);
  });

  it('needs a note for note commands, history for undo, two tabs to switch and a pitched track for the instrument', () => {
    const noNote: CommandState = { ...ON_NOTE, palette: { ...ON_NOTE.palette, note: undefined } };
    expect(find('note.letRing').isEnabled(ON_NOTE)).toBe(true);
    expect(find('note.letRing').isEnabled(noNote)).toBe(false);
    expect(find('beat.insert').isEnabled(noNote)).toBe(true);
    expect(find('palette.repeatOpen').isEnabled(noNote)).toBe(true);
    expect(find('edit.undo').isEnabled(ON_NOTE)).toBe(false);
    expect(find('edit.undo').isEnabled({ ...ON_NOTE, canUndo: true })).toBe(true);
    expect(find('edit.redo').isEnabled({ ...ON_NOTE, canRedo: true })).toBe(true);
    expect(find('file.nextTab').isEnabled(ON_NOTE)).toBe(false);
    expect(find('file.nextTab').isEnabled({ ...ON_NOTE, tabCount: 2 })).toBe(true);
    expect(find('tools.instrument').isEnabled({ ...ON_NOTE, isPercussion: true })).toBe(false);
    expect(find('palette.repeats.plus').isEnabled(ON_NOTE)).toBe(false);
    expect(find('palette.repeats.plus').isEnabled({ ...ON_NOTE, palette: { ...ON_NOTE.palette, header: header(1, { repeatClose: 2 }) } })).toBe(true);
  });
});

describe('command registry: running', () => {
  it('calls the same handlers as the menus', () => {
    // Arrange
    const actions = mockActions();

    // Act
    for (const id of ['file.saveAs', 'file.exportMidi', 'file.exportAsciiTab', 'file.exportMusicXml', 'file.exportCompressedMusicXml', 'file.exportAudio', 'tools.tuner', 'tools.scales', 'edit.lyrics', 'file.exportPng', 'file.print', 'file.closeTab', 'file.previousTab', 'tools.transpose', 'view.panel.inspector', 'play.loop', 'help.shortcuts', 'edit.songWriter', 'file.recent', 'tools.instrument', 'tools.lineIn', 'view.panel.mixer']) {
      find(id).run(actions);
    }

    // Assert
    expect(actions.save).toHaveBeenCalledWith(true);
    expect(actions.exportMidi).toHaveBeenCalled();
    expect(actions.exportAsciiTab).toHaveBeenCalled();
    expect(actions.exportMusicXml).toHaveBeenCalled();
    expect(actions.exportCompressedMusicXml).toHaveBeenCalled();
    expect(actions.exportAudio).toHaveBeenCalled();
    expect(actions.openTuner).toHaveBeenCalled();
    expect(actions.openScales).toHaveBeenCalled();
    expect(actions.openLyrics).toHaveBeenCalled();
    expect(actions.exportPng).toHaveBeenCalled();
    expect(actions.print).toHaveBeenCalled();
    expect(actions.closeTab).toHaveBeenCalled();
    expect(actions.cycleTab).toHaveBeenCalledWith(-1);
    expect(actions.openTranspose).toHaveBeenCalled();
    expect(actions.togglePanel).toHaveBeenCalledWith('inspector');
    expect(actions.toggleLoop).toHaveBeenCalled();
    expect(actions.openShortcuts).toHaveBeenCalled();
    expect(actions.openSongWriter).toHaveBeenCalled();
    expect(actions.openRecentFiles).toHaveBeenCalled();
    expect(actions.pickInstrument).toHaveBeenCalled();
    expect(actions.openLineIn).toHaveBeenCalled();
    expect(actions.togglePanel).toHaveBeenCalledWith('mixer');
  });

  it('hands editor commands to the editor’s own path', () => {
    const actions = mockActions();
    find('file.exportPdf').run(actions);
    find('view.mode.tab').run(actions);
    find('palette.value8').run(actions);
    expect(actions.runCommand.mock.calls).toEqual([[{ type: 'exportPdf' }], [{ type: 'setMode', mode: 'tab' }], [{ type: 'edit', edit: { type: 'setNoteValue', value: 8 } }]]);
  });
});
