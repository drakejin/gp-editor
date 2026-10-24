import {
  INITIAL_TRACK_DISPLAY,
  type TrackDisplay,
  adjacentTrackIndex,
  isTrackShown,
  remapTrackDisplay,
  setTrackMode,
  shownStaves,
  shownTrackIndexes,
  toggleMultitrack,
  toggleTrackShown,
  trackModeOf,
} from '../src/state/track-display';

const MULTITRACK: TrackDisplay = { ...INITIAL_TRACK_DISPLAY, isMultitrack: true };

describe('shownTrackIndexes', () => {
  it('shows only the selected track without Multitrack', () => {
    expect(shownTrackIndexes(INITIAL_TRACK_DISPLAY, 4, 2)).toEqual([2]);
  });

  it('shows every track in track order with Multitrack', () => {
    expect(shownTrackIndexes(MULTITRACK, 4, 2)).toEqual([0, 1, 2, 3]);
  });

  it('leaves the hidden tracks out but always shows the selected one', () => {
    // Arrange
    const display = { ...MULTITRACK, hiddenTrackIndexes: [0, 2, 3] };

    // Act
    const shown = shownTrackIndexes(display, 4, 2);

    // Assert
    expect(shown).toEqual([1, 2]);
    expect([0, 1, 2, 3].map((index) => isTrackShown(display, index, 2))).toEqual([false, true, true, false]);
  });
});

describe('toggling tracks and the multitrack view', () => {
  it('keeps the eyes when Multitrack goes off and on again', () => {
    // Arrange
    const display = { ...MULTITRACK, hiddenTrackIndexes: [1] };

    // Act
    const again = toggleMultitrack(toggleMultitrack(display));

    // Assert
    expect(toggleMultitrack(display).isMultitrack).toBe(false);
    expect(again).toEqual(display);
  });

  it('hides and shows a track in the multitrack view', () => {
    // Act
    const hidden = toggleTrackShown(MULTITRACK, 3, 0, 2);
    const shownAgain = toggleTrackShown(hidden, 3, 0, 2);

    // Assert
    expect(hidden.hiddenTrackIndexes).toEqual([2]);
    expect(shownAgain.hiddenTrackIndexes).toEqual([]);
  });

  it('turns the multitrack view on with the selected track and the clicked one from the single-track view', () => {
    // Act
    const display = toggleTrackShown(INITIAL_TRACK_DISPLAY, 4, 1, 3);

    // Assert
    expect(display.isMultitrack).toBe(true);
    expect(shownTrackIndexes(display, 4, 1)).toEqual([1, 3]);
  });

  it('changes nothing for the selected track or a track the song does not have', () => {
    expect(toggleTrackShown(MULTITRACK, 3, 1, 1)).toBe(MULTITRACK);
    expect(toggleTrackShown(MULTITRACK, 3, 1, 3)).toBe(MULTITRACK);
    expect(toggleTrackShown(MULTITRACK, 3, 1, -1)).toBe(MULTITRACK);
  });
});

describe('a track’s staves', () => {
  it('keeps a track’s own staves in both views; a track without them follows the score’s mode', () => {
    // Arrange
    const display = setTrackMode(MULTITRACK, 1, 'tab');

    // Act + Assert
    expect(trackModeOf(display, 'notationAndTab', 1)).toBe('tab');
    expect(trackModeOf(display, 'notationAndTab', 0)).toBe('notationAndTab');
    expect(trackModeOf({ ...display, isMultitrack: false }, 'notation', 1)).toBe('tab');
    expect(trackModeOf({ ...display, isMultitrack: false }, 'notation', 0)).toBe('notation');
  });

  it('returns the same display when the mode is already set', () => {
    const display = setTrackMode(MULTITRACK, 1, 'tab');
    expect(setTrackMode(display, 1, 'tab')).toBe(display);
  });
});

describe('remapTrackDisplay', () => {
  it('follows deleted and moved tracks', () => {
    // Arrange: track 1 deleted, tracks 2 and 3 move up
    const display: TrackDisplay = { isMultitrack: true, hiddenTrackIndexes: [1, 3], trackModes: { 1: 'tab', 2: 'notation' } };
    const remap = (index: number) => (index === 1 ? undefined : index > 1 ? index - 1 : index);

    // Act
    const remapped = remapTrackDisplay(display, remap);

    // Assert
    expect(remapped).toEqual({ isMultitrack: true, hiddenTrackIndexes: [2], trackModes: { 1: 'notation' } });
  });

  it('keeps the order of the hidden tracks after a move', () => {
    const display: TrackDisplay = { ...MULTITRACK, hiddenTrackIndexes: [0, 2] };
    expect(remapTrackDisplay(display, (index) => [2, 1, 0][index]).hiddenTrackIndexes).toEqual([0, 2]);
  });

  it('returns the same object when no index changes', () => {
    const display: TrackDisplay = { ...MULTITRACK, hiddenTrackIndexes: [2], trackModes: { 0: 'tab' } };
    expect(remapTrackDisplay(display, (index) => index)).toBe(display);
  });
});

describe('adjacentTrackIndex', () => {
  it('steps through the shown tracks in the multitrack view', () => {
    // Arrange
    const display = { ...MULTITRACK, hiddenTrackIndexes: [1] };

    // Act + Assert
    expect(adjacentTrackIndex(display, 4, 0, 1)).toBe(2);
    expect(adjacentTrackIndex(display, 4, 2, -1)).toBe(0);
    expect(adjacentTrackIndex(display, 4, 3, 1)).toBeUndefined();
  });

  it('steps through every track in the single-track view', () => {
    expect(adjacentTrackIndex(INITIAL_TRACK_DISPLAY, 3, 1, 1)).toBe(2);
    expect(adjacentTrackIndex(INITIAL_TRACK_DISPLAY, 3, 0, -1)).toBeUndefined();
  });
});

describe('shownStaves', () => {
  it('gives each shown track its staves', () => {
    // Arrange
    const display = setTrackMode({ ...MULTITRACK, hiddenTrackIndexes: [1] }, 2, 'notation');

    // Act
    const staves = shownStaves(display, 'tab', 3, 0);

    // Assert
    expect(staves).toEqual([{ trackIndex: 0, mode: 'tab' }, { trackIndex: 2, mode: 'notation' }]);
    expect(shownStaves(INITIAL_TRACK_DISPLAY, 'tab', 3, 1)).toEqual([{ trackIndex: 1, mode: 'tab' }]);
  });
});
