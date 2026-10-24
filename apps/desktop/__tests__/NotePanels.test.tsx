import ReactTestRenderer from 'react-test-renderer';
import { type Note, TREMOLO_BAR_PRESETS, buildBend } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { NotePanelView } from '../src/components/note-panels/NotePanels';
import type { NotePanel } from '../src/lib/key-commands';
import { CURVE_GRID, curvePointXY } from '../src/score/curve-grid';
import { PALETTE } from '../test-support/score-helpers';
import { note } from '../test-support/songs';

function render(panel: NotePanel, shown: Note) {
  const onEdit = jest.fn();
  const onClose = jest.fn();
  const onPreview = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<NotePanelView palette={PALETTE} panel={panel} note={shown} onEdit={onEdit} onPreview={onPreview} onClose={onClose} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const grid = () => renderer.root.findByProps({ testID: 'curve-grid' });
  const mouse = (x: number, y: number, extra: object = {}) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x + 500, pageY: y + 300, ...extra } });
  const pressGrid = (x: number, y: number, extra: object = {}) => ReactTestRenderer.act(() => grid().props.onPressIn(mouse(x, y, extra)));
  const moveTo = (x: number, y: number, extra: object = {}) => ReactTestRenderer.act(() => grid().props.onPressMove(mouse(x, y, extra)));
  const release = () => ReactTestRenderer.act(() => grid().props.onPressOut());
  const readout = () => renderer.root.findByProps({ testID: 'curve-readout' }).props.children as string;
  const dots = () =>
    (renderer.root.findAll((node) => Array.isArray(node.props.commands))[0]?.props.commands as { kind: string; strokeWidth?: number }[]).filter(
      (command) => command.kind === 'circle' && command.strokeWidth === undefined,
    );
  return { renderer, onEdit, onClose, onPreview, button, press, pressGrid, moveTo, release, readout, dots, grid };
}

/** Where a tremolo bar point sits on the grid (its view is ±3 tones for these curves). */
const whammyAt = (position: number, value: number) => curvePointXY({ position, value }, { min: -12, max: 12 });

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

describe('tremolo bar panel (the palette’s W.bar)', () => {
  it('loads a preset into the grid, previews it on the score and applies it as one edit', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7));

    // Act
    panel.press('Down a tone and hold');
    panel.press('Put this whammy bar on the note');

    // Assert
    expect(panel.button('Down a tone and hold')?.props.isActive).toBe(true);
    expect(panel.dots()).toHaveLength(3);
    expect(panel.onPreview).toHaveBeenCalledWith({ type: 'setTremoloBar', tremoloBar: TREMOLO_BAR_PRESETS.dive });
    expect(panel.onEdit.mock.calls).toEqual([[{ type: 'setTremoloBar', tremoloBar: TREMOLO_BAR_PRESETS.dive }]]);
    expect(panel.onClose).toHaveBeenCalledTimes(1);
  });

  it('adds a point where the grid is clicked and moves it with a drag', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const empty = whammyAt(3, 0);
    const target = whammyAt(4, -8);

    // Act
    panel.pressGrid(empty.x, empty.y - 1);
    panel.moveTo(target.x, target.y);
    panel.release();
    panel.press('Put this whammy bar on the note');

    // Assert
    expect(panel.onEdit).toHaveBeenCalledWith({
      type: 'setTremoloBar',
      tremoloBar: { points: [{ position: 0, value: 0 }, { position: 4, value: -8 }, { position: 6, value: -4 }, { position: 12, value: 0 }] },
    });
  });

  it('keeps a dragged point under the pointer, measured from the grid, when the grid moves or the pointer leaves it', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const dip = whammyAt(6, -4);
    const target = whammyAt(6, -8);
    const gridShift = 30;

    // Act
    panel.pressGrid(dip.x + 2, dip.y - 3);
    panel.moveTo(target.x + 2, target.y - 3, { pageY: target.y - 3 + 300 + gridShift });
    const followed = panel.readout();
    panel.moveTo(target.x + 2, CURVE_GRID.height + 200);
    const below = panel.readout();
    panel.release();

    // Assert
    expect(followed).toBe('Point 2 of 3: 6/12 of the note, −2 tones');
    expect(below).toBe('Point 2 of 3: 6/12 of the note, −3 tones');
  });

  it('selects a point, shows it, steps it and deletes it', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const dip = whammyAt(6, -4);

    // Act
    panel.pressGrid(dip.x + 3, dip.y + 2);
    panel.release();
    const selected = panel.readout();
    panel.press('A quarter tone lower');
    panel.press('Move the point later');
    const stepped = panel.readout();
    panel.press('Remove the selected point');

    // Assert
    expect(selected).toBe('Point 2 of 3: 6/12 of the note, −1 tone');
    expect(stepped).toBe('Point 2 of 3: 7/12 of the note, −1¼ tones');
    expect(panel.dots()).toHaveLength(2);
    expect(panel.button('Remove the selected point')?.props.isEnabled).toBe(false);
  });

  it('removes the point under a right click (onAuxClick) or a ⌃-click', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const dip = whammyAt(6, -4);
    const end = whammyAt(12, 0);

    // Act
    ReactTestRenderer.act(() => panel.grid().props.onAuxClick({ nativeEvent: { clientX: dip.x, clientY: dip.y, button: 2 } }));
    panel.pressGrid(end.x, end.y, { ctrlKey: true });

    // Assert
    expect(panel.dots()).toHaveLength(1);
  });

  it('leaves Apply off until the curve changes, and Remove takes the whammy bar off', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));

    // Act
    const canApply = panel.button('Put this whammy bar on the note')?.props.isEnabled;
    panel.press('Take the whammy bar off the note');

    // Assert
    expect(canApply).toBe(false);
    expect(panel.onEdit).toHaveBeenCalledWith({ type: 'setTremoloBar', tremoloBar: undefined });
  });

  it('says when a .gp file cannot keep the curve point for point, in a line kept for it either way', () => {
    // Arrange
    const hint = (shown: Note) => render('tremoloBar', shown).renderer.root.findByProps({ testID: 'curve-gpif-hint' }).props.children as string;
    const zigzag = { points: [{ position: 0, value: 0 }, { position: 3, value: -4 }, { position: 6, value: 2 }, { position: 9, value: -2 }, { position: 12, value: 0 }] };

    // Act
    const zigzagHint = hint(note(3, 7, { tremoloBar: zigzag }));
    const dipHint = hint(note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));

    // Assert
    expect(zigzagHint).toMatch(/^A \.gp file \(Guitar Pro 7\/8\) keeps a simpler curve/);
    expect(dipHint).toBe('');
  });

  it('leaves the curve as it is when a right click or a ⌃-click misses every point', () => {
    // Arrange
    const panel = render('tremoloBar', note(3, 7, { tremoloBar: TREMOLO_BAR_PRESETS.dip }));
    const empty = whammyAt(3, 8);

    // Act
    ReactTestRenderer.act(() => panel.grid().props.onAuxClick({ nativeEvent: { clientX: empty.x, clientY: empty.y, button: 2 } }));
    panel.pressGrid(empty.x, empty.y, { ctrlKey: true });

    // Assert
    expect(panel.dots()).toHaveLength(3);
  });

  it('stops previewing when it closes', () => {
    const panel = render('tremoloBar', note(3, 7));
    panel.press('Down a tone and back');
    ReactTestRenderer.act(() => panel.renderer.unmount());
    expect(panel.onPreview).toHaveBeenLastCalledWith(undefined);
  });
});

describe('bend panel (C)', () => {
  it('shows the bend’s shape, amount and points on the grid', () => {
    // Act
    const panel = render('bend', note(3, 7, { bend: buildBend('bendRelease', 6) }));

    // Assert
    expect(panel.button('Bend up, then back')?.props.isActive).toBe(true);
    expect(panel.button('1½ tone')?.props.isActive).toBe(true);
    expect(panel.dots()).toHaveLength(5);
    expect(CURVE_GRID.lastPosition).toBe(12);
  });

  it('keeps the amount when the shape changes, and the shape when the amount changes; Apply sets the bend', () => {
    // Arrange
    const panel = render('bend', note(3, 7, { bend: buildBend('bendRelease', 6) }));

    // Act
    panel.press('Bent before it is struck');
    panel.press('2 tone');
    panel.press('Put this bend on the note');

    // Assert
    expect(panel.onEdit.mock.calls).toEqual([[{ type: 'setBend', bend: buildBend('preBend', 8) }]]);
  });

  it('starts a plain bend when an amount is picked for a note without one', () => {
    const panel = render('bend', note(3, 7));
    expect(panel.button('No bend')?.props.isActive).toBe(true);
    panel.press('½ tone');
    panel.press('Put this bend on the note');
    expect(panel.onEdit).toHaveBeenCalledWith({ type: 'setBend', bend: buildBend('bend', 2) });
  });
});
