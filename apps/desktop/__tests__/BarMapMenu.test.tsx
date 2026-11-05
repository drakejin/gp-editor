import { StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BAR_MENU_HEIGHT, BarMapMenu, type BarMapMenuProps, barMenuTop } from '../src/components/BarMapMenu';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<BarMapMenuProps> = {}) {
  const props: BarMapMenuProps = {
    palette: PALETTE,
    target: { trackIndex: 1, firstIndex: 4, lastIndex: 4, string: 1, isSelection: false },
    trackName: 'Bass',
    anchor: { x: 400, y: 640 },
    windowWidth: 1280,
    onChoose: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<BarMapMenu {...props} />);
  });
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join('')).filter((text) => text !== '');
  const item = (label: string) => {
    const items = renderer.root.findAll((node) => node.props.accessibilityRole === 'menuitem' && typeof node.props.onPress === 'function');
    const found = items.find((menuItem) => menuItem.findAllByType(Text).some((text) => text.props.children === label));
    if (found === undefined) {
      throw new Error(`no item "${label}"`);
    }
    return found;
  };
  return { renderer, props, texts, item };
}

describe('BarMapMenu', () => {
  it('names the bar and its track, then this track’s items and every track’s', () => {
    expect(render().texts()).toEqual([
      'Bar 5 — Bass',
      'Insert Bar Before in This Track',
      'Insert Bar After in This Track',
      'Delete This Bar in This Track',
      'Insert Bar After in All Tracks',
      'Delete This Bar in All Tracks',
    ]);
  });

  it('keeps its heading on one line, so the menu is as tall as it is placed (above the click)', () => {
    const heading = render({ trackName: 'A very long track name that would not fit on one line of the menu' }).renderer.root.findAllByType(Text)[0];
    expect(heading?.props.numberOfLines).toBe(1);
  });

  it('names the selected bars it acts on', () => {
    const menu = render({ target: { trackIndex: 0, firstIndex: 2, lastIndex: 5, string: 1, isSelection: true }, trackName: 'Guitar' });
    expect(menu.texts()).toEqual(expect.arrayContaining(['Bars 3–6 — Guitar', 'Delete Bars 3–6 in This Track', 'Delete Bars 3–6 in All Tracks']));
  });

  it('runs the item chosen', () => {
    const menu = render();
    ReactTestRenderer.act(() => menu.item('Insert Bar After in This Track').props.onPress());
    ReactTestRenderer.act(() => menu.item('Delete This Bar in All Tracks').props.onPress());
    expect((menu.props.onChoose as jest.Mock).mock.calls).toEqual([['insertAfter'], ['deleteInAllTracks']]);
  });

  it('closes on a click outside', () => {
    const menu = render();
    ReactTestRenderer.act(() => menu.renderer.root.findByProps({ testID: 'chrome-menu-backdrop' }).props.onPress());
    expect(menu.props.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens above the click, from the click’s left, inside the window', () => {
    // Act
    const views = render().renderer.root.findAllByType(View).map((view) => StyleSheet.flatten(view.props.style) as { left?: number; top?: number });
    // The menu is the last view placed by left and top (the backdrop before it fills the window).
    const box = views.filter((style) => style.top !== undefined && style.left !== undefined).at(-1);

    // Assert
    expect(box).toMatchObject({ left: 400, top: 640 - BAR_MENU_HEIGHT });
  });

  it('opens under the click when there is no room above it', () => {
    expect(barMenuTop({ x: 0, y: 600 })).toBe(600 - BAR_MENU_HEIGHT);
    expect(barMenuTop({ x: 0, y: 100 })).toBe(100);
  });
});
