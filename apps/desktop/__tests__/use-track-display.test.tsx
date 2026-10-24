import ReactTestRenderer from 'react-test-renderer';
import { type TrackDisplayView, useTrackDisplay } from '../src/hooks/use-track-display';
import type { TrackViewEventHandlers } from '../src/native/gp-files';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const mockMenu: { handlers?: TrackViewEventHandlers } = {};

jest.mock('../src/native/gp-files', () => ({
  subscribeTrackViewRequests: (handlers: TrackViewEventHandlers) => {
    mockMenu.handlers = handlers;
    return () => {
      mockMenu.handlers = undefined;
    };
  },
}));

function loaded(): EditorState {
  const song = withTrack(withTrack(makeSong([[beat(960, [note(1, 0)])]]), [[beat(960, [note(2, 0)])]]), [[beat(960, [note(3, 0)])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function renderView(state: EditorState): { readonly current: () => TrackDisplayView; readonly dispatch: jest.Mock } {
  const dispatch = jest.fn();
  let view: TrackDisplayView | undefined;
  function Probe() {
    view = useTrackDisplay(state, dispatch);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return {
    current: () => {
      if (view === undefined) {
        throw new Error('the hook did not run');
      }
      return view;
    },
    dispatch,
  };
}

describe('useTrackDisplay', () => {
  it('gives the score the selected track alone, then every track not hidden in Multitrack, each in its staves', () => {
    // Arrange
    const multitrack = [{ type: 'toggleMultitrack' }, { type: 'toggleTrackShown', trackIndex: 1 }, { type: 'setMode', mode: 'tab' }] as const;
    const state = multitrack.reduce(editorReducer, loaded());

    // Act
    const single = renderView(loaded()).current();
    const shown = renderView(state).current();

    // Assert
    expect(single.staves).toEqual([{ trackIndex: 0, mode: 'notationAndTab' }]);
    expect(shown.staves).toEqual([{ trackIndex: 0, mode: 'tab' }, { trackIndex: 2, mode: 'notationAndTab' }]);
    expect(shown).toMatchObject({ shownTrackIndexes: [0, 2], selectedMode: 'tab', isMultitrack: true });
  });

  it('answers View ▸ Multitrack, Previous Track and Next Track, and the tracks panel’s controls', () => {
    // Arrange
    const { current, dispatch } = renderView(loaded());

    // Act
    ReactTestRenderer.act(() => mockMenu.handlers?.onMultitrackRequested());
    ReactTestRenderer.act(() => mockMenu.handlers?.onNextTrackRequested());
    ReactTestRenderer.act(() => mockMenu.handlers?.onPreviousTrackRequested());
    ReactTestRenderer.act(() => current().toggleTrackShown(2));

    // Assert
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'toggleMultitrack' },
      { type: 'moveCursorTrack', step: 1 },
      { type: 'moveCursorTrack', step: -1 },
      { type: 'toggleTrackShown', trackIndex: 2 },
    ]);
  });
});
