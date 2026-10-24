import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { SongWriterPanel, type SongWriterPanelProps } from '../src/components/song-writer/SongWriterPanel';
import { INITIAL_DRAFT, type SongWriterStatus } from '../src/hooks/use-song-writer';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<SongWriterPanelProps> = {}) {
  const props: SongWriterPanelProps = {
    palette: PALETTE,
    draft: { ...INITIAL_DRAFT, title: 'Paper Boats' },
    onChangeDraft: jest.fn(),
    status: { kind: 'idle' },
    reference: 'nightwish.gp5 · Anette voice',
    hasKey: true,
    model: 'claude-opus-5-5',
    onSaveKey: jest.fn(() => Promise.resolve()),
    onChooseModel: jest.fn(),
    onWrite: jest.fn(),
    onCancel: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SongWriterPanel {...props} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((found) => found.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const input = (label: string) => renderer.root.findAllByType(TextInput).find((found) => found.props.accessibilityLabel === label);
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { props, button, press, input, texts };
}

describe('SongWriterPanel', () => {
  it('edits the title, lyrics and description of the draft', () => {
    // Arrange
    const panel = render();

    // Act
    ReactTestRenderer.act(() => panel.input('Title')?.props.onChangeText('Ink'));
    ReactTestRenderer.act(() => panel.input('Lyrics')?.props.onChangeText('la la'));
    ReactTestRenderer.act(() => panel.input('Description')?.props.onChangeText('slow'));

    // Assert
    expect(panel.input('Title')?.props.value).toBe('Paper Boats');
    expect((panel.props.onChangeDraft as jest.Mock).mock.calls).toEqual([[{ title: 'Ink' }], [{ lyrics: 'la la' }], [{ description: 'slow' }]]);
  });

  it('picks a genre and steps the length by 15 seconds', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Genre: Rock');
    panel.press('Longer');
    panel.press('Shorter');

    // Assert
    expect(panel.texts()).toContain('1:30');
    expect((panel.props.onChangeDraft as jest.Mock).mock.calls).toEqual([[{ genre: 'Rock' }], [{ lengthSeconds: 105 }], [{ lengthSeconds: 75 }]]);
  });

  it('builds on the open score only when there is one', () => {
    const withScore = render();
    withScore.press('Build on the open score: its notes, melody and rhythm');
    expect(withScore.props.onChangeDraft).toHaveBeenCalledWith({ usesReference: true });
    expect(render({ reference: undefined }).button('Build on the open score: its notes, melody and rhythm')?.props.isEnabled).toBe(false);
  });

  it('writes only with a key, and not while writing', () => {
    // Arrange
    const ready = render();

    // Act
    ready.press('Write the song');

    // Assert
    expect(ready.props.onWrite).toHaveBeenCalledTimes(1);
    expect(render({ hasKey: false }).button('Write the song')?.props.isEnabled).toBe(false);
    expect(render({ hasKey: false }).input('Anthropic API key')).toBeDefined();
  });

  it('takes the key in a plain field, never a secure one (it crashes the app on macOS 26)', () => {
    const field = render({ hasKey: false }).input('Anthropic API key');
    expect(field?.props.secureTextEntry).toBe(false);
    expect(field?.props.autoCorrect).toBe(false);
  });

  it('shows the progress and stops on request', () => {
    // Arrange
    const running: SongWriterStatus = { kind: 'running', step: { kind: 'writing', written: 1, total: 4, writing: ['Chorus'] } };
    const panel = render({ status: running });

    // Act
    panel.press('Stop writing');

    // Assert
    expect(panel.texts()).toContain('Writing Chorus… (1 of 4 sections done)');
    expect(panel.button('Write the song')?.props.isEnabled).toBe(false);
    expect(panel.props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('says why writing failed', () => {
    expect(render({ status: { kind: 'failed', message: 'Your credit balance is too low' } }).texts()).toContain('Your credit balance is too low');
  });
});
