import {
  type AccidentalDisplay,
  type BeamGroupingPreset,
  type BeamLink,
  type Finger,
  type Hand,
  type Song,
  type StringAddress,
  presetBeamGrouping,
  setBeamGrouping,
  setNoteAccidentalDisplay,
  setNoteFinger,
  setVoiceBeamToNext,
  setVoiceSlashed,
} from '@gp-editor/core';

/** Notation marks at the cursor: the note's fingers and shown accidental, the beat's slash and beams, the bar's beam groups. */
export type NotationEdit =
  | { readonly type: 'setFinger'; readonly hand: Hand; readonly finger: Finger | 'none' }
  /** Piano fingering 1–5 (thumb = 1): kept as the note's left-hand finger, as keyboard tracks write it. */
  | { readonly type: 'setPianoFinger'; readonly finger: Finger | 'none' }
  | { readonly type: 'setAccidentalDisplay'; readonly display: AccidentalDisplay | 'none' }
  /** The cursor's beat (its voice) as a rhythm slash, or as notes again. */
  | { readonly type: 'toggleSlash' }
  /** The beam from the cursor's beat to the next one broken, joined or with only its eighth beam; off when it already is. */
  | { readonly type: 'toggleBeamLink'; readonly link: BeamLink }
  | { readonly type: 'setBeamGrouping'; readonly preset: BeamGroupingPreset };

/** Applies one notation edit at the cursor; the same song when it does not apply. */
export function applyNotationEdit(song: Song, cursor: StringAddress, edit: NotationEdit): Song {
  const voice = song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[cursor.beatIndex]?.voices[cursor.voiceIndex];
  switch (edit.type) {
    case 'setFinger':
      return setNoteFinger(song, cursor, edit.hand, edit.finger === 'none' ? undefined : edit.finger);
    case 'setPianoFinger':
      return setNoteFinger(song, cursor, 'left', edit.finger === 'none' ? undefined : edit.finger);
    case 'setAccidentalDisplay':
      return setNoteAccidentalDisplay(song, cursor, edit.display === 'none' ? undefined : edit.display);
    case 'toggleSlash':
      return setVoiceSlashed(song, cursor, voice?.isSlashed !== true);
    case 'toggleBeamLink':
      return setVoiceBeamToNext(song, cursor, voice?.beamToNext === edit.link ? undefined : edit.link);
    case 'setBeamGrouping': {
      const header = song.measureHeaders[cursor.measureIndex];
      return header === undefined ? song : setBeamGrouping(song, cursor.measureIndex, presetBeamGrouping(header.timeSignature, edit.preset));
    }
  }
}
