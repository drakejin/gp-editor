import ReactTestRenderer from 'react-test-renderer';
import { type BeatFragment, NO_STROKE, QUARTER, parseBeatFragment, serializeBeatFragment } from '@gp-editor/core';
import { type Clipboard, parseClipboardText, useClipboard } from '../src/hooks/use-clipboard';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { selectedFragment } from '../src/state/selection';
import { beat, makeSong, note } from '../test-support/songs';

const mockWriteBeats = jest.fn<Promise<void>, [string, string]>();
const mockReadBeats = jest.fn<Promise<string | null>, []>();

jest.mock('../src/native/clipboard', () => ({
  writeBeats: (json: string, summary: string) => mockWriteBeats(json, summary),
  readBeats: () => mockReadBeats(),
}));

function loaded(): EditorState {
  const song = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(2, 5)]), beat(2880, []), beat(3840, [])]]);
  const opened = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(opened, { type: 'extendSelection', step: 1 });
}

function renderHook(state: EditorState): { clipboard: Clipboard; dispatch: jest.Mock<void, [EditorAction]> } {
  const dispatch = jest.fn<void, [EditorAction]>();
  let latest: Clipboard | undefined;
  function Probe() {
    latest = useClipboard(state, dispatch);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  if (latest === undefined) {
    throw new Error('the hook did not run');
  }
  return { clipboard: latest, dispatch };
}

async function settle(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockWriteBeats.mockReset().mockResolvedValue(undefined);
  mockReadBeats.mockReset().mockResolvedValue(null);
});

describe('useClipboard', () => {
  it('copies the selected beats as JSON with a readable summary', async () => {
    // Arrange
    const state = loaded();
    const { clipboard, dispatch } = renderHook(state);

    // Act
    clipboard.copy();
    await settle();

    // Assert
    expect(mockWriteBeats).toHaveBeenCalledTimes(1);
    const [json, summary] = mockWriteBeats.mock.calls[0]!;
    expect(parseBeatFragment(JSON.parse(json))).toEqual(selectedFragment(state));
    expect(summary).toBe('2 beats from bar 1');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cuts by copying and then deleting the same beats', async () => {
    const { clipboard, dispatch } = renderHook(loaded());
    clipboard.cut();
    await settle();
    expect(mockWriteBeats).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'cutSelection' });
  });

  it('copies and cuts nothing without a document', async () => {
    const { clipboard, dispatch } = renderHook(INITIAL_EDITOR_STATE);
    clipboard.copy();
    clipboard.cut();
    await settle();
    expect(mockWriteBeats).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('pastes beats read from the clipboard', async () => {
    // Arrange
    const fragment = selectedFragment(loaded())!;
    mockReadBeats.mockResolvedValue(serializeBeatFragment(fragment));
    const { clipboard, dispatch } = renderHook(loaded());

    // Act
    clipboard.paste();
    await settle();

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: 'pasteBeats', fragment });
  });

  it('says there is nothing to paste when the clipboard holds no beats', async () => {
    mockReadBeats.mockResolvedValue(null);
    const { clipboard, dispatch } = renderHook(loaded());
    clipboard.paste();
    await settle();
    expect(dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'Nothing to paste: copy beats first.' });
  });

  it.each(['just text', '{"format":"gp-editor.beats","version":1,"isPercussion":false,"items":[{}]}'])('says the beats could not be read when the clipboard holds %j', async (text) => {
    mockReadBeats.mockResolvedValue(text);
    const { clipboard, dispatch } = renderHook(loaded());
    clipboard.paste();
    await settle();
    expect(dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'The beats on the clipboard could not be read, so nothing was pasted.' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'pasteBeats' }));
  });

  it('reports a clipboard that cannot be written or read', async () => {
    // Arrange
    mockWriteBeats.mockRejectedValue(new Error('pasteboard busy'));
    mockReadBeats.mockRejectedValue(new Error('no access'));
    const { clipboard, dispatch } = renderHook(loaded());

    // Act
    clipboard.copy();
    clipboard.paste();
    await settle();

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: 'clipboardFailed', message: 'pasteboard busy' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'clipboardFailed', message: 'no access' });
  });
});

describe('parseClipboardText', () => {
  it('reads beats however many there are: 30 000 beats, megabytes of text', () => {
    // Arrange
    const fragment: BeatFragment = { isPercussion: false, items: Array.from({ length: 30_000 }, (_, i) => ({ duration: QUARTER, notes: [note(1, i % 12)], stroke: NO_STROKE, pickStroke: 'none' })) };
    const text = serializeBeatFragment(fragment);

    // Act
    const parsed = parseClipboardText(text);

    // Assert
    expect(text.length).toBeGreaterThan(4_000_000);
    expect(parsed?.items).toHaveLength(30_000);
  });
});
