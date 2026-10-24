import ReactTestRenderer from 'react-test-renderer';
import { type Song, type StringAddress, TREMOLO_BAR_PRESETS, findNote } from '@gp-editor/core';
import { type NotePreview, useNotePreview } from '../src/hooks/use-note-preview';
import { beat, makeSong, note } from '../test-support/songs';

const SONG = makeSong([[beat(960, [note(1, 5)]), beat(1920, [note(1, 7)])]]);
const CURSOR: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0, string: 1 };

/** The hook's latest value, re-read after every act(). */
function renderPreview(song: Song | undefined, cursor: StringAddress | undefined): () => NotePreview {
  let preview: NotePreview | undefined;
  function Probe() {
    preview = useNotePreview(song, cursor);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => {
    if (preview === undefined) {
      throw new Error('the hook did not run');
    }
    return preview;
  };
}

describe('useNotePreview', () => {
  it('shows the song as it is until a panel previews an edit', () => {
    expect(renderPreview(SONG, CURSOR)().song).toBe(SONG);
  });

  it('shows the song with the panel’s edit at the cursor, and as it is again once the preview ends', () => {
    // Arrange
    const current = renderPreview(SONG, CURSOR);

    // Act
    ReactTestRenderer.act(() => current().show({ type: 'setTremoloBar', tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const previewed = current().song;
    ReactTestRenderer.act(() => current().show(undefined));

    // Assert
    expect(previewed === undefined ? undefined : findNote(previewed, CURSOR)?.effect.tremoloBar).toEqual(TREMOLO_BAR_PRESETS.dip);
    expect(findNote(SONG, CURSOR)?.effect.tremoloBar).toBeUndefined();
    expect(current().song).toBe(SONG);
  });

  it('shows nothing to preview without a song or a cursor', () => {
    const current = renderPreview(undefined, undefined);
    ReactTestRenderer.act(() => current().show({ type: 'setTremoloBar', tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    expect(current().song).toBeUndefined();
  });
});
