import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { SaveChangesPanel } from '../src/components/SaveChangesPanel';
import { PALETTE } from '../test-support/score-helpers';

function render() {
  const onSave = jest.fn();
  const onDiscard = jest.fn();
  const onCancel = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SaveChangesPanel palette={PALETTE} name="Etude" onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const press = (label: string) => ReactTestRenderer.act(() => buttons().find((button) => button.props.label === label)?.props.onPress());
  return { renderer, onSave, onDiscard, onCancel, buttons, press };
}

describe('SaveChangesPanel', () => {
  it('asks whether to save the tab’s changes, naming it', () => {
    // Act
    const panel = render();

    // Assert
    const texts = panel.renderer.root.findAllByType(Text).map((text) => text.props.children);
    expect(texts).toContain('Save changes to “Etude”?');
    expect(panel.buttons().map((button) => button.props.label)).toEqual(['Don’t Save', 'Cancel', 'Save']);
    expect(panel.buttons().find((button) => button.props.label === 'Save')?.props.isActive).toBe(true);
  });

  it('answers Save, Don’t Save and Cancel', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Save');
    panel.press('Don’t Save');
    panel.press('Cancel');

    // Assert
    expect(panel.onSave).toHaveBeenCalledTimes(1);
    expect(panel.onDiscard).toHaveBeenCalledTimes(1);
    expect(panel.onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on a click outside the panel', () => {
    const panel = render();
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'save-changes-backdrop' }).props.onPress());
    expect(panel.onCancel).toHaveBeenCalledTimes(1);
    expect(panel.onDiscard).not.toHaveBeenCalled();
  });
});
