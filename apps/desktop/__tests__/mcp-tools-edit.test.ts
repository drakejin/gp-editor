import { addTrack } from '@gp-editor/core';
import { INITIAL_WORKSPACE, type WorkspaceState, activeEditor, workspaceReducer } from '../src/state/workspace';
import { type FakeApp, call, fakeApp } from '../test-support/mcp-host';
import { beat, makeSong, note } from '../test-support/songs';

/** File ▸ New: four empty bars of 4/4 on a guitar track, shown in tab-1. */
function newScore(): WorkspaceState {
  return workspaceReducer(INITIAL_WORKSPACE, { type: 'created', mode: 'notationAndTab' });
}

const undoSteps = (app: FakeApp) => activeEditor(app.state()).past.length;
const firstBar = (app: FakeApp) => activeEditor(app.state()).document?.song.tracks[0]?.measures[0];

describe('writing a melody: set_duration, then write_note with advance', () => {
  it('writes quarter notes beat by beat, one undo step per edit, the cursor moving on', async () => {
    // Arrange
    const app = fakeApp(newScore());

    // Act
    const duration = await call(app, 'set_duration', { value: 4, bar: 1, beat: 1 });
    const first = await call(app, 'write_note', { string: 1, fret: 3, advance: true });
    const second = await call(app, 'write_note', { string: 2, fret: 5, advance: true });

    // Assert
    expect(duration.isError).toBe(false);
    expect(first.structured).toEqual({
      written: { beat: 1, at: 0, duration: { value: 4, dots: 0 }, notes: [{ string: 1, fret: 3 }] },
      cursor: { track: 1, bar: 1, beat: 2, voice: 1, string: 1 },
    });
    expect(second.structured).toMatchObject({ written: { beat: 2, notes: [{ string: 2, fret: 5 }] }, cursor: { beat: 3 } });
    expect(firstBar(app)?.beats.map((each) => each.voices[0]?.notes.map((n) => `${n.string}:${n.fret}`))).toEqual([['1:3'], ['2:5'], [], []]);
    expect(undoSteps(app)).toBe(3);
  });

  it('sets value, dots and tuplet as one duration', async () => {
    const app = fakeApp(newScore());

    const { structured } = await call(app, 'set_duration', { value: 8, dots: 1, tuplet: 3 });

    expect(structured).toMatchObject({ beat: { duration: { value: 8, dots: 1, tuplet: '3:2' } } });
    expect(undoSteps(app)).toBe(1);
  });

  it('says nothing changed for the duration the beat already has', async () => {
    const { text, isError } = await call(fakeApp(newScore()), 'set_duration', { value: 1 });

    expect(isError).toBe(true);
    expect(text).toBe('Nothing changed: the beat already has that duration.');
  });

  it('refuses a place the song does not have, without editing', async () => {
    const app = fakeApp(newScore());

    const { text, isError } = await call(app, 'write_note', { string: 1, fret: 3, bar: 9 });

    expect(isError).toBe(true);
    expect(text).toBe('bar 9 does not exist: the song has 4 bars (1–4).');
    expect(undoSteps(app)).toBe(0);
  });

  it('refuses a fret over the neck and a string the track does not have', async () => {
    const app = fakeApp(newScore());

    expect(await call(app, 'write_note', { string: 1, fret: 30 })).toMatchObject({ isError: true, text: 'Invalid arguments: arguments.fret must be at most 29' });
    expect(await call(app, 'write_note', { string: 7, fret: 3 })).toMatchObject({ isError: true, text: 'string 7 does not exist: track 1 has 6 strings (1–6).' });
  });
});

describe('notes, rests and beats', () => {
  it('turns a beat into a rest, deletes a note, inserts and deletes a beat', async () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3), note(2, 5)]), beat(1920, [note(1, 5)])]]);
    const app = fakeApp(workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } }));

    // Act
    const deleted = await call(app, 'delete_note', { string: 2, bar: 1, beat: 1 });
    const rest = await call(app, 'write_rest', { beat: 2 });
    const inserted = await call(app, 'insert_beat', { beat: 1 });
    const removed = await call(app, 'delete_beat', { beat: 1 });

    // Assert
    expect(deleted.structured).toMatchObject({ beat: { notes: [{ string: 1, fret: 3 }] } });
    expect(rest.structured).toMatchObject({ beat: { beat: 2, rest: true } });
    expect(inserted.structured).toMatchObject({ cursor: { beat: 2 }, beat: { rest: true } });
    expect(removed.structured).toMatchObject({ cursor: { beat: 1 }, beat: { rest: true } });
    expect(undoSteps(app)).toBe(4);
  });

  it('writes drums with toggle_drum_note only on a drum track, and notes with write_note only on others', async () => {
    // Arrange
    const withDrums = addTrack(makeSong([[beat(960, [])]]), { kind: 'drums', name: 'Drums' });
    const app = fakeApp(workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: withDrums } }));

    // Act
    const onGuitar = await call(app, 'toggle_drum_note', { key: 36 });
    const kick = await call(app, 'toggle_drum_note', { key: 36, track: 2 });
    const fretOnDrums = await call(app, 'write_note', { string: 1, fret: 3, track: 2 });

    // Assert
    expect(onGuitar).toMatchObject({ isError: true, text: expect.stringContaining('not a drum track') });
    expect(kick.isError).toBe(false);
    expect(fretOnDrums).toMatchObject({ isError: true, text: expect.stringContaining('toggle_drum_note') });
  });
});

describe('bars, tempo, meter, key, names', () => {
  it('inserts a bar after the one named and deletes a run of bars in one undo step', async () => {
    const app = fakeApp(newScore());

    const inserted = await call(app, 'insert_bar', { afterBar: 2 });
    const deleted = await call(app, 'delete_bars', { fromBar: 2, toBar: 4 });

    expect(inserted).toMatchObject({ isError: false, text: 'Bar 3 is new; the song has 5 bars.\n{"bars":5}' });
    expect(deleted.structured).toEqual({ bars: 2 });
    expect(undoSteps(app)).toBe(2);
  });

  it('never deletes every bar', async () => {
    const { text, isError } = await call(fakeApp(newScore()), 'delete_bars', { fromBar: 1, toBar: 4 });

    expect(isError).toBe(true);
    expect(text).toMatch(/^Nothing changed/);
  });

  it('sets the tempo, time signature and key from a bar on', async () => {
    const app = fakeApp(newScore());

    const tempo = await call(app, 'set_tempo', { bpm: 92.5, bar: 3 });
    const meter = await call(app, 'set_time_signature', { numerator: 6, denominator: 8, bar: 2 });
    const key = await call(app, 'set_key_signature', { key: -3 });

    expect(tempo.structured).toMatchObject({ tempos: [{ bar: 1, bpm: 120 }, { bar: 3, bpm: 92.5 }] });
    expect(meter.structured).toMatchObject({ timeSignatures: [{ bar: 1, timeSignature: '4/4' }, { bar: 2, timeSignature: '6/8' }] });
    expect(key.structured).toMatchObject({ keySignatures: [{ bar: 1, keySignature: 0 }, { bar: 2, keySignature: -3 }] });
  });

  it('passes on why a shorter time signature was refused', async () => {
    const song = makeSong([[960, 1920, 2880, 3840].map((start) => beat(start, [note(1, 3)]))]);
    const app = fakeApp(workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } }));

    const { text, isError } = await call(app, 'set_time_signature', { numerator: 3, denominator: 4 });

    expect(isError).toBe(true);
    expect(text).toBe('Nothing changed: Bar 1 is full: its notes do not fit in 3/4. Delete or shorten beats first.');
  });

  it('renames a track and sets the song’s information', async () => {
    const app = fakeApp(newScore());

    await call(app, 'set_track_name', { name: 'Lead' });
    const info = await call(app, 'set_song_info', { title: 'Etude', artist: 'Me' });
    const empty = await call(app, 'set_song_info', {});

    const song = activeEditor(app.state()).document?.song;
    expect([song?.tracks[0]?.name, song?.info.title, song?.info.artist]).toEqual(['Lead', 'Etude', 'Me']);
    expect(info.text).toBe('Set title, artist.');
    expect(empty.isError).toBe(true);
  });
});

describe('undo and redo', () => {
  it('undo and redo the last edit, and say when there is nothing to', async () => {
    const app = fakeApp(newScore());
    await call(app, 'write_note', { string: 1, fret: 3 });

    const undone = await call(app, 'undo');
    const again = await call(app, 'undo');
    const redone = await call(app, 'redo');

    expect(undone.isError).toBe(false);
    expect(again).toMatchObject({ isError: true, text: 'Nothing to undo.' });
    expect(redone.structured).toMatchObject({ beat: { notes: [{ string: 1, fret: 3 }] } });
  });

  it('edits the tab named, showing it first', async () => {
    const app = fakeApp(workspaceReducer(newScore(), { type: 'created', mode: 'tab' }));

    await call(app, 'write_note', { string: 1, fret: 3, tab: 'tab-1' });

    expect(app.state().activeTabId).toBe('tab-1');
    expect(app.state().tabs.map((tab) => tab.editor.past.length)).toEqual([1, 0]);
  });
});
