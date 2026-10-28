import { paletteGroups } from '../src/components/palette/palette-groups';
import { keyCommand } from '../src/lib/key-commands';

const TOOLS_WITH_KEYS = paletteGroups().flatMap((group) => group.tools).filter((tool) => tool.key !== undefined);

/** The press a button's key names: "D", or "⌘D" with the command key. */
const pressOf = (key: string) => {
  const metaKey = key.startsWith('⌘');
  return keyCommand({ key: key.replace('⌘', '').toLowerCase(), metaKey, shiftKey: false, altKey: false }, { current: undefined }, 0);
};

describe('palette buttons and their keys', () => {
  it('shows keys on the techniques and accents', () => {
    expect(TOOLS_WITH_KEYS.length).toBeGreaterThanOrEqual(10);
  });

  it('shows D on the Note group’s Delete and ⌘D on the Bar group’s − Bar', () => {
    const keys = new Map(TOOLS_WITH_KEYS.map((tool) => [tool.id, tool.key]));
    expect([keys.get('deleteNotes'), keys.get('deleteMeasure')]).toEqual(['D', '⌘D']);
  });

  it.each(TOOLS_WITH_KEYS.map((tool) => [tool.id, tool] as const))('%s: the key does what the button does and the tooltip names it', (_id, tool) => {
    // Act
    const command = pressOf(tool.key!);

    // Assert
    expect(tool.tooltip).toContain(`(${tool.key})`);
    if (tool.run.kind === 'edit') {
      expect(command).toEqual({ type: 'edit', edit: tool.run.edit });
    } else if (tool.run.kind === 'panel') {
      expect(command).toEqual({ type: 'openNotePanel', panel: tool.run.panel });
    } else if (tool.run.kind === 'chordPanel') {
      expect(command).toEqual({ type: 'openChordPanel' });
    } else {
      // An option strip's key sets its most common choice (S a shift slide, N a natural harmonic).
      expect(command?.type).toBe('edit');
    }
  });
});
