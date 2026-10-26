import { buildNewSong, findNote } from '@gp-editor/core';
import { setLanguage } from '../src/lib/i18n/i18n';
import { SANDBOX_NOTE } from '../src/mcp/tools/file-tools';
import { INITIAL_WORKSPACE, type WorkspaceAction, activeEditor, workspaceReducer } from '../src/state/workspace';
import { call, fakeApp, openWorkspace } from '../test-support/mcp-host';

const newScore = () => workspaceReducer(INITIAL_WORKSPACE, { type: 'created', mode: 'notationAndTab' });

describe('playback tools', () => {
  it('plays as Space does, or from a bar, and stops', async () => {
    // Arrange
    const app = fakeApp(newScore());

    // Act
    const spaced = await call(app, 'play');
    const stopped = await call(app, 'stop');
    const fromBar = await call(app, 'play', { fromBar: 3 });

    // Assert
    expect(app.calls).toEqual(['runCommand togglePlayback', 'stop', 'start 2']);
    expect(spaced.structured).toMatchObject({ playback: { isPlaying: true } });
    expect(stopped.structured).toMatchObject({ playback: { isPlaying: false } });
    expect(fromBar.text).toMatch(/^Playing from bar 3\./);
  });

  it('refuses a bar the song does not have', async () => {
    expect(await call(fakeApp(newScore()), 'play', { fromBar: 9 })).toMatchObject({ isError: true, text: 'Bar 9 does not exist: the song has 4 bar(s).' });
  });

  it('pauses with the cursor on the beat that was sounding, and says when nothing plays', async () => {
    const app = fakeApp(newScore(), { playing: { measureIndex: 2, beatIndex: 0 } });
    const idle = await call(app, 'pause');
    await call(app, 'play');

    const paused = await call(app, 'pause');

    expect(idle).toMatchObject({ isError: true, text: 'Nothing is playing.' });
    expect(paused.text).toMatch(/^Paused at bar 3, beat 1\./);
    expect(activeEditor(app.state()).cursor).toMatchObject({ measureIndex: 2, beatIndex: 0 });
  });

  it('turns the loop on over bars and off, and sets the speed', async () => {
    const app = fakeApp(newScore());

    const on = await call(app, 'set_loop', { isOn: true, fromBar: 2, toBar: 3 });
    const speed = await call(app, 'set_speed', { percent: 80 });
    const off = await call(app, 'set_loop', { isOn: false });

    expect(on.structured).toMatchObject({ playback: { isLooping: true, loop: { fromBar: 2, toBar: 3 } } });
    expect(speed.structured).toMatchObject({ playback: { speedPercent: 80 } });
    expect(off.structured).toMatchObject({ playback: { isLooping: false } });
  });
});

describe('file tools', () => {
  it('opens a new score in a new tab', async () => {
    const app = fakeApp(newScore());

    const { text } = await call(app, 'new_document', { view: 'tab' });

    expect(text).toMatch(/^New score in tab-2\./);
    expect(activeEditor(app.state()).mode).toBe('tab');
  });

  it('shows the Open panel without a path, and refuses a relative path or a PDF', async () => {
    const app = fakeApp(INITIAL_WORKSPACE);

    const panel = await call(app, 'open_file');
    const relative = await call(app, 'open_file', { path: 'Songs/a.gp5' });
    const pdf = await call(app, 'open_file', { path: '/Scans/a.pdf' });

    expect(app.calls).toEqual(['showOpenPanel']);
    expect(panel.text).toMatch(/Open panel/);
    expect(relative).toMatchObject({ isError: true, text: expect.stringContaining('absolute path') });
    expect(pdf).toMatchObject({ isError: true, text: expect.stringContaining('Import PDF') });
  });

  it('opens a path through the window and answers the song, or why it did not open with the sandbox’s rules', async () => {
    // Arrange: the window's open reads the file into a tab, or fails as a file the sandbox refuses does.
    const opened: WorkspaceAction = { type: 'loaded', document: { fileName: 'Riff.gp5', path: '/Songs/Riff.gp5', song: buildNewSong() } };
    const app = fakeApp(INITIAL_WORKSPACE, { isSandboxed: true, openAnswer: () => opened });
    const failing = fakeApp(INITIAL_WORKSPACE, { isSandboxed: true, openAnswer: () => ({ type: 'loadFailed', message: 'no permission' }) });

    // Act
    const ok = await call(app, 'open_file', { path: '/Songs/Riff.gp5' });
    const refused = await call(failing, 'open_file', { path: '/Users/x/Desktop/a.gp' });

    // Assert
    expect(ok.structured).toMatchObject({ tab: 'tab-1', song: { bars: 4 } });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('no permission');
    expect(refused.text).toContain(SANDBOX_NOTE);
  });

  it('saves a file in its own format, and sends a new score to save_as', async () => {
    const saved = fakeApp(openWorkspace(buildNewSong()));
    const fresh = fakeApp(newScore());

    const ok = await call(saved, 'save');
    const refused = await call(fresh, 'save');

    expect(saved.calls).toEqual(['save tab-1']);
    expect(ok.text).toMatch(/^Saved \/Songs\/Riff\.gp5\./);
    expect(refused).toMatchObject({ isError: true, text: expect.stringContaining('save_as') });
  });

  it('saves as the format of the path’s extension, or shows the Save panel', async () => {
    const app = fakeApp(newScore());

    const gp = await call(app, 'save_as', { path: '/Users/me/Documents/GP Editor Projects/Etude.gp' });
    const text = await call(app, 'save_as', { path: '/tmp/Etude.txt' });
    await call(app, 'save_as');

    expect(app.calls).toEqual(['saveTo tab-1 /Users/me/Documents/GP Editor Projects/Etude.gp gp', 'showSaveAsPanel tab-1']);
    expect(gp.text).toMatch(/^Saved .*Etude\.gp as Guitar Pro 7\/8 \(\.gp\)\./);
    expect(text).toMatchObject({ isError: true, text: expect.stringContaining('.gp5, .gp, .gp4, .gp3') });
  });

  it('exports to a path with the format’s extension, and opens the panel for PNG and audio', async () => {
    const app = fakeApp(newScore());

    const midi = await call(app, 'export_file', { format: 'midi', path: '/tmp/Etude.mid' });
    const wrong = await call(app, 'export_file', { format: 'pdf', path: '/tmp/Etude.txt' });
    const pngPath = await call(app, 'export_file', { format: 'png', path: '/tmp/Etude.png' });
    await call(app, 'export_file', { format: 'audio' });
    await call(app, 'export_file', { format: 'musicxml' });

    expect(midi.text).toBe('Exported /tmp/Etude.mid.');
    expect(wrong).toMatchObject({ isError: true, text: 'A pdf export’s path ends in .pdf.' });
    expect(pngPath).toMatchObject({ isError: true, text: expect.stringContaining('without a path') });
    expect(app.calls).toEqual(['exportTo midi /tmp/Etude.mid', 'showExportPanel audio', 'showExportPanel musicxml']);
  });

  it('passes a failed export on, with the sandbox’s rules in the sandboxed app', async () => {
    const app = fakeApp(newScore(), { isSandboxed: true, files: { exportTo: () => Promise.reject(new Error('You don’t have permission to save the file.')) } });

    const { text, isError } = await call(app, 'export_file', { format: 'ascii_tab', path: '/Users/me/Desktop/a.txt' });

    expect(isError).toBe(true);
    expect(text).toBe(`You don’t have permission to save the file.\n${SANDBOX_NOTE}`);
  });
});

describe('command tools', () => {
  afterEach(() => setLanguage('en'));

  it('lists commands with English titles in any language, filtered by words', async () => {
    // Arrange
    setLanguage('ko');
    const app = fakeApp(newScore());

    // Act
    const { structured, text } = await call(app, 'list_commands', { query: 'palm mute' });

    // Assert
    expect(structured).toMatchObject({ commands: [{ id: 'note.palmMute', title: 'Palm Mute', group: 'Note', shortcut: 'M', isEnabled: false }] });
    expect(text).toBe('note.palmMute — Palm Mute (Note) [M] (not available now)');
  });

  it('runs a command as the palette does, and refuses one that cannot run now or does not exist', async () => {
    // Arrange: the palette's actions run editor commands through the window's reducer.
    const app = fakeApp(newScore());
    Object.assign(app.host.commands.actions(), { runCommand: (command: WorkspaceAction) => app.host.dispatch(command) });
    await call(app, 'write_note', { string: 1, fret: 3 });

    // Act
    const muted = await call(app, 'run_command', { id: 'note.palmMute' });
    const missing = await call(app, 'run_command', { id: 'note.nothing' });
    const undo = await call(fakeApp(newScore()), 'run_command', { id: 'edit.redo' });

    // Assert
    const editor = activeEditor(app.state());
    expect(muted.text).toMatch(/^Ran note\.palmMute \(Palm Mute\)\./);
    expect(findNote(editor.document!.song, editor.cursor!)?.effect.palmMute).toBe(true);
    expect(missing).toMatchObject({ isError: true, text: 'No command "note.nothing": see list_commands.' });
    expect(undo).toMatchObject({ isError: true, text: expect.stringContaining('cannot run now') });
  });
});
