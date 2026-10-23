import ReactTestRenderer from 'react-test-renderer';
import type { Song } from '@gp-editor/core';
import { Fretboard } from '../src/components/Fretboard';
import { InstrumentView } from '../src/components/InstrumentView';
import { Keyboard } from '../src/components/Keyboard';
import type { ScaleHighlight } from '../src/score/scale-marks';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: an E minor shape's top notes — E4 (string 1 open) and B3 (string 2 open). */
const SONG: Song = makeSong([[beat(960, [note(1, 0), note(2, 0)])]]);
const CURSOR = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };

function render(parts: { readonly showsKeyboard: boolean; readonly showsFretboard: boolean; readonly scale?: ScaleHighlight }, song: Song = SONG) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<InstrumentView song={song} trackIndex={0} cursor={CURSOR} palette={PALETTE} {...parts} />);
  });
  return renderer.root;
}

describe('InstrumentView', () => {
  it('shows the piano keyboard right above the fretboard, both lighting the cursor’s notes', () => {
    // Act
    const root = render({ showsKeyboard: true, showsFretboard: true });

    // Assert
    const parts = root.findAll((node) => node.type === Keyboard || node.type === Fretboard);
    expect(parts.map((node) => node.type)).toEqual([Keyboard, Fretboard]);
    expect(root.findByType(Keyboard).props.pitches).toEqual([64, 59]);
  });

  it('shows only the parts switched on', () => {
    expect(render({ showsKeyboard: false, showsFretboard: true }).findAllByType(Keyboard)).toHaveLength(0);
    expect(render({ showsKeyboard: true, showsFretboard: false }).findAllByType(Fretboard)).toHaveLength(0);
  });

  it('shows neither for a drum track, which has no pitches', () => {
    const drums: Song = { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, isPercussion: true })) };
    const root = render({ showsKeyboard: true, showsFretboard: true }, drums);
    expect(root.findAll((node) => node.type === Keyboard || node.type === Fretboard)).toHaveLength(0);
  });

  it('hands the Scales panel’s scale to the keyboard and the fretboard', () => {
    // Arrange
    const scale = { pitchClasses: [9, 0, 2, 4, 7], root: 9 };

    // Act
    const root = render({ showsKeyboard: true, showsFretboard: true, scale });

    // Assert
    expect(root.findByType(Keyboard).props.scale).toBe(scale);
    expect(root.findByType(Fretboard).props.scale).toBe(scale);
  });
});
