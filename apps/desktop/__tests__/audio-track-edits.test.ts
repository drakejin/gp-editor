import { buildAudioTrack } from '@gp-editor/core';
import { syncOrderHint, twoSyncPointsHint } from '../src/state/audio-track-edits';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { makeSong } from '../test-support/songs';

/** Four empty bars at 120 BPM (two seconds each). */
function loadedState(): EditorState {
  const song = makeSong([[], [], [], []]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp', path: '/a.gp', song } });
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const TRACK = buildAudioTrack({ assetId: 'take', fileExtension: 'wav', originalFilePath: 'take.wav' });

describe('audio track edits', () => {
  it('adds the audio track as one undo step and removes it', () => {
    // Arrange
    const loaded = loadedState();

    // Act
    const added = run(loaded, { type: 'setAudioTrack', audioTrack: TRACK });
    const removed = run(added, { type: 'setAudioTrack', audioTrack: undefined });
    const undone = run(removed, { type: 'undo' });

    // Assert
    expect(added.document?.song.audioTrack).toEqual(TRACK);
    expect(added.past).toHaveLength(1);
    expect(removed.document?.song.audioTrack).toBeUndefined();
    expect(undone.document?.song.audioTrack).toEqual(TRACK);
  });

  it('sets the strip’s volume, mute, solo and detune', () => {
    // Arrange
    const state = run(loadedState(), { type: 'setAudioTrack', audioTrack: TRACK });

    // Act
    const mixed = run(state, { type: 'setAudioTrackMix', mix: { volume: 0.5, solo: true, detuneCents: 100 } });

    // Assert
    expect(mixed.document?.song.audioTrack).toMatchObject({ volume: 0.5, solo: true, detuneCents: 100 });
  });

  it('adds, moves and deletes sync points, and says why a point out of order is refused', () => {
    // Arrange
    const state = run(loadedState(), { type: 'setAudioTrack', audioTrack: TRACK });

    // Act
    const marked = run(
      state,
      { type: 'setAudioSyncPoint', point: { measureIndex: 0, occurrence: 0, position: 0, seconds: 1 } },
      { type: 'setAudioSyncPoint', point: { measureIndex: 2, occurrence: 0, position: 0, seconds: 5 } },
    );
    const refused = run(marked, { type: 'setAudioSyncPoint', point: { measureIndex: 1, occurrence: 0, position: 0, seconds: 7 } });
    const moved = run(marked, { type: 'moveAudioSyncPoint', pointIndex: 1, seconds: 6 });
    const badMove = run(marked, { type: 'moveAudioSyncPoint', pointIndex: 1, seconds: 0.5 });
    const deleted = run(marked, { type: 'deleteAudioSyncPoint', pointIndex: 0 });

    // Assert
    expect(marked.document?.song.audioTrack?.syncPoints.map((point) => point.seconds)).toEqual([1, 5]);
    expect(refused.hint).toBe(syncOrderHint());
    expect(refused.document?.song).toBe(marked.document?.song);
    expect(moved.document?.song.audioTrack?.syncPoints[1]?.seconds).toBe(6);
    expect(badMove.hint).toBe(syncOrderHint());
    expect(deleted.document?.song.audioTrack?.syncPoints.map((point) => point.measureIndex)).toEqual([2]);
  });

  it('sets the song’s tempo from the first two sync points', () => {
    // Arrange: two bars (eight quarters) in five seconds
    const state = run(
      loadedState(),
      { type: 'setAudioTrack', audioTrack: TRACK },
      { type: 'setAudioSyncPoint', point: { measureIndex: 0, occurrence: 0, position: 0, seconds: 1 } },
      { type: 'setAudioSyncPoint', point: { measureIndex: 2, occurrence: 0, position: 0, seconds: 6 } },
    );

    // Act
    const tempo = run(state, { type: 'setTempoFromAudio' });

    // Assert
    expect(tempo.document?.song.measureHeaders.map((header) => header.tempo)).toEqual([96, 96, 96, 96]);
    expect(tempo.hint).toContain('96 BPM');
  });

  it('asks for two sync points before it sets a tempo', () => {
    // Arrange
    const state = run(loadedState(), { type: 'setAudioTrack', audioTrack: TRACK });

    // Act
    const tempo = run(state, { type: 'setTempoFromAudio' });

    // Assert
    expect(tempo.hint).toBe(twoSyncPointsHint());
    expect(tempo.document?.song).toBe(state.document?.song);
  });
});
