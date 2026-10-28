import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BarButton } from '../src/components/BarButton';
import { ImportPanel, type ImportPanelProps } from '../src/components/ImportPanel';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<ImportPanelProps> = {}) {
  const props: ImportPanelProps = {
    palette: PALETTE,
    hasKey: false,
    model: 'claude-opus-5-5',
    onSaveKey: jest.fn(() => Promise.resolve()),
    onRemoveKey: jest.fn(),
    onChooseModel: jest.fn(),
    onStart: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ImportPanel {...props} />);
  });
  const button = (label: string) => renderer.root.findAllByType(BarButton).find((found) => found.props.label === label);
  const field = () => renderer.root.findByType(TextInput);
  return { props, button, field };
}

describe('ImportPanel', () => {
  it('takes the key in a plain field, never a secure one (it crashes the app on macOS 26)', () => {
    const { field } = render();
    expect(field().props.secureTextEntry).toBe(false);
    expect(field().props.autoCorrect).toBe(false);
  });

  it('saves the typed key (GPAnthropic trims it), then clears the field', async () => {
    // Arrange
    const panel = render();
    ReactTestRenderer.act(() => panel.field().props.onChangeText('  sk-ant-test  '));

    // Act
    await ReactTestRenderer.act(async () => panel.button('Save key')?.props.onPress());

    // Assert
    expect(panel.props.onSaveKey).toHaveBeenCalledWith('  sk-ant-test  ');
    expect(panel.field().props.value).toBe('');
  });

  it('chooses a PDF only once a key is saved', () => {
    expect(render({ hasKey: false }).button('Choose PDF…')?.props.isEnabled).toBe(false);
    expect(render({ hasKey: true }).button('Choose PDF…')?.props.isEnabled).toBe(true);
  });
});
