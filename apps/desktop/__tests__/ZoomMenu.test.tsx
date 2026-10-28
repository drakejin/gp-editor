import { DEFAULT_STYLESHEET, type Stylesheet } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { MenuButton, MenuItem, MenuStepper } from '../src/components/chrome/ChromeMenu';
import { ZoomMenu, type ZoomMenuProps } from '../src/components/ZoomMenu';
import { PALETTE } from '../test-support/score-helpers';

function renderMenu(overrides: Partial<ZoomMenuProps> = {}) {
  const props: ZoomMenuProps = {
    palette: PALETTE, zoom: 1, onZoom: jest.fn(), stylesheet: DEFAULT_STYLESHEET, onChangeStylesheet: jest.fn(), onOpenStylesheet: jest.fn(), onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ZoomMenu {...props} />);
  });
  const item = (label: string) => renderer.root.findAllByType(MenuItem).find((each) => each.props.label === label);
  const stepper = (label: string) => renderer.root.findAllByType(MenuStepper).find((each) => each.props.label === label);
  return { props, renderer, item, stepper };
}

describe('ZoomMenu', () => {
  it('zooms to a level and closes', () => {
    // Arrange
    const { props, item } = renderMenu();

    // Act
    ReactTestRenderer.act(() => item('150%')?.props.onPress());

    // Assert
    expect(item('100%')?.props.isChecked).toBe(true);
    expect(props.onZoom).toHaveBeenCalledWith(1.5);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('zooms out to 25 % and fits the printed page’s width or the whole page', () => {
    // Arrange
    const { props, item } = renderMenu({ zoom: 'fitPage' });

    // Act
    ReactTestRenderer.act(() => item('25%')?.props.onPress());
    ReactTestRenderer.act(() => item('Fit width (lines as printed)')?.props.onPress());

    // Assert
    expect(item('Fit page (a whole printed page)')?.props.isChecked).toBe(true);
    expect((props.onZoom as jest.Mock).mock.calls).toEqual([[0.25], ['fitWidth']]);
  });

  it('makes the score denser through the stylesheet: its scale and the room between systems, one edit a step', () => {
    // Arrange
    const { props, stepper } = renderMenu();

    // Act
    ReactTestRenderer.act(() => stepper('Scale')?.props.onDecrease());
    ReactTestRenderer.act(() => stepper('Between systems')?.props.onDecrease());

    // Assert
    const calls = (props.onChangeStylesheet as jest.Mock).mock.calls as [Stylesheet][];
    expect(calls[0]?.[0].scale).toBe(0.95);
    expect(calls[1]?.[0].systems.systemSpacing).toBe(-2);
    expect(stepper('Scale')?.props.value).toBe('100 %');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('makes no edit for a step past the end of its range', () => {
    // Arrange: the smallest scale and the least room
    const sheet: Stylesheet = { ...DEFAULT_STYLESHEET, scale: 0.5, systems: { ...DEFAULT_STYLESHEET.systems, systemSpacing: -12 } };
    const { props, stepper } = renderMenu({ stylesheet: sheet });

    // Act
    ReactTestRenderer.act(() => stepper('Scale')?.props.onDecrease());
    ReactTestRenderer.act(() => stepper('Between systems')?.props.onDecrease());

    // Assert
    expect(props.onChangeStylesheet).not.toHaveBeenCalled();
    expect(stepper('Between systems')?.props.value).toBe('−12 pt');
  });

  it('opens the stylesheet, and shows no stylesheet without a document', () => {
    // Arrange
    const { props, renderer } = renderMenu();
    const empty = renderMenu({ stylesheet: undefined });

    // Act
    ReactTestRenderer.act(() => renderer.root.findAllByType(MenuButton).find((each) => each.props.label === 'Stylesheet…')?.props.onPress());

    // Assert
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onOpenStylesheet).toHaveBeenCalled();
    expect(empty.renderer.root.findAllByType(MenuStepper)).toHaveLength(0);
  });
});
