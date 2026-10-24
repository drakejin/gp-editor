import type { StringAddress } from '@gp-editor/core';
import { editedVoiceOf } from '../src/score/voices';

const CURSOR: StringAddress = { trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 2, string: 1 };

describe('editedVoiceOf', () => {
  it('fades the other voices only in the rows of the cursor’s track (other tracks’ staves stay in full ink)', () => {
    // Act
    const cursorTrack = editedVoiceOf(CURSOR, 1, false);
    const otherTrack = editedVoiceOf(CURSOR, 0, false);

    // Assert
    expect(cursorTrack).toBe(2);
    expect(otherTrack).toBeUndefined();
  });

  it('fades no voice in Multivoice or without a cursor', () => {
    expect(editedVoiceOf(CURSOR, 1, true)).toBeUndefined();
    expect(editedVoiceOf(undefined, 1, false)).toBeUndefined();
  });
});
