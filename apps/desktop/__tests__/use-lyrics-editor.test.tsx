import ReactTestRenderer from 'react-test-renderer';
import { type Song, addTrack, deleteTrack, moveTrack, setTrackLyrics } from '@gp-editor/core';
import { LYRICS_APPLY_DELAY, type LyricsEditor, useLyricsEditor } from '../src/hooks/use-lyrics-editor';
import type { WorkspaceAction } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

/** One track of three bars, one note each, singing "old words" from bar 2. */
const SONG: Song = setTrackLyrics(makeSong([[beat(960, [note(1, 0)])], [beat(4800, [note(1, 2)])], [beat(8640, [note(1, 3)])]]), 0, { from: 2, text: 'old words' });

interface Harness {
  readonly current: () => LyricsEditor;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
  readonly rerender: (song: Song, tabId?: string) => void;
}

/** `firstTab` null: no tabs (the action goes to the shown document). */
function renderEditor(song: Song = SONG, firstTab: string | null = 'tab-1'): Harness {
  const tabId = firstTab ?? undefined;
  let editor: LyricsEditor | undefined;
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  function Probe({ shown, tab }: { readonly shown: Song; readonly tab: string | undefined }) {
    editor = useLyricsEditor(shown, 0, tab, dispatch);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe shown={song} tab={tabId} />);
  });
  return {
    current: () => {
      if (editor === undefined) {
        throw new Error('the hook did not run');
      }
      return editor;
    },
    dispatch,
    rerender: (next: Song, tab: string | undefined = tabId) => ReactTestRenderer.act(() => renderer.update(<Probe shown={next} tab={tab} />)),
  };
}

const lyricsAction = (from: number, text: string, tabId = 'tab-1'): WorkspaceAction => ({ type: 'inTab', tabId, action: { type: 'setTrackLyrics', trackIndex: 0, lyrics: { from, text } } });

describe('useLyricsEditor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens on the track’s lyrics and applies typing once it pauses, as one edit', () => {
    // Arrange
    const editor = renderEditor();
    ReactTestRenderer.act(() => editor.current().open());

    // Act
    ReactTestRenderer.act(() => editor.current().changeText('new'));
    ReactTestRenderer.act(() => editor.current().changeText('new 사랑'));
    const beforePause = editor.dispatch.mock.calls.length;
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));

    // Assert
    expect(beforePause).toBe(0);
    expect(editor.current().draft).toEqual({ trackIndex: 0, from: 2, text: 'new 사랑' });
    expect(editor.dispatch.mock.calls).toEqual([[lyricsAction(2, 'new 사 랑')]]);
  });

  it('applies what is pending when the panel closes or another track is chosen', () => {
    const editor = renderEditor();
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeText('la la'));
    ReactTestRenderer.act(() => editor.current().close());
    expect(editor.dispatch.mock.calls).toEqual([[lyricsAction(2, 'la la')]]);
    expect(editor.current().isOpen).toBe(false);
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
  });

  it('keeps the first bar inside the song', () => {
    const editor = renderEditor();
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeFrom(7));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));
    expect(editor.current().draft?.from).toBe(3);
    expect(editor.dispatch.mock.calls).toEqual([[lyricsAction(3, 'old words')]]);
  });

  it('shows the song’s lyrics again after an undo, but not after its own edit', () => {
    // Arrange
    const editor = renderEditor();
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeText('typed'));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));

    // Act: the edit lands, then an undo brings the old lyrics back
    editor.rerender(setTrackLyrics(SONG, 0, { from: 2, text: 'typed' }));
    const afterEdit = editor.current().draft?.text;
    editor.rerender(SONG);

    // Assert
    expect(afterEdit).toBe('typed');
    expect(editor.current().draft).toEqual({ trackIndex: 0, from: 2, text: 'old words' });
  });

  it('sends a pending edit to the tab it was typed in, then follows the newly shown tab', () => {
    const editor = renderEditor();
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeText('first tab'));
    const other = setTrackLyrics(SONG, 0, { from: 1, text: 'other tab' });
    editor.rerender(other, 'tab-2');
    expect(editor.dispatch.mock.calls).toEqual([[lyricsAction(2, 'first tab')]]);
    expect(editor.current().draft).toEqual({ trackIndex: 0, from: 1, text: 'other tab' });
  });

  it('chooses another track, and sends the plain action without tabs', () => {
    const twoTracks: Song = { ...SONG, tracks: [SONG.tracks[0]!, { ...SONG.tracks[0]!, number: 2, lyrics: { from: 1, text: 'second' } }] };
    const editor = renderEditor(twoTracks, null);
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().chooseTrack(1));
    ReactTestRenderer.act(() => editor.current().changeText('two'));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));
    expect(editor.dispatch.mock.calls).toEqual([[{ type: 'setTrackLyrics', trackIndex: 1, lyrics: { from: 1, text: 'two' } }]]);
  });
});

describe('useLyricsEditor when the tracks change', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** SONG with a bass added after it: Guitar (lyrics) and Bass. */
  const TWO_TRACKS = addTrack(SONG, { kind: 'bass' });

  it('follows its track when another one moves before it, and sends what was typed there', () => {
    // Arrange
    const editor = renderEditor(TWO_TRACKS);
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeText('moved words'));

    // Act
    editor.rerender(moveTrack(TWO_TRACKS, 1, 0));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));

    // Assert
    expect(editor.current().draft).toEqual({ trackIndex: 1, from: 2, text: 'moved words' });
    expect(editor.dispatch.mock.calls).toEqual([[{ type: 'inTab', tabId: 'tab-1', action: { type: 'setTrackLyrics', trackIndex: 1, lyrics: { from: 2, text: 'moved words' } } }]]);
  });

  it('drops what was typed for a deleted track and shows the shown track’s lyrics', () => {
    // Arrange
    const editor = renderEditor(TWO_TRACKS);
    ReactTestRenderer.act(() => editor.current().open());
    ReactTestRenderer.act(() => editor.current().changeText('gone'));

    // Act
    editor.rerender(deleteTrack(TWO_TRACKS, 0));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(LYRICS_APPLY_DELAY));

    // Assert
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(editor.current().draft).toMatchObject({ trackIndex: 0, text: '' });
  });
});
