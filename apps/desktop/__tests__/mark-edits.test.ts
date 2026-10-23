import { QUARTER, type Song, type StringAddress } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { applyMarkEdit } from '../src/state/mark-edits';
import { applySongEdit } from '../src/state/song-edits';
import { beat, makeSong, note } from '../test-support/songs';

const EIGHTH = { ...QUARTER, value: 8 as const };
/** Bar 1: two eighths on string 2, then a dotted half's worth of quarters; bar 2 a whole note. */
const SONG: Song = makeSong([
  [beat(960, [note(2, 5)], EIGHTH), beat(1440, [note(2, 7)], EIGHTH), beat(1920, [note(3, 2)]), beat(2880, [note(3, 2)]), beat(3840, [note(3, 2)])],
  [beat(4800, [note(1, 0)], { ...QUARTER, value: 1 })],
]);
const ON_NOTE: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };

const noteAt = (song: Song) => song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0];
const voiceAt = (song: Song) => song.tracks[0]?.measures[0]?.beats[0]?.voices[0];

function opened(): EditorState {
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'marks.gp5', path: '/marks.gp5', song: SONG } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: ON_NOTE });
}

describe('mark edits at the cursor', () => {
  it('sets and clears a finger of either hand', () => {
    // Act
    const left = applyMarkEdit(SONG, ON_NOTE, { type: 'setFinger', hand: 'left', finger: 'annular' });
    const right = applyMarkEdit(left, ON_NOTE, { type: 'setFinger', hand: 'right', finger: 'index' });
    const cleared = applyMarkEdit(right, ON_NOTE, { type: 'setFinger', hand: 'left', finger: 'none' });

    // Assert
    expect(noteAt(right)).toMatchObject({ leftFinger: 'annular', rightFinger: 'index' });
    expect(noteAt(cleared)).not.toHaveProperty('leftFinger');
  });

  it('shows the note’s accidental as a reminder or always, and as needed again', () => {
    const cautionary = applyMarkEdit(SONG, ON_NOTE, { type: 'setAccidentalDisplay', display: 'cautionary' });
    expect(noteAt(cautionary)?.accidentalDisplay).toBe('cautionary');
    expect(noteAt(applyMarkEdit(cautionary, ON_NOTE, { type: 'setAccidentalDisplay', display: 'none' }))).not.toHaveProperty('accidentalDisplay');
  });

  it('toggles the beat’s slash and its beams to the next beat', () => {
    // Act
    const slashed = applyMarkEdit(SONG, ON_NOTE, { type: 'toggleSlash' });
    const joined = applyMarkEdit(slashed, ON_NOTE, { type: 'toggleBeamLink', link: 'join' });
    const broken = applyMarkEdit(joined, ON_NOTE, { type: 'toggleBeamLink', link: 'break' });
    const unbroken = applyMarkEdit(broken, ON_NOTE, { type: 'toggleBeamLink', link: 'break' });

    // Assert
    expect(voiceAt(slashed)?.isSlashed).toBe(true);
    expect(voiceAt(applyMarkEdit(slashed, ON_NOTE, { type: 'toggleSlash' }))).not.toHaveProperty('isSlashed');
    expect(voiceAt(joined)?.beamToNext).toBe('join');
    expect(voiceAt(broken)?.beamToNext).toBe('break');
    expect(voiceAt(unbroken)).not.toHaveProperty('beamToNext');
  });

  it('groups the bar’s beams by a preset', () => {
    // Act
    const pairs = applyMarkEdit(SONG, ON_NOTE, { type: 'setBeamGrouping', preset: 'byTwoBeats' });
    const beats = applyMarkEdit(pairs, ON_NOTE, { type: 'setBeamGrouping', preset: 'byBeat' });

    // Assert
    expect(pairs.measureHeaders.map((header) => header.beamGrouping)).toEqual([{ unit: 8, groups: [4, 4] }, { unit: 8, groups: [4, 4] }]);
    expect(beats.measureHeaders.map((header) => header.beamGrouping)).toEqual([undefined, undefined]);
  });

  it('is reached through the song edits', () => {
    expect(voiceAt(applySongEdit(SONG, ON_NOTE, { type: 'toggleSlash' }))?.isSlashed).toBe(true);
    expect(SONG.measureHeaders[0]).not.toHaveProperty('beamGrouping');
    expect(applySongEdit(SONG, ON_NOTE, { type: 'setBeamGrouping', preset: 'byBar' }).measureHeaders[0]?.beamGrouping).toEqual({ unit: 8, groups: [8] });
  });
});

describe('mark edits in the editor', () => {
  it('makes each mark one undo step', () => {
    // Arrange
    const state = opened();

    // Act
    const fingered = editorReducer(state, { type: 'edit', edit: { type: 'setFinger', hand: 'right', finger: 'middle' } });
    const slashed = editorReducer(fingered, { type: 'edit', edit: { type: 'toggleSlash' } });
    const undone = editorReducer(slashed, { type: 'undo' });

    // Assert
    expect(noteAt(slashed.document!.song)?.rightFinger).toBe('middle');
    expect(voiceAt(undone.document!.song)).not.toHaveProperty('isSlashed');
    expect(noteAt(undone.document!.song)?.rightFinger).toBe('middle');
    expect(undone.past).toHaveLength(1);
  });

  it('writes a track in slashes and back, one undo step each', () => {
    // Act
    const on = editorReducer(opened(), { type: 'setTrackSlashNotation', trackIndex: 0, hasSlashNotation: true });
    const undone = editorReducer(on, { type: 'undo' });

    // Assert
    expect(on.document!.song.tracks[0]?.hasSlashNotation).toBe(true);
    expect(undone.document!.song.tracks[0]).not.toHaveProperty('hasSlashNotation');
  });
});
