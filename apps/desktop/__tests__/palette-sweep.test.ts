import { readSong } from '@gp-editor/core';
import { PALETTE_GROUPS } from '../src/components/palette/palette-groups';
import { type PaletteContext, isToolEnabled, paletteContext } from '../src/components/palette/palette-tools';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import type { SongEdit } from '../src/state/song-edits';
import { readFixture } from '../test-support/fixtures';

/** nightwish.gp5, track 1, the cursor on the note at bar 7, beat 4, string 3 (fret 15) — a note in a real file. */
function onRealNote(): EditorState {
  const song = readSong(readFixture('guitarpro5', 'nightwish.gp5'));
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'nightwish.gp5', path: '/n.gp5', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 6, beatIndex: 3, voiceIndex: 0, string: 3 } });
}

const BASE = onRealNote();
const CONTEXT: PaletteContext = paletteContext(BASE.document!.song, BASE.cursor);

/** The press changed the song or the cursor, or said why it could not (a hint). */
function changesOrExplains(action: EditorAction): boolean {
  const next = editorReducer(BASE, action);
  return next.document?.song !== BASE.document?.song || next.cursor !== BASE.cursor || next.hint !== undefined;
}

/** Choosing what is already set (a duration, a dynamic, a stroke) rightly does nothing; a toggle always changes. */
function isChoosingCurrent(edit: SongEdit, isActive: boolean): boolean {
  return isActive && edit.type.startsWith('set');
}

const asEdit = (edit: SongEdit): EditorAction => ({ type: 'edit', edit });

/** Every button the palette shows, as "group / tool [/ option]" with what pressing it dispatches. */
function everyPress(): readonly { readonly name: string; readonly action: EditorAction; readonly isAlreadySo: boolean }[] {
  return PALETTE_GROUPS.flatMap((group) => [
    ...group.tools.flatMap((tool) => {
      const name = `${group.title} / ${tool.id}`;
      const isActive = tool.isActive?.(CONTEXT) ?? false;
      switch (tool.run.kind) {
        case 'edit':
          return [{ name, action: asEdit(tool.run.edit), isAlreadySo: isChoosingCurrent(tool.run.edit, isActive) }];
        case 'action':
          return [{ name, action: tool.run.action, isAlreadySo: isActive }];
        case 'options':
          return tool.run.options.map((option) => ({ name: `${name} / ${option.label}`, action: asEdit(option.edit), isAlreadySo: option.isActive?.(CONTEXT) ?? false }));
        case 'text':
          return [{ name, action: asEdit(tool.run.edit('Verse 1')), isAlreadySo: tool.run.value(CONTEXT) === 'Verse 1' }];
      }
    }),
    ...(group.steppers ?? []).flatMap((stepper) =>
      (stepper.isEnabled?.(CONTEXT) ?? true)
        ? [
            { name: `${group.title} / ${stepper.id} −`, action: asEdit(stepper.minus), isAlreadySo: false },
            { name: `${group.title} / ${stepper.id} +`, action: asEdit(stepper.plus), isAlreadySo: false },
          ]
        : [],
    ),
  ]);
}

describe('edition palette: every button does something on a real note', () => {
  it('has every tool enabled with the cursor on a note', () => {
    const disabled = PALETTE_GROUPS.flatMap((group) => group.tools).filter((tool) => !isToolEnabled(tool, CONTEXT)).map((tool) => tool.id);
    expect(disabled).toEqual([]);
  });

  it('changes the song or the cursor (or says why not) for every press, unless it chooses what the note already has', () => {
    // Act
    const presses = everyPress();
    const doingNothing = presses.filter((press) => !press.isAlreadySo && !changesOrExplains(press.action)).map((press) => press.name);

    // Assert
    expect(presses.length).toBeGreaterThan(80);
    expect(doingNothing).toEqual([]);
  });
});
