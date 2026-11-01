import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AiEditPanel, type AiEditPanelProps } from '../src/components/ai-edit/AiEditPanel';
import { ClaudeRow } from '../src/components/ai-wizard/ClaudeRow';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { INITIAL_AI_EDIT_DRAFT } from '../src/hooks/use-ai-edit';
import { withLanguage } from '../src/lib/i18n/i18n';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<AiEditPanelProps> = {}) {
  const props: AiEditPanelProps = {
    palette: PALETTE,
    draft: INITIAL_AI_EDIT_DRAFT,
    onChangeDraft: jest.fn(),
    status: { kind: 'idle' },
    hasScore: true,
    selectionBars: { first: 3, last: 5 },
    currentTrack: '1. Lead',
    hasKey: true,
    model: 'claude-opus-5-5',
    onSaveKey: jest.fn(() => Promise.resolve()),
    onChooseModel: jest.fn(),
    onRun: jest.fn(),
    onCancel: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<AiEditPanel {...props} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const button = (label: string) => buttons().find((found) => found.props.label === label);
  const press = (label: string) => ReactTestRenderer.act(() => button(label)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const changes = () => (props.onChangeDraft as jest.Mock).mock.calls.map(([change]: [unknown]) => change);
  return { props, button, press, texts, changes, renderer };
}

describe('AiEditPanel: the preset', () => {
  it('offers the scopes, the preset and the semitone stepper, and applies without Claude', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Selection: bars 3–5');
    panel.press('All tracks');
    panel.press('−');
    panel.press('+');
    panel.press('☐ Ask Claude to polish the fingering');
    panel.press('Apply');

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['-2', 'down 2 semitones']));
    expect(panel.changes()).toEqual([{ target: 'selection' }, { target: 'song' }, { semitones: -3 }, { semitones: -1 }, { isPolished: true }]);
    expect(panel.props.onRun).toHaveBeenCalledTimes(1);
    expect(panel.renderer.root.findAllByType(ClaudeRow)).toHaveLength(0);
  });

  it('stops the stepper at an octave either way and says when only the fingering changes', () => {
    // Arrange
    const down = render({ draft: { ...INITIAL_AI_EDIT_DRAFT, semitones: -12 } });
    const same = render({ draft: { ...INITIAL_AI_EDIT_DRAFT, semitones: 0 } });

    // Assert
    expect(down.button('−')?.props.isEnabled).toBe(false);
    expect(same.texts()).toContain('same key — only the fingering changes');
  });

  it('asks Claude, and shows the model row, when the polish is ticked', () => {
    // Arrange
    const panel = render({ draft: { ...INITIAL_AI_EDIT_DRAFT, isPolished: true }, hasKey: false });

    // Assert
    expect(panel.button('Ask Claude')?.props.isEnabled).toBe(false);
    expect(panel.renderer.root.findAllByType(ClaudeRow)).toHaveLength(1);
  });
});

describe('AiEditPanel: an instruction', () => {
  it('takes the request, fills it from an idea, and asks Claude', () => {
    // Arrange
    const panel = render({ draft: { ...INITIAL_AI_EDIT_DRAFT, kind: 'instruction', prompt: 'make it swing' } });
    const field = panel.renderer.root.findAllByType(TextInput).find((input) => input.props.accessibilityLabel === 'What Claude should change');

    // Act
    ReactTestRenderer.act(() => field?.props.onChangeText('simpler'));
    panel.press('Simplify the chords for a beginner');
    panel.press('Ask Claude');

    // Assert
    expect(field?.props.value).toBe('make it swing');
    expect(panel.changes()).toEqual([{ prompt: 'simpler' }, { prompt: 'Simplify the chords for a beginner' }]);
    expect(panel.props.onRun).toHaveBeenCalledTimes(1);
  });

  it('waits for words before it can ask, and says so', () => {
    // Arrange
    const panel = render({ draft: { ...INITIAL_AI_EDIT_DRAFT, kind: 'instruction', prompt: ' ' } });

    // Assert
    expect(panel.button('Ask Claude')?.props.isEnabled).toBe(false);
    expect(panel.texts()).toContain('Write what Claude should change, or pick an idea');
  });
});

describe('AiEditPanel: the run', () => {
  it('cannot use the selection when nothing is selected', () => {
    // Arrange
    const panel = render({ selectionBars: undefined, draft: { ...INITIAL_AI_EDIT_DRAFT, target: 'selection' } });

    // Assert
    expect(panel.button('Selection')?.props.isEnabled).toBe(false);
    expect(panel.button('Apply')?.props.isEnabled).toBe(false);
  });

  it('shows the part Claude is writing, a Stop button, and then the result', () => {
    // Arrange
    jest.useFakeTimers({ now: 1_000_000 });
    const running = render({ status: { kind: 'running', attempt: 1, startedAt: 1_000_000, part: { index: 2, count: 3 } } });
    const done = render({ status: { kind: 'done', result: { summary: 'Rewrote bars 1–4', detail: 'Claude read all 4 bars', warnings: ['Bars 5–8 were left as they were: busy'] } } });

    // Act
    ReactTestRenderer.act(() => jest.advanceTimersByTime(2000));
    running.press('Stop');

    // Assert
    expect(running.texts()).toContain('Claude is rewriting part 2 of 3… 2 s');
    expect(running.props.onCancel).toHaveBeenCalled();
    ReactTestRenderer.act(() => running.renderer.unmount());
    jest.useRealTimers();
    expect(done.texts()).toEqual(expect.arrayContaining(['Rewrote bars 1–4', 'Claude read all 4 bars', '• Bars 5–8 were left as they were: busy', 'Edit ▸ Undo takes it back in one step.']));
  });

  it('is in Korean when the app is', () => {
    // Act
    const texts = withLanguage('ko', () => render().texts());

    // Assert
    expect(texts).toEqual(expect.arrayContaining(['AI 수정', '키를 낮추고 잡기 쉬운 운지로', '2반음 아래로']));
  });
});
