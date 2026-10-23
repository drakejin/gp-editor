import { keyCommand } from '../src/lib/key-commands';
import { SHORTCUT_GROUPS } from '../src/lib/shortcuts';

describe('the shortcut sheet', () => {
  it('lists only keys the editor answers', () => {
    // Arrange
    const shortcuts = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);

    // Act
    const unanswered = shortcuts.filter((shortcut) => shortcut.press !== undefined && keyCommand(shortcut.press, { current: undefined }, 0) === undefined);

    // Assert
    expect(unanswered.map((shortcut) => shortcut.keys)).toEqual([]);
  });

  it('covers the user’s keys: R S H P M X B C, digits, ⌫, ] [, Space, ⌘Z C X V P H S W and ⌃⇥', () => {
    const keys = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.keys)).join(' ');
    for (const expected of ['R', 'S', 'H', 'P', 'M', 'X', 'B', 'C', '0 – 9', '⌫', '] / [', 'Space', '⌘Z', '⌘C', '⌘X', '⌘V', '⌘P', '⌘H', '⌘S', '⌘W', '⌃⇥']) {
      expect(keys).toContain(expected);
    }
  });

  it('lists the practice keys and View ▸ Focus', () => {
    const keys = SHORTCUT_GROUPS.find((group) => group.title === 'Practice')?.shortcuts.map((shortcut) => shortcut.keys);
    expect(keys).toEqual(['⌥- / ⌥=', '⌥M', '⌥C', '⌥L', '⇧⌘F']);
  });
});
