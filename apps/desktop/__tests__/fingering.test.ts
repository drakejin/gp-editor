import { type Finger, FINGERS } from '@gp-editor/core';
import { fingeringLabel, isKeyboardTrack } from '../src/lib/fingering';
import { layoutMeasure } from '../src/lib/layout';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

const labels = (hand: 'left' | 'right', isKeyboard: boolean) => FINGERS.map((finger: Finger) => fingeringLabel(finger, hand, isKeyboard));

describe('fingeringLabel', () => {
  it('writes the fretting hand T 1 2 3 4 and the picking hand p i m a c', () => {
    expect(labels('left', false)).toEqual(['T', '1', '2', '3', '4']);
    expect(labels('right', false)).toEqual(['p', 'i', 'm', 'a', 'c']);
  });

  it('writes every finger 1–5 on a keyboard, thumb first', () => {
    expect(labels('left', true)).toEqual(['1', '2', '3', '4', '5']);
    expect(labels('right', true)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('isKeyboardTrack', () => {
  const song = makeSong([[beat(960, [note(1, 0)])]]);

  it.each([
    [0, true],
    [7, true],
    [19, true],
    [25, false],
    [33, false],
  ])('GM program %i is a keyboard: %s', (program, isKeyboard) => {
    expect(isKeyboardTrack(onStrings(song, [64, 59, 55, 50, 45, 40], { program }), 0)).toBe(isKeyboard);
  });

  it('is false for a drum track and a track without a channel', () => {
    expect(isKeyboardTrack(onStrings(song, [0, 0, 0, 0, 0, 0], { program: 0, isPercussion: true }), 0)).toBe(false);
    expect(isKeyboardTrack(song, 0)).toBe(false);
  });
});

describe('room for fingering', () => {
  it('widens a beat whose notes have a left-hand finger', () => {
    // Arrange
    const plain = makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 0)])]]);
    const fingered = makeSong([[beat(960, [{ ...note(1, 0), leftFinger: 'index' }]), beat(1920, [note(1, 0)])]]);

    // Act
    const widths = [plain, fingered].map((song) => layoutMeasure(song, 0, 0).width);

    // Assert
    expect(widths[1]).toBeGreaterThan(widths[0]!);
  });
});
