import { type Song, type TranscribedTrack, buildSongFromTranscription, easyTranspose } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };

/** Two bars of a guitar: four quarter notes in each, on string 2. */
function quarters(): Song {
  const bar = { parts: [{ track: 0, beats: [5, 7, 8, 10].map((fret) => ({ duration: 'quarter' as const, notes: [{ string: 2, fret }] })) }] };
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [bar, bar] }]).song;
}

/** Bar 2 as one whole note. */
function rewritten(song: Song): Song {
  const bar = { parts: [{ track: 0, beats: [5, 7, 8, 10].map((fret) => ({ duration: 'quarter' as const, notes: [{ string: 2, fret }] })) }] };
  const whole = { parts: [{ track: 0, beats: [{ duration: 'whole' as const, notes: [{ string: 1, fret: 12 }] }] }] };
  const built = buildSongFromTranscription([{ tracks: [GUITAR], measures: [bar, whole] }]).song;
  return { ...song, tracks: built.tracks };
}

const at = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 2 });

function loadedAt(song: Song, measureIndex: number, beatIndex: number): EditorState {
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'q.gp', path: '/q.gp', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: at(measureIndex, beatIndex) });
}

describe('applyAiEdit (editor action)', () => {
  it('writes the edited song as one undo step, says what changed, and undo brings the song back exactly', () => {
    // Arrange
    const song = quarters();
    const edited = easyTranspose(song, { kind: 'song' }, -2).song;
    const state = loadedAt(song, 0, 0);

    // Act
    const next = editorReducer(state, { type: 'applyAiEdit', basis: song, song: edited, summary: 'Transposed 8 notes', keepsBeats: true });
    const undone = editorReducer(next, { type: 'undo' });

    // Assert
    expect(next.document?.song).toBe(edited);
    expect(next.past).toHaveLength(1);
    expect(next.hint).toBe('Transposed 8 notes. Edit ▸ Undo takes it back in one step.');
    expect(undone.document?.song).toBe(song);
  });

  it('writes nothing, and says so, when the score changed since Claude read it', () => {
    // Arrange
    const song = quarters();
    const state = loadedAt(song, 0, 0);

    // Act
    const next = editorReducer(state, { type: 'applyAiEdit', basis: rewritten(song), song: rewritten(song), summary: '', keepsBeats: false });

    // Assert
    expect(next.document?.song).toBe(song);
    expect(next.past).toEqual([]);
    expect(next.hint).toBe('The score changed while Claude was working, so nothing was changed. Try again.');
  });

  it('records nothing for an edit that leaves the song as it was', () => {
    // Arrange
    const song = quarters();

    // Act
    const next = editorReducer(loadedAt(song, 0, 0), { type: 'applyAiEdit', basis: song, song, summary: 'x', keepsBeats: true });

    // Assert
    expect(next.past).toEqual([]);
  });

  it('keeps the selection after the exact edit, which changes no beat, and drops it after a rewrite', () => {
    // Arrange
    const song = quarters();
    const selected = editorReducer(loadedAt(song, 1, 3), { type: 'selectTo', cursor: at(1, 1) });

    // Act
    const exact = editorReducer(selected, { type: 'applyAiEdit', basis: song, song: easyTranspose(song, { kind: 'song' }, -2).song, summary: 's', keepsBeats: true });
    const claude = editorReducer(selected, { type: 'applyAiEdit', basis: song, song: rewritten(song), summary: 's', keepsBeats: false });

    // Assert
    expect(exact.selectionAnchor).toEqual(selected.selectionAnchor);
    expect(claude.selectionAnchor).toBeUndefined();
    expect(claude.cursor).toMatchObject({ measureIndex: 1, beatIndex: 0 });
  });
});
