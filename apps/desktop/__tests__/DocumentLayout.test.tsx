import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DocumentLayout, MIN_SCORE_HEIGHT } from '../src/components/DocumentLayout';

function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DocumentLayout
        top={<Text testID="top">hint</Text>}
        left={<Text testID="left">palette</Text>}
        center={<Text testID="center">score</Text>}
        right={<Text testID="right">inspector</Text>}
        bottom={<Text testID="bottom">instruments</Text>}
      />,
    );
  });
  return renderer;
}

/** The nearest View holding the element with `testID`. */
function parentView(renderer: ReactTestRenderer.ReactTestRenderer, testID: string) {
  let node = renderer.root.findByProps({ testID }).parent;
  while (node !== null && node.type !== View) {
    node = node.parent;
  }
  return node;
}

describe('DocumentLayout', () => {
  it('runs the edition palette down the whole left side, as Guitar Pro 8 does, so the bottom panels do not shorten it', () => {
    // Act
    const renderer = render();

    // Assert: the palette sits in the window row; the bottom panels share a column with the score and inspector only
    const window = parentView(renderer, 'left');
    const bottomColumn = parentView(renderer, 'bottom');
    expect(bottomColumn).not.toBe(window);
    expect(window?.findAllByProps({ testID: 'bottom' }).length).toBeGreaterThan(0);
    expect(bottomColumn?.findAllByProps({ testID: 'left' })).toHaveLength(0);
    expect(bottomColumn?.findAllByProps({ testID: 'center' }).length).toBeGreaterThan(0);
  });

  it('opens the hint, the panels and the banners (top) over the score, in the column beside the palette, so they do not shorten it', () => {
    // Act
    const renderer = render();

    // Assert: the top's column (it scrolls in its own view) holds the score and the bottom panels, not the palette; the top comes first in it
    const topColumn = parentView(renderer, 'bottom');
    expect(topColumn?.findByType(ScrollView).findAllByProps({ testID: 'top' }).length).toBeGreaterThan(0);
    expect(topColumn?.findAllByProps({ testID: 'left' })).toHaveLength(0);
    expect(topColumn?.findAllByProps({ testID: 'center' }).length).toBeGreaterThan(0);
    const order = (topColumn?.findAll((node) => typeof node.props.testID === 'string' && node.type === Text) ?? []).map((node) => node.props.testID);
    expect(order.slice(0, 2)).toEqual(['top', 'center']);
  });

  it('keeps the score at least MIN_SCORE_HEIGHT tall: the panels over it scroll when they would take more', () => {
    // Act
    const renderer = render();

    // Assert: the top scrolls and gives way; the score's row never goes under the minimum
    const scroller = renderer.root.findByType(ScrollView);
    expect(scroller.findAllByProps({ testID: 'top' }).length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(scroller.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    const scoreRow = parentView(renderer, 'right');
    expect(StyleSheet.flatten(scoreRow?.props.style)).toMatchObject({ flex: 1, minHeight: MIN_SCORE_HEIGHT });
    expect(MIN_SCORE_HEIGHT).toBeGreaterThanOrEqual(160);
  });
});
