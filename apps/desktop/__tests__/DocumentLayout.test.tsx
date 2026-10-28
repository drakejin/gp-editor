import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DocumentLayout } from '../src/components/DocumentLayout';

function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DocumentLayout left={<Text testID="left">palette</Text>} center={<Text testID="center">score</Text>} right={<Text testID="right">inspector</Text>} bottom={<Text testID="bottom">instruments</Text>} />,
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
});
