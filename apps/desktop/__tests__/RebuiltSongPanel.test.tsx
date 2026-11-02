import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { RebuiltSongPanel } from '../src/components/RebuiltSongPanel';
import { PALETTE } from '../test-support/score-helpers';

function render() {
  const onShow = jest.fn();
  const onKeep = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<RebuiltSongPanel palette={PALETTE} name="Etude" onShow={onShow} onKeep={onKeep} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const press = (label: string) => ReactTestRenderer.act(() => buttons().find((button) => button.props.label === label)?.props.onPress());
  return { renderer, onShow, onKeep, buttons, press };
}

describe('RebuiltSongPanel', () => {
  it('says the PDF import rebuilt the edited tab’s song and offers to show it or keep the changes', () => {
    // Act
    const panel = render();

    // Assert
    const texts = panel.renderer.root.findAllByType(Text).map((text) => text.props.children);
    expect(texts).toContain('The PDF import rebuilt “Etude”');
    expect(panel.buttons().map((button) => button.props.label)).toEqual(['Keep My Changes', 'Show Rebuilt Song']);
    expect(panel.buttons().find((button) => button.props.label === 'Show Rebuilt Song')?.props.isActive).toBe(true);
  });

  it('answers Show and Keep; a click outside keeps the changes', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Show Rebuilt Song');
    panel.press('Keep My Changes');
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'rebuilt-song-backdrop' }).props.onPress());

    // Assert
    expect(panel.onShow).toHaveBeenCalledTimes(1);
    expect(panel.onKeep).toHaveBeenCalledTimes(2);
  });
});
