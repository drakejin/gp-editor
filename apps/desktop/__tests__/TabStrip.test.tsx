import { ScrollView, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { TabStrip } from '../src/components/TabStrip';
import { TAB_STRIP } from '../src/lib/tab-strip';
import type { TabLabel } from '../src/state/workspace';
import { PALETTE } from '../test-support/score-helpers';

const TABS: readonly TabLabel[] = [
  { id: 'tab-1', title: 'Etude', fileName: 'Etude.gp5', isEdited: true },
  { id: 'tab-2', title: 'Riff', fileName: 'Riff.gpx', isEdited: false },
  { id: 'tab-3', title: 'Untitled', fileName: 'Untitled', isEdited: false },
];

function render(tabs: readonly TabLabel[] = TABS, activeTabId = 'tab-2') {
  const onSelect = jest.fn<void, [string]>();
  const onClose = jest.fn<void, [string]>();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TabStrip palette={PALETTE} tabs={tabs} activeTabId={activeTabId} onSelect={onSelect} onClose={onClose} />);
  });
  const byTestID = (testID: string) => renderer.root.findByProps({ testID });
  const press = (testID: string) => ReactTestRenderer.act(() => byTestID(testID).props.onPress());
  const flatStyle = (testID: string) => Object.assign({}, ...[byTestID(testID).props.style].flat(3).filter(Boolean));
  const textsIn = (testID: string) => byTestID(testID).findAllByType(Text).map((text) => text.props.children);
  return { renderer, onSelect, onClose, byTestID, press, flatStyle, textsIn };
}

describe('TabStrip', () => {
  it('shows a tab per document with its title, a • when edited and a × to close it', () => {
    // Act
    const strip = render();

    // Assert
    expect(strip.textsIn('tab-tab-1')).toEqual(['Etude', '•', '×']);
    expect(strip.textsIn('tab-tab-2')).toEqual(['Riff', '×']);
    expect(strip.textsIn('tab-tab-3')).toEqual(['Untitled', '×']);
  });

  it('cuts a long title short on one line and names the file in the tooltip', () => {
    const strip = render();
    const title = strip.byTestID('tab-tab-2').findAllByType(Text)[0];
    expect(title?.props.numberOfLines).toBe(1);
    expect(strip.byTestID('tab-tab-2').props.tooltip).toBe('Riff.gpx');
  });

  it('marks the shown tab as selected and lit; the others are not', () => {
    // Act
    const strip = render();

    // Assert
    expect(strip.byTestID('tab-tab-2').props.accessibilityState).toEqual({ selected: true });
    expect(strip.byTestID('tab-tab-1').props.accessibilityState).toEqual({ selected: false });
    expect(strip.flatStyle('tab-tab-2').backgroundColor).toBe(PALETTE.chromeRaised);
    expect(strip.flatStyle('tab-tab-1').backgroundColor).not.toBe(PALETTE.chromeRaised);
  });

  it('shows a tab when it is clicked and closes it with its ×', () => {
    // Arrange
    const strip = render();

    // Act
    strip.press('tab-tab-1');
    strip.press('close-tab-3');

    // Assert
    expect(strip.onSelect).toHaveBeenCalledWith('tab-1');
    expect(strip.onClose).toHaveBeenCalledWith('tab-3');
    expect(strip.onClose).toHaveBeenCalledTimes(1);
  });

  it('scrolls sideways, every tab between the narrowest and widest width', () => {
    // Arrange
    const many = Array.from({ length: 30 }, (_, i): TabLabel => ({ id: `tab-${i + 1}`, title: `Song ${i + 1}`, fileName: `Song ${i + 1}.gp5`, isEdited: false }));

    // Act
    const strip = render(many, 'tab-30');
    ReactTestRenderer.act(() => strip.byTestID('tab-strip').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 900, height: 28 } } }));

    // Assert
    expect(strip.renderer.root.findByType(ScrollView).props.horizontal).toBe(true);
    expect(strip.flatStyle('tab-tab-1').width).toBe(TAB_STRIP.minTabWidth);
  });
});
