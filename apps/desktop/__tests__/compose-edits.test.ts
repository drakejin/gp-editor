import { type Song, type TranscribedTrack, applyComposedBars, buildSongFromTranscription } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };

/** Two bars of a guitar: four quarter notes in each. */
function quarters(): Song {
  const bar = { parts: [{ track: 0, beats: [0, 2, 3, 5].map((fret) => ({ duration: 'quarter' as const, notes: [{ string: 1, fret }] })) }] };
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [bar, bar] }]).song;
}

function loadedAt(song: Song, measureIndex: number, beatIndex: number): EditorState {
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'q.gp', path: '/q.gp', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 1 } });
}

const wholeNote = { bars: [{ parts: [{ track: 0, beats: [{ duration: 'whole' as const, notes: [{ string: 1, fret: 12 }] }] }] }], newTracks: [], warnings: [] };

describe('applyComposedBars (editor action)', () => {
  it('keeps the cursor on a beat the rewritten bar has', () => {
    // Arrange: the cursor on the 4th beat of bar 2, which becomes one whole note.
    const song = quarters();
    const state = loadedAt(song, 1, 3);

    // Act
    const next = editorReducer(state, { type: 'applyComposedBars', basis: song, outcome: applyComposedBars(song, wholeNote, 1), startIndex: 1 });

    // Assert
    expect(next.cursor).toMatchObject({ trackIndex: 0, measureIndex: 1, beatIndex: 0 });
    expect(editorReducer(next, { type: 'setNoteFret', fret: 7 }).document?.song).not.toBe(next.document?.song);
  });

  it('records nothing — no undo step — when the outcome left the score as it was', () => {
    // Arrange
    const song = quarters();
    const state = loadedAt(song, 0, 0);
    const nothing = applyComposedBars(song, { bars: [{ parts: [] }], newTracks: [], warnings: [] }, 0);

    // Act
    const next = editorReducer(state, { type: 'applyComposedBars', basis: song, outcome: nothing, startIndex: 0 });

    // Assert
    expect(nothing.song).toBe(song);
    expect(next.document?.song).toBe(song);
    expect(next.past).toEqual([]);
  });

  it('shows a new drum track as notation, also after undo and redo', () => {
    // Arrange
    const song = quarters();
    const drums = { bars: [{ parts: [{ track: 1, beats: [{ duration: 'whole' as const, notes: [{ drum: 'Acoustic Snare' }] }] }] }], newTracks: [{ name: 'Drums', instrument: 'drums' as const, tuning: [], capo: 0 }], warnings: [] };

    // Act
    const composed = editorReducer(loadedAt(song, 0, 0), { type: 'applyComposedBars', basis: song, outcome: applyComposedBars(song, drums, 0), startIndex: 0 });
    const redone = editorReducer(editorReducer(composed, { type: 'undo' }), { type: 'redo' });

    // Assert
    expect(composed.trackDisplay.trackModes[1]).toBe('notation');
    expect(redone.trackDisplay.trackModes[1]).toBe('notation');
  });
});
