import { setLanguage } from '../src/lib/i18n/i18n';
import { keyCommand } from '../src/lib/key-commands';
import { shortcutGroups } from '../src/lib/shortcuts';

describe('the shortcut sheet', () => {
  it('lists only keys the editor answers', () => {
    // Arrange
    const shortcuts = shortcutGroups().flatMap((group) => group.shortcuts);

    // Act
    const unanswered = shortcuts.filter((shortcut) => shortcut.press !== undefined && keyCommand(shortcut.press, { current: undefined }, 0) === undefined);

    // Assert
    expect(unanswered.map((shortcut) => shortcut.keys)).toEqual([]);
  });

  it('covers the user’s keys: R S H P M X B C, digits, ⌫, ] [, Space, ⌘Z C X V P H S W and ⌃⇥', () => {
    const keys = shortcutGroups().flatMap((group) => group.shortcuts.map((shortcut) => shortcut.keys)).join(' ');
    for (const expected of ['R', 'S', 'H', 'P', 'M', 'X', 'B', 'C', '0 – 9', '⌫', '] / [', 'Space', '⌘Z', '⌘C', '⌘X', '⌘V', '⌘P', '⌘H', '⌘S', '⌘W', '⌃⇥']) {
      expect(keys).toContain(expected);
    }
  });

  it('lists Guitar Pro 8’s voice keys ⌘1 to ⌘4', () => {
    const shortcut = shortcutGroups().flatMap((group) => group.shortcuts).find((candidate) => candidate.keys === '⌘1 – ⌘4');
    expect(shortcut).toMatchObject({ action: 'Edit voice 1, 2, 3 or 4 (the palette’s Voice buttons)', press: { key: '1', metaKey: true } });
    const move = shortcutGroups().flatMap((group) => group.shortcuts).find((candidate) => candidate.keys === '⌥1 – ⌥4');
    expect(move).toMatchObject({ action: 'Move the note (or the selected beats) to voice 1, 2, 3 or 4', press: { key: '2', altKey: true } });
  });

  it('lists D (the note, or the selected notes, to rests) and ⌘D (the bar, or the selected bars) with the beat keys', () => {
    const beats = shortcutGroups().find((group) => group.title === 'Beats and rests')?.shortcuts;
    expect(beats?.find((shortcut) => shortcut.keys === 'D')).toMatchObject({ action: 'Delete the note, or the selected notes (the beats stay as rests)', press: { key: 'd' } });
    expect(beats?.find((shortcut) => shortcut.keys === '⌘D')).toMatchObject({ action: 'Delete the bar, or the selected bars', press: { key: 'd', metaKey: true } });
  });

  it('lists the practice keys and View ▸ Focus', () => {
    const keys = shortcutGroups().find((group) => group.title === 'Practice')?.shortcuts.map((shortcut) => shortcut.keys);
    expect(keys).toEqual(['⌥- / ⌥=', '⌥M', '⌥C', '⌥L', '⇧⌘F']);
  });
});

describe('the shortcut sheet in Korean', () => {
  afterEach(() => setLanguage('en'));

  it('names its groups and actions in Korean, keeps the keys and writes the space bar in Korean', () => {
    // Act
    setLanguage('ko');
    const groups = shortcutGroups();

    // Assert
    expect(groups.map((group) => group.title)).toEqual(['커서의 음표', '박과 쉼표', '이동', '연습', '어디서나']);
    expect(groups[0]?.shortcuts.find((shortcut) => shortcut.keys === 'M')?.action).toBe('팜뮤트');
    expect(groups[4]?.shortcuts[0]).toMatchObject({ keys: '스페이스', action: '재생 / 정지', press: { key: ' ' } });
  });
});
