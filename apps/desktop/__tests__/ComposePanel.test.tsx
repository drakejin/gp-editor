import { Pressable, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import {
  ComposePanel,
  type ComposePanelProps,
} from '../src/components/compose/ComposePanel';
import { INITIAL_COMPOSE_DRAFT } from '../src/hooks/use-compose';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<ComposePanelProps> = {}) {
  const props: ComposePanelProps = {
    palette: PALETTE,
    draft: { ...INITIAL_COMPOSE_DRAFT, startBar: 17 },
    onChangeDraft: jest.fn(),
    status: { kind: 'idle' },
    barCount: 32,
    cursorBar: 17,
    currentTrack: '1. Lead',
    hasKey: true,
    model: 'claude-opus-5-5',
    onSaveKey: jest.fn(() => Promise.resolve()),
    onChooseModel: jest.fn(),
    onCompose: jest.fn(),
    onCancel: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ComposePanel {...props} />);
  });
  const button = (tooltip: string) =>
    renderer.root
      .findAllByType(ChromeButton)
      .find(found => found.props.tooltip === tooltip);
  const press = (tooltip: string) =>
    ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const input = (label: string) =>
    renderer.root
      .findAllByType(TextInput)
      .find(found => found.props.accessibilityLabel === label);
  const texts = () =>
    renderer.root
      .findAllByType(Text)
      .map(text => [text.props.children].flat().join(''));
  const changes = () =>
    (props.onChangeDraft as jest.Mock).mock.calls.map(
      ([change]: [unknown]) => change,
    );
  return { props, button, press, input, texts, changes, renderer };
}

describe('ComposePanel', () => {
  it('shows the start bar at the cursor and steps, types or resets it within the score and one bar after it', () => {
    // Arrange
    const panel = render();
    const atEnd = render({ draft: { ...INITIAL_COMPOSE_DRAFT, startBar: 33 } });

    // Act
    panel.press('Start a bar earlier');
    panel.press('Start a bar later');
    ReactTestRenderer.act(() =>
      panel.input('Start bar')?.props.onChangeText('99'),
    );
    ReactTestRenderer.act(() =>
      panel.input('Start bar')?.props.onChangeText('5x'),
    );
    atEnd.press('Start at the cursor’s bar');

    // Assert
    expect(panel.input('Start bar')?.props.value).toBe('17');
    expect(panel.texts()).toContain('of 32');
    expect(panel.changes()).toEqual([
      { startBar: 16 },
      { startBar: 18 },
      { startBar: 33 },
      { startBar: 5 },
    ]);
    expect(atEnd.texts()).toContain('after the last bar');
    expect(atEnd.button('Start a bar later')?.props.isEnabled).toBe(false);
    expect(atEnd.changes()).toEqual([{ startBar: 17 }]);
  });

  it('chooses the current track or all tracks, new tracks, and how many bars', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Claude may write any track');
    panel.press('Claude may add tracks, e.g. a drum track or a bass line');
    panel.press('Claude writes at most this many bars');
    panel.press('More bars');
    panel.press('Claude decides how many bars the music needs');

    // Assert
    expect(
      panel.button('Claude writes only the track the cursor is on')?.props
        .label,
    ).toBe('Current track: 1. Lead');
    expect(
      panel.button('Claude writes only the track the cursor is on')?.props
        .isActive,
    ).toBe(true);
    expect(panel.changes()).toEqual([
      { scope: 'all' },
      { allowsNewTracks: false },
      { isLimited: true, barLimit: 8 },
      { isLimited: true, barLimit: 9 },
      { isLimited: false },
    ]);
  });

  it('takes the request in the user’s words', () => {
    // Arrange
    const panel = render();

    // Act
    ReactTestRenderer.act(() =>
      panel
        .input('What Claude should write')
        ?.props.onChangeText('drums: half-time groove'),
    );

    // Assert
    expect(panel.input('What Claude should write')?.props.multiline).toBe(true);
    expect(panel.changes()).toEqual([{ prompt: 'drums: half-time groove' }]);
  });

  it('composes only with a key and an open score, and not while composing', () => {
    // Arrange
    const ready = render();

    // Act
    ready.press('Ask Claude to write the bars');

    // Assert
    expect(ready.props.onCompose).toHaveBeenCalledTimes(1);
    expect(
      render({ hasKey: false }).button('Ask Claude to write the bars')?.props
        .isEnabled,
    ).toBe(false);
    expect(render({ barCount: undefined }).texts()).toContain(
      'Open a score to compose in it',
    );
    expect(
      render({ barCount: undefined }).button('Ask Claude to write the bars')
        ?.props.isEnabled,
    ).toBe(false);
  });

  it('while composing, counts the seconds, offers Stop and does not close from the backdrop', () => {
    // Arrange
    jest.useFakeTimers({ now: 1_000_000 });
    const panel = render({
      status: { kind: 'running', attempt: 2, startedAt: 1_000_000 },
    });

    // Act
    ReactTestRenderer.act(() => jest.advanceTimersByTime(3000));
    panel.press('Stop composing; the score stays as it is');

    // Assert
    expect(panel.texts()).toContain(
      'Asking Claude again (attempt 2 of 3)… 3 s',
    );
    expect(panel.props.onCancel).toHaveBeenCalledTimes(1);
    expect(panel.button('Ask Claude to write the bars')?.props.isEnabled).toBe(
      false,
    );
    expect(
      panel.renderer.root
        .findAllByType(Pressable)
        .find(found => found.props.testID === 'compose-backdrop')?.props
        .onPress,
    ).toBeUndefined();
    jest.useRealTimers();
  });

  it('says when a stopped answer is still coming or Claude writes in another tab, and keeps Compose off', () => {
    // Act
    const stopping = render({ status: { kind: 'stopping' } });
    const elsewhere = render({ status: { kind: 'elsewhere' } });

    // Assert
    expect(stopping.texts()).toContain('Stopping — the answer already asked for is still coming; nothing will be written');
    expect(elsewhere.texts()).toContain('Claude is composing in another tab…');
    expect(stopping.button('Ask Claude to write the bars')?.props.isEnabled).toBe(false);
    expect(elsewhere.button('Ask Claude to write the bars')?.props.isEnabled).toBe(false);
  });

  it('shows what was written, what Claude read, the tokens and the warnings; or why it failed', () => {
    // Arrange
    const result = {
      summary:
        'Composed 8 bars from bar 17 · new: Drums · 143 notes · 2 warnings',
      reading: 'Claude read all 32 bars',
      warnings: [
        'Bar 18, Bass: 1 note left out (no free string)',
        'kept it simple',
      ],
      usage: { inputTokens: 31200, outputTokens: 4100 },
    };

    // Act
    const done = render({ status: { kind: 'done', result } });
    const failed = render({
      status: { kind: 'failed', message: 'prompt is too long' },
    });

    // Assert
    expect(done.texts()).toEqual(
      expect.arrayContaining([
        result.summary,
        'Claude read all 32 bars · 31200 tokens in, 4100 out',
        '• Bar 18, Bass: 1 note left out (no free string)',
        '• kept it simple',
        'Edit ▸ Undo takes it back in one step.',
      ]),
    );
    expect(failed.texts()).toContain('prompt is too long');
  });
});
