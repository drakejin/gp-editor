import { type Song } from '@gp-editor/core';
import { INITIAL_WORKSPACE, workspaceReducer } from '../src/state/workspace';
import { call, fakeApp, openWorkspace } from '../test-support/mcp-host';
import { beat, header, makeSong, note } from '../test-support/songs';

/** Two bars of 4/4: bar 1 = E string fret 3 (palm muted) then B string fret 5, quarters; bar 2 = fret 7 on the E string. */
function riff(): Song {
  const song = makeSong([[beat(960, [note(1, 3, { palmMute: true })]), beat(1920, [note(2, 5)])], [beat(4800, [note(1, 7)])]], [header(1), header(2)]);
  return { ...song, info: { ...song.info, title: 'Riff', artist: 'Band' } };
}

describe('get_state', () => {
  it('lists the tabs and the shown document with its cursor, history and playback', async () => {
    // Arrange
    const app = fakeApp(openWorkspace(riff()));

    // Act
    const { structured, isError } = await call(app, 'get_state');

    // Assert
    expect(isError).toBe(false);
    expect(structured).toMatchObject({
      tabs: [{ tab: 'tab-1', title: 'Riff', path: '/Songs/Riff.gp5', isEdited: false, isShown: true }],
      shownTab: 'tab-1',
      document: { title: 'Riff', bars: 2, cursor: { track: 1, bar: 1, beat: 1, voice: 1, string: 1 }, canUndo: false, canRedo: false },
      playback: { isPlaying: false, speedPercent: 100, isLooping: false },
    });
  });

  it('answers with no document when nothing is open', async () => {
    const { structured } = await call(fakeApp(INITIAL_WORKSPACE), 'get_state');

    expect(structured).toMatchObject({ tabs: [], shownTab: null, document: null });
  });
});

describe('get_song', () => {
  it('gives the information, the tracks with their tuning from string 1 and where the meter changes', async () => {
    const { structured } = await call(fakeApp(openWorkspace(riff())), 'get_song');

    expect(structured).toMatchObject({
      title: 'Riff',
      artist: 'Band',
      bars: 2,
      tracks: [{ track: 1, isPercussion: false, strings: [{ string: 1, tuning: 'E4', midi: 64 }, { string: 2, tuning: 'B3' }, {}, {}, {}, { string: 6, tuning: 'E2' }], capo: 0, bars: 2 }],
      timeSignatures: [{ bar: 1, timeSignature: '4/4' }],
    });
  });

  it('tells the client to open a document first when none is', async () => {
    const { text, isError } = await call(fakeApp(INITIAL_WORKSPACE), 'get_song');

    expect(isError).toBe(true);
    expect(text).toMatch(/new_document or open_file/);
  });
});

describe('get_bars', () => {
  it('reads beats with their place in the bar, duration, notes and effects', async () => {
    const { structured } = await call(fakeApp(openWorkspace(riff())), 'get_bars', { fromBar: 1, toBar: 2 });

    expect(structured).toMatchObject({
      track: 1,
      bars: [
        {
          bar: 1,
          timeSignature: '4/4',
          voices: [
            {
              voice: 1,
              beats: [
                { beat: 1, at: 0, duration: { value: 4, dots: 0 }, notes: [{ string: 1, fret: 3, effects: ['palmMute'] }] },
                { beat: 2, at: 1, duration: { value: 4, dots: 0 }, notes: [{ string: 2, fret: 5 }] },
              ],
            },
          ],
        },
        { bar: 2, voices: [{ voice: 1, beats: [{ beat: 1, notes: [{ string: 1, fret: 7 }] }] }] },
      ],
    });
  });

  it('refuses a bar the song does not have, and more than 32 bars at once', async () => {
    const app = fakeApp(openWorkspace(riff()));
    const long = workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: makeSong(Array.from({ length: 40 }, (_, i) => [beat(960 + i * 3840, [])])) } });

    const missing = await call(app, 'get_bars', { fromBar: 3 });
    const tooMany = await call(fakeApp(long), 'get_bars', { fromBar: 1, toBar: 40 });

    expect(missing).toMatchObject({ isError: true, text: 'Bar 3 does not exist: the song has 2 bar(s).' });
    expect(tooMany).toMatchObject({ isError: true, text: expect.stringContaining('At most 32 bars') });
  });

  it('refuses arguments that do not fit its schema before reading', async () => {
    const { text, isError } = await call(fakeApp(openWorkspace(riff())), 'get_bars', { fromBar: 0 });

    expect(isError).toBe(true);
    expect(text).toBe('Invalid arguments: arguments.fromBar must be at least 1');
  });
});

describe('get_ascii_tab', () => {
  it('writes the bars asked for as the ASCII tab export does', async () => {
    const { text, isError } = await call(fakeApp(openWorkspace(riff())), 'get_ascii_tab', { fromBar: 2 });

    expect(isError).toBe(false);
    expect(text).toContain('Track 1:');
    const lines = text.split('\n').filter((line) => line.includes('|'));
    expect(lines[0]).toMatch(/^E\|-*7-*\|$/);
    expect(lines).toHaveLength(6);
  });
});

describe('move_cursor, select_bars and clear_selection', () => {
  it('moves the cursor and answers the beat under it', async () => {
    // Arrange
    const app = fakeApp(openWorkspace(riff()));

    // Act
    const { structured } = await call(app, 'move_cursor', { bar: 1, beat: 2, string: 2 });

    // Assert
    expect(structured).toEqual({ cursor: { track: 1, bar: 1, beat: 2, voice: 1, string: 2 }, beat: { beat: 2, at: 1, duration: { value: 4, dots: 0 }, notes: [{ string: 2, fret: 5 }] } });
    expect(app.state().tabs[0]?.editor.past).toHaveLength(0);
  });

  it('starts another bar at its first beat and refuses a beat the bar does not have', async () => {
    const app = fakeApp(openWorkspace(riff()));
    await call(app, 'move_cursor', { beat: 2 });

    const moved = await call(app, 'move_cursor', { bar: 2 });
    const refused = await call(app, 'move_cursor', { bar: 2, beat: 3 });

    expect(moved.structured).toMatchObject({ cursor: { bar: 2, beat: 1 } });
    expect(refused).toMatchObject({ isError: true, text: 'beat 3 does not exist: bar 2 of track 1 has one beat (1–1).' });
  });

  it('selects whole bars and clears the selection', async () => {
    const app = fakeApp(openWorkspace(riff()));

    const selected = await call(app, 'select_bars', { fromBar: 1, toBar: 2 });
    await call(app, 'clear_selection');

    expect(selected.structured).toMatchObject({ document: { selection: { from: { bar: 1, beat: 1 }, to: { bar: 2, beat: 1 } } } });
    expect(app.state().tabs[0]?.editor.selectionAnchor).toBeUndefined();
  });
});

describe('switch_tab', () => {
  it('shows another tab and refuses one that is not open', async () => {
    const two = workspaceReducer(openWorkspace(riff()), { type: 'created', mode: 'tab' });
    const app = fakeApp(two);

    const shown = await call(app, 'switch_tab', { tab: 'tab-1' });
    const missing = await call(app, 'switch_tab', { tab: 'tab-9' });

    expect(shown.structured).toMatchObject({ shownTab: 'tab-1' });
    expect(missing).toMatchObject({ isError: true, text: 'No tab "tab-9". Open tabs: tab-1, tab-2.' });
  });
});
