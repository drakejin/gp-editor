import { QUARTER } from '@gp-editor/core';
import { type CommandActions, type CommandState, press, pressLabel } from '../src/lib/command-types';
import { allCommands, appCommands } from '../src/lib/commands';
import { optionTitle, paletteToolCommands, toolName, withoutKeyNote } from '../src/lib/palette-commands';
import { setLanguage } from '../src/lib/i18n/i18n';
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
  const command = allCommands().find((candidate) => candidate.id === id);
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
    openStylesheet: jest.fn(),
    closeTab: jest.fn(),
    cycleTab: jest.fn(),
    openRecentFiles: jest.fn(),
    openSongWriter: jest.fn(),
    openShortcuts: jest.fn(),
    openSettings: jest.fn(),
    openTranspose: jest.fn(),
    openTuner: jest.fn(),
    openScales: jest.fn(),
    openLineIn: jest.fn(),
    openExpressionText: jest.fn(),
    pickInstrument: jest.fn(),
    addAudioTrack: jest.fn(),
    runTrackCommand: jest.fn(),
    togglePanel: jest.fn(),
    toggleLoop: jest.fn(),
    toggleFocus: jest.fn(),
    toggleDrumKey: jest.fn(),
    togglePreviewOnHover: jest.fn(),
    runMcpServerCommand: jest.fn(),
  };
}

describe('command registry: stylesheet and Design Mode', () => {
  it('opens the stylesheet (F7) and turns Design Mode on, and resets the positions it set', () => {
    // Arrange
    const actions = mockActions();

    // Act
    find('file.stylesheet').run(actions);
    find('view.designMode').run(actions);
    find('view.resetPositions').run(actions);

    // Assert
    expect(find('file.stylesheet').shortcut).toBe('F7');
    expect(actions.openStylesheet).toHaveBeenCalledTimes(1);
    expect(actions.runCommand).toHaveBeenNthCalledWith(1, { type: 'toggleDesignMode' });
    expect(actions.runCommand).toHaveBeenNthCalledWith(2, { type: 'resetPositions' });
  });
});

describe('command registry: voices', () => {
  it('lists Edit Voice 1 to 4 with ⌘1 to ⌘4 once, the palette’s Voice buttons being the same commands', () => {
    // Act
    const voices = [1, 2, 3, 4].map((number) => find(`edit.voice${number}`));

    // Assert
    expect(voices.map((command) => [command.title, command.shortcut])).toEqual([1, 2, 3, 4].map((number) => [`Edit Voice ${number}`, `⌘${number}`]));
    expect(voices.map((command) => command.command)).toEqual([0, 1, 2, 3].map((voiceIndex) => ({ type: 'selectVoice', voiceIndex })));
    expect(allCommands().some((command) => command.id === 'palette.voice3')).toBe(false);
    expect(voices.every((command) => command.isEnabled(ON_NOTE))).toBe(true);
  });

  it('lists Move to Voice 1 to 4 with ⌥1 to ⌥4 and Multivoice, once each', () => {
    const moves = [1, 2, 3, 4].map((number) => find(`edit.moveToVoice${number}`));
    expect(moves.map((command) => [command.title, command.shortcut])).toEqual([1, 2, 3, 4].map((number) => [`Move to Voice ${number}`, `⌥${number}`]));
    expect(allCommands().filter((command) => JSON.stringify(command.command) === JSON.stringify(moves[2]?.command))).toHaveLength(1);
    expect(allCommands().filter((command) => JSON.stringify(command.command) === JSON.stringify({ type: 'toggleMultivoice' }))).toHaveLength(1);
  });
});

describe('command registry', () => {
  it('gives every command its own id, a title and a group', () => {
    const ids = allCommands().map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of allCommands()) {
      expect(command.title).not.toBe('');
      expect(command.group).not.toBe('');
    }
  });

  it('lists every menu command, panel and file event the app answers', () => {
    const ids = allCommands().map((command) => command.id);
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

  it('lists Edit ▸ Delete Notes (D) and Delete Bars (⌘D), the palette’s Delete and − Bar being the same commands', () => {
    expect(find('edit.deleteNotes')).toMatchObject({ title: 'Delete Notes', shortcut: 'D', command: { type: 'edit', edit: { type: 'deleteNotes' } } });
    expect(find('edit.deleteBars')).toMatchObject({ title: 'Delete Bars', shortcut: '⌘D', command: { type: 'edit', edit: { type: 'deleteMeasure' } } });
    expect(allCommands().some((command) => command.id === 'palette.deleteNotes' || command.id === 'palette.deleteMeasure')).toBe(false);
    expect(find('palette.insertMeasure').title).toBe('Add a bar after the bar you clicked — the cursor’s bar');
  });

  it('lists a palette tool that does what a key does once, with the key', () => {
    const commands = allCommands().flatMap((command) => (command.command === undefined ? [] : [JSON.stringify(command.command)]));
    expect(new Set(commands).size).toBe(commands.length);
    expect(allCommands().some((command) => command.id === 'palette.letRing')).toBe(false);
    expect(paletteToolCommands().some((command) => command.id === 'palette.letRing')).toBe(true);
  });

  it('turns the edition palette’s tools, options and steppers into commands; text tools stay in the palette', () => {
    expect(find('palette.value8')).toMatchObject({ title: 'Eighth note', group: 'Rhythm', command: { type: 'edit', edit: { type: 'setNoteValue', value: 8 } } });
    expect(allCommands().map((command) => command.title)).toEqual(expect.arrayContaining(['Tuplet: 3-tuplet', 'Trill: Off', 'Dynamic mf', 'Repeat start']));
    expect(find('palette.whammy')).toMatchObject({ title: 'Whammy bar: presets and your own curve', command: { type: 'openNotePanel', panel: 'tremoloBar' } });
    expect(find('palette.tempo.plus')).toMatchObject({ title: 'Written tempo from this bar (+)', command: { type: 'edit', edit: { type: 'shiftTempo', delta: 5 } } });
    expect(allCommands().some((command) => command.id.startsWith('palette.section'))).toBe(false);
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
    const enabled = appCommands().filter((command) => command.isEnabled(NO_DOCUMENT)).map((command) => command.id);
    expect(enabled).toEqual(['file.new', 'file.newScore', 'file.newTab', 'file.open', 'file.recent', 'file.importPdf', 'edit.songWriter', 'tools.tuner', 'tools.scales',
      'tools.mcpServerSettings', 'tools.mcpServerLog', 'tools.mcpServerRestart', 'tools.mcpServerSetupCommand', 'help.shortcuts', 'app.settings',
    ]);
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
    expect(find('edit.deleteNotes').isEnabled(ON_NOTE)).toBe(true);
    expect(find('edit.deleteNotes').isEnabled(noNote)).toBe(false);
    expect(find('edit.deleteNotes').isEnabled({ ...noNote, hasSelection: true })).toBe(true);
    expect(find('edit.deleteBars').isEnabled(noNote)).toBe(true);
    expect(find('edit.deleteBars').isEnabled(NO_DOCUMENT)).toBe(false);
    expect(find('palette.repeats.plus').isEnabled(ON_NOTE)).toBe(false);
    expect(find('palette.repeats.plus').isEnabled({ ...ON_NOTE, palette: { ...ON_NOTE.palette, header: header(1, { repeatClose: 2 }) } })).toBe(true);
  });
});

describe('command registry: running', () => {
  it('calls the same handlers as the menus', () => {
    // Arrange
    const actions = mockActions();

    // Act
    for (const id of ['file.saveAs', 'file.exportMidi', 'file.exportAsciiTab', 'file.exportMusicXml', 'file.exportCompressedMusicXml', 'file.exportAudio', 'tools.tuner', 'tools.scales', 'file.exportPng', 'file.print', 'file.closeTab', 'file.previousTab', 'tools.transpose', 'view.panel.inspector', 'play.loop', 'help.shortcuts', 'edit.songWriter', 'file.recent', 'tools.instrument', 'tools.lineIn', 'view.panel.mixer', 'app.settings']) {
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
    expect(actions.openSettings).toHaveBeenCalled();
  });

  it('opens Tools ▸ Expression Text… with its key, wherever a document is open', () => {
    // Arrange
    const actions = mockActions();
    const row = find('tools.expressionText');

    // Act
    row.run(actions);

    // Assert
    expect(row).toMatchObject({ title: 'Expression Text…', group: 'Tools', shortcut: '⌥⌘E' });
    expect(actions.openExpressionText).toHaveBeenCalled();
  });

  it('shows or hides View ▸ Drum Key, found by its drums', () => {
    // Arrange
    const actions = mockActions();
    const row = find('view.drumKey');

    // Act
    row.run(actions);

    // Assert
    expect(row).toMatchObject({ title: 'Drum Key', group: 'View' });
    expect(row.keywords).toEqual(expect.arrayContaining(['drums', 'legend', 'noteheads']));
    expect(actions.toggleDrumKey).toHaveBeenCalled();
  });

  it('runs the practice keys, View ▸ Focus and the hover preview', () => {
    // Arrange
    const actions = mockActions();

    // Act
    for (const id of ['play.speedUp', 'play.speedDown', 'play.metronome', 'play.countIn', 'play.tempoLock', 'view.focus', 'play.previewOnHover']) {
      find(id).run(actions);
    }

    // Assert
    expect(actions.runCommand.mock.calls).toEqual([
      [{ type: 'shiftPlaybackSpeed', delta: 5 }],
      [{ type: 'shiftPlaybackSpeed', delta: -5 }],
      [{ type: 'togglePractice', practice: 'metronome' }],
      [{ type: 'togglePractice', practice: 'countIn' }],
      [{ type: 'togglePractice', practice: 'tempoLock' }],
    ]);
    expect(actions.toggleFocus).toHaveBeenCalled();
    expect(actions.togglePreviewOnHover).toHaveBeenCalled();
    expect([find('play.metronome').shortcut, find('view.focus').shortcut]).toEqual(['⌥M', '⇧⌘F']);
  });

  it('runs Tools ▸ MCP Server’s items through the server’s native menus', () => {
    // Arrange
    const actions = mockActions();

    // Act
    for (const id of ['tools.mcpServerSettings', 'tools.mcpServerLog', 'tools.mcpServerRestart', 'tools.mcpServerSetupCommand']) {
      find(id).run(actions);
    }

    // Assert
    expect(actions.runMcpServerCommand.mock.calls).toEqual([['settings'], ['log'], ['restart'], ['copySetupCommand']]);
  });

  it('hands editor commands to the editor’s own path', () => {
    const actions = mockActions();
    find('file.exportPdf').run(actions);
    find('view.mode.tab').run(actions);
    find('palette.value8').run(actions);
    expect(actions.runCommand.mock.calls).toEqual([[{ type: 'exportPdf' }], [{ type: 'setMode', mode: 'tab' }], [{ type: 'edit', edit: { type: 'setNoteValue', value: 8 } }]]);
  });

  it('adds and removes the audio track, syncs the cursor’s bar with Y and sets the tempo from the sync points', () => {
    // Arrange
    const actions = mockActions();

    // Act
    find('track.addAudioTrack').run(actions);
    find('track.removeAudioTrack').run(actions);
    find('track.syncBar').run(actions);
    find('track.tempoFromAudio').run(actions);

    // Assert
    expect(actions.addAudioTrack).toHaveBeenCalledTimes(1);
    expect(actions.runCommand.mock.calls).toEqual([[{ type: 'setAudioTrack', audioTrack: undefined }], [{ type: 'markSyncPoint' }], [{ type: 'setTempoFromAudio' }]]);
    expect(find('track.syncBar').shortcut).toBe('Y');
    expect(find('track.addAudioTrack').isEnabled(NO_DOCUMENT)).toBe(false);
  });

  it('adds, duplicates, deletes and moves tracks through the Track menu’s handler, with Guitar Pro 8’s keys', () => {
    // Arrange
    const actions = mockActions();

    // Act
    ['track.add', 'track.duplicate', 'track.delete', 'track.moveUp', 'track.moveDown'].forEach((id) => find(id).run(actions));

    // Assert
    expect(actions.runTrackCommand.mock.calls).toEqual([['add'], ['duplicate'], ['delete'], ['moveUp'], ['moveDown']]);
    expect([find('track.add').shortcut, find('track.delete').shortcut]).toEqual(['⌥⌘N', '⌥⌘R']);
    expect(find('track.add').isEnabled(NO_DOCUMENT)).toBe(false);
  });
});

describe('command registry in Korean', () => {
  afterEach(() => setLanguage('en'));

  it('takes every registry title from the catalogues', () => {
    const untitled = appCommands().filter((command) => command.title === command.id);

    expect(untitled.map((command) => command.id)).toEqual([]);
  });

  it('lists the commands again in Korean after the language changes, keys and runs as before', () => {
    // Arrange
    const english = appCommands();

    // Act
    setLanguage('ko');
    const korean = appCommands();
    const byId = (id: string) => korean.find((command) => command.id === id);

    // Assert
    expect(korean).not.toBe(english);
    expect(korean.map((command) => command.id)).toEqual(english.map((command) => command.id));
    expect(byId('file.saveAs')).toMatchObject({ title: '다른 이름으로 저장…', group: '파일', shortcut: '⇧⌘S' });
    expect(byId('edit.moveToVoice3')).toMatchObject({ title: '성부 3으로 옮기기', shortcut: '⌥3', command: { type: 'edit', edit: { type: 'moveToVoice', voiceIndex: 2 } } });
    expect(byId('play.toggle')).toMatchObject({ title: '재생 / 정지', group: '재생', shortcut: '스페이스' });
    expect(byId('tools.transpose')?.keywords).toEqual(expect.arrayContaining(['Transpose…', 'Tools', 'semitone']));
  });

  it('keeps the English titles and keywords when the app is in English', () => {
    expect(appCommands().find((command) => command.id === 'tools.transpose')?.keywords).not.toContain('Transpose…');
  });
});
