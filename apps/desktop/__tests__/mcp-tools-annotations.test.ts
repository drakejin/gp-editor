import { songAnnotations } from '@gp-editor/core';
import { INITIAL_WORKSPACE, type WorkspaceState, activeEditor, workspaceReducer } from '../src/state/workspace';
import { type FakeApp, call, fakeApp } from '../test-support/mcp-host';

/** File ▸ New: four empty bars of 4/4 on a guitar track, shown in tab-1. */
function newScore(): WorkspaceState {
  return workspaceReducer(INITIAL_WORKSPACE, { type: 'created', mode: 'notationAndTab' });
}

const song = (app: FakeApp) => activeEditor(app.state()).document!.song;
const undoSteps = (app: FakeApp) => activeEditor(app.state()).past.length;
const places = (app: FakeApp) => songAnnotations(song(app)).map(({ measureIndex, beatIndex, annotation }) => `${measureIndex + 1}:${beatIndex + 1} ${annotation.placement} ${annotation.text}`);

describe('annotation tools', () => {
  it('writes an annotation on a beat in one undo step, the cursor going there, and reads it back', async () => {
    // Arrange
    const app = fakeApp(newScore());

    // Act
    const written = await call(app, 'set_annotation', { bar: 2, beat: 1, text: 'Watch the bend\nsofter the second time' });
    const below = await call(app, 'set_annotation', { bar: 3, text: 'breathe', placement: 'below' });
    const read = await call(app, 'get_annotations');

    // Assert
    expect(written.isError).toBe(false);
    expect(written.structured).toEqual({ annotation: { track: 1, bar: 2, beat: 1, text: 'Watch the bend\nsofter the second time', placement: 'above' } });
    expect(below.structured).toMatchObject({ annotation: { bar: 3, beat: 1, placement: 'below' } });
    expect(activeEditor(app.state()).cursor).toMatchObject({ measureIndex: 2, beatIndex: 0 });
    expect(undoSteps(app)).toBe(2);
    expect(read.structured).toEqual({
      annotations: [
        { track: 1, bar: 2, beat: 1, text: 'Watch the bend\nsofter the second time', placement: 'above' },
        { track: 1, bar: 3, beat: 1, text: 'breathe', placement: 'below' },
      ],
    });
  });

  it('changes and deletes one (an empty text), and says when nothing changed', async () => {
    // Arrange
    const app = fakeApp(newScore());
    await call(app, 'set_annotation', { bar: 1, text: 'slow' });

    // Act
    const same = await call(app, 'set_annotation', { bar: 1, text: 'slow' });
    const deleted = await call(app, 'set_annotation', { bar: 1, text: '' });
    const nothing = await call(app, 'set_annotation', { bar: 1, text: '  ' });

    // Assert
    expect(same).toMatchObject({ isError: true, text: 'Nothing changed: the beat already has that annotation.' });
    expect(deleted.text).toBe('Deleted the annotation of bar 1, beat 1.');
    expect(nothing.isError).toBe(true);
    expect(places(app)).toEqual([]);
    expect(undoSteps(app)).toBe(2);
  });

  it('moves an annotation to another beat in one undo step, never onto one that has its own', async () => {
    // Arrange
    const app = fakeApp(newScore());
    await call(app, 'set_annotation', { bar: 1, text: 'first' });
    await call(app, 'set_annotation', { bar: 4, text: 'last' });

    // Act
    const moved = await call(app, 'move_annotation', { fromBar: 1, fromBeat: 1, bar: 2, beat: 1 });
    const blocked = await call(app, 'move_annotation', { fromBar: 2, fromBeat: 1, bar: 4, beat: 1 });
    const missing = await call(app, 'move_annotation', { fromBar: 3, fromBeat: 1, bar: 3, beat: 1 });

    // Assert
    expect(moved.structured).toEqual({ annotation: { track: 1, bar: 2, beat: 1, text: 'first', placement: 'above' } });
    expect(blocked).toMatchObject({ isError: true, text: 'Nothing changed: bar 4, beat 1 already has an annotation.' });
    expect(missing).toMatchObject({ isError: true, text: 'Nothing changed: bar 3, beat 1 has no annotation.' });
    expect(places(app)).toEqual(['2:1 above first', '4:1 above last']);
    expect(undoSteps(app)).toBe(3);
  });

  it('refuses a place the song does not have', async () => {
    const app = fakeApp(newScore());
    expect(await call(app, 'set_annotation', { bar: 9, text: 'x' })).toMatchObject({ isError: true, text: 'bar 9 does not exist: the song has 4 bars (1–4).' });
    expect(await call(app, 'get_annotations', { track: 3 })).toMatchObject({ isError: true });
  });
});

describe('get_bars and annotations', () => {
  it('shows a beat’s annotation with its other marks', async () => {
    const app = fakeApp(newScore());
    await call(app, 'set_annotation', { bar: 1, text: 'slow', placement: 'below' });
    const bars = await call(app, 'get_bars', { fromBar: 1, toBar: 1 });
    expect(JSON.stringify(bars.structured)).toContain('"annotation":{"text":"slow","placement":"below"}');
  });
});
