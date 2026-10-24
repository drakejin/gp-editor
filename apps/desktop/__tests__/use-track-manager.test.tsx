import ReactTestRenderer from 'react-test-renderer';
import { type Song, addTrack, buildNewSong, deleteTrack, moveTrack, setNoteFret } from '@gp-editor/core';
import { TrackManagerOverlays } from '../src/components/TrackManagerOverlays';
import { type TrackManager, useTrackManager } from '../src/hooks/use-track-manager';
import { type TrackMenuCommand, parseTrackMenuCommand } from '../src/native/track-menu';
import type { EditorAction } from '../src/state/editor';
import { PALETTE } from '../test-support/score-helpers';

let mockMenuListener: ((command: TrackMenuCommand) => void) | undefined;
jest.mock('../src/native/track-menu', () => ({
  ...jest.requireActual('../src/native/track-menu'),
  subscribeTrackMenuCommands: (listener: (command: TrackMenuCommand) => void) => {
    mockMenuListener = listener;
    return () => {
      mockMenuListener = undefined;
    };
  },
}));

/** A new sheet with a bass added: Track 1 (empty) and Bass, which gets a note when `withNote`. */
function twoTracks(withNote = false): Song {
  const song = addTrack(buildNewSong(), { kind: 'bass' });
  return withNote ? setNoteFret(song, { trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 }, 2) : song;
}

function renderManager(song: Song, shownTrackIndex = 1) {
  let manager: TrackManager | undefined;
  const dispatch = jest.fn<void, [EditorAction]>();
  const onClosed = jest.fn();
  const onTracksRemapped = jest.fn();
  function Probe({ shown, tabId }: { readonly shown: Song; readonly tabId: string }) {
    manager = useTrackManager({ song: shown, shownTrackIndex, tabId, dispatch, onClosed, onTracksRemapped });
    return <TrackManagerOverlays manager={manager} palette={PALETTE} />;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe shown={song} tabId="tab-1" />);
  });
  return {
    current: () => manager!,
    dispatch,
    onClosed,
    onTracksRemapped,
    renderer,
    rerender: (next: Song, tabId = 'tab-1') => ReactTestRenderer.act(() => renderer.update(<Probe shown={next} tabId={tabId} />)),
    act: (run: (current: TrackManager) => void) => ReactTestRenderer.act(() => run(manager!)),
  };
}

describe('useTrackManager', () => {
  it('runs the Track menu’s commands on the shown track', () => {
    // Arrange
    const hook = renderManager(twoTracks());

    // Act
    ReactTestRenderer.act(() => ['duplicate', 'delete', 'moveUp', 'moveDown'].forEach((command) => mockMenuListener?.(command as TrackMenuCommand)));

    // Assert
    expect(hook.dispatch.mock.calls).toEqual([
      [{ type: 'duplicateTrack', trackIndex: 1 }],
      [{ type: 'deleteTrack', trackIndex: 1 }],
      [{ type: 'moveTrack', fromIndex: 1, toIndex: 0 }],
    ]);
  });

  it('opens the Add Track panel and adds what it describes, closing it', () => {
    // Arrange
    const hook = renderManager(twoTracks());

    // Act
    ReactTestRenderer.act(() => mockMenuListener?.('add'));
    const isOpen = hook.current().isAddPanelOpen;
    hook.act((manager) => manager.addTrack({ kind: 'drums' }));

    // Assert
    expect(isOpen).toBe(true);
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'addTrack', track: { kind: 'drums' } });
    expect(hook.current().isOpen).toBe(false);
    expect(hook.onClosed).toHaveBeenCalled();
  });

  it('asks before deleting a track with notes, and deletes it where it is now', () => {
    // Arrange
    const song = twoTracks(true);
    const hook = renderManager(song);

    // Act
    hook.act((manager) => manager.panelActions.onDeleteTrack(1));
    const asked = hook.current().pendingDelete;
    hook.rerender(moveTrack(song, 1, 0));
    hook.act((manager) => manager.confirmDelete());

    // Assert
    expect(asked?.trackIndex).toBe(1);
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'deleteTrack', trackIndex: 0 });
    expect(hook.current().pendingDelete).toBeUndefined();
  });

  it('deletes an empty track at once, and closes the question with Esc without deleting', () => {
    // Arrange
    const empty = renderManager(twoTracks());
    const withNotes = renderManager(twoTracks(true));

    // Act
    empty.act((manager) => manager.panelActions.onDeleteTrack(1));
    withNotes.act((manager) => manager.panelActions.onDeleteTrack(1));
    let closed = false;
    withNotes.act((manager) => {
      closed = manager.close();
    });

    // Assert
    expect(empty.dispatch).toHaveBeenCalledWith({ type: 'deleteTrack', trackIndex: 1 });
    expect(closed).toBe(true);
    expect(withNotes.dispatch).not.toHaveBeenCalled();
    expect(withNotes.current().close()).toBe(false);
  });

  it('tells what follows track indexes about a track edit of the shown tab, not about another tab', () => {
    // Arrange
    const song = twoTracks();
    const hook = renderManager(song);

    // Act
    hook.rerender(moveTrack(song, 1, 0));
    hook.rerender(deleteTrack(song, 0), 'tab-2');

    // Assert
    expect(hook.onTracksRemapped.mock.calls).toEqual([[[1, 0]]]);
  });
});

describe('parseTrackMenuCommand', () => {
  it('reads the command of a Track menu event, and nothing else', () => {
    expect(parseTrackMenuCommand({ command: 'moveDown' })).toBe('moveDown');
    expect(parseTrackMenuCommand({ command: 'format' })).toBeUndefined();
    expect(parseTrackMenuCommand('add')).toBeUndefined();
    expect(parseTrackMenuCommand(null)).toBeUndefined();
  });
});
