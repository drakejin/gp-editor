import ReactTestRenderer from 'react-test-renderer';
import { type Note, buildBend } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { NotePanelView } from '../src/components/note-panels/NotePanels';
import type { NotePanel } from '../src/lib/key-commands';
import { PALETTE } from '../test-support/score-helpers';
import { note } from '../test-support/songs';

function render(panel: NotePanel, shown: Note) {
  const onEdit = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<NotePanelView palette={PALETTE} panel={panel} note={shown} onEdit={onEdit} onClose={onClose} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  return { renderer, onEdit, onClose, button, press };
}

describe('vibrato panel (B)', () => {
  it('lights the note’s vibrato and sets another width at once', () => {
    // Arrange
    const panel = render('vibrato', note(2, 5, { vibrato: true }));

    // Act
    panel.press('Wide vibrato (~~)');

    // Assert
    expect(panel.button('Slight vibrato (~)')?.props.isActive).toBe(true);
    expect(panel.onEdit).toHaveBeenCalledWith({ type: 'setVibrato', vibrato: 'wide' });
  });

  it('closes with Done or a click outside', () => {
    const panel = render('vibrato', note(2, 5));
    panel.press('Close');
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'note-panel-backdrop' }).props.onPress());
    expect(panel.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('bend panel (C)', () => {
  it('shows the bend’s shape and amount and draws its curve', () => {
    // Act
    const panel = render('bend', note(3, 7, { bend: buildBend('bendRelease', 6) }));

    // Assert
    expect(panel.button('Bend up, then back')?.props.isActive).toBe(true);
    expect(panel.button('1½ tone')?.props.isActive).toBe(true);
    const canvas = panel.renderer.root.findAll((node) => Array.isArray(node.props.commands))[0];
    expect(canvas?.props.commands.filter((command: { kind: string }) => command.kind === 'circle')).toHaveLength(5);
  });

  it('keeps the amount when the shape changes, and the shape when the amount changes', () => {
    // Arrange
    const panel = render('bend', note(3, 7, { bend: buildBend('bendRelease', 6) }));

    // Act
    panel.press('Bent before it is struck');
    panel.press('2 tone');

    // Assert
    expect(panel.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
      { type: 'setBendShape', shape: 'preBend', amount: 6 },
      { type: 'setBendShape', shape: 'bendRelease', amount: 8 },
    ]);
  });

  it('starts a plain bend when an amount is picked for a note without one', () => {
    const panel = render('bend', note(3, 7));
    expect(panel.button('No bend')?.props.isActive).toBe(true);
    panel.press('½ tone');
    expect(panel.onEdit).toHaveBeenCalledWith({ type: 'setBendShape', shape: 'bend', amount: 2 });
  });
});
