import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { BarButton } from '../src/components/BarButton';
import { TransposePanel } from '../src/components/TransposePanel';
import type { TranspositionDraft } from '../src/state/transposition';
import { PALETTE } from '../test-support/score-helpers';

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onTranspose: jest.Mock<void, [TranspositionDraft]>;
  readonly onClose: jest.Mock;
}

function render(selection?: string): Rendered {
  const onTranspose = jest.fn<void, [TranspositionDraft]>();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TransposePanel palette={PALETTE} trackName="Lead" selection={selection} onTranspose={onTranspose} onClose={onClose} />);
  });
  return { renderer, onTranspose, onClose };
}

function buttons({ renderer }: Rendered, label: string): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAllByType(BarButton).filter((candidate) => candidate.props.label === label);
}

function press(rendered: Rendered, label: string, index = 0): void {
  const found = buttons(rendered, label)[index];
  if (found === undefined) {
    throw new Error(`no button "${label}"`);
  }
  ReactTestRenderer.act(() => found.props.onPress());
}

function activeLabels({ renderer }: Rendered): string[] {
  return renderer.root.findAllByType(BarButton).filter((b) => b.props.isActive === true).map((b) => b.props.label as string);
}

function summary({ renderer }: Rendered): string {
  const texts = renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return texts[texts.length - 1] ?? '';
}

describe('TransposePanel', () => {
  it('starts two semitones up on the selection when there is one', () => {
    const rendered = render('4 beats from bars 3–4');
    expect(activeLabels(rendered)).toEqual(['Semitones', 'Selection']);
    expect(summary(rendered)).toBe('Up 2 semitones · 4 beats from bars 3–4');
  });

  it('starts on the shown track without a selection, and cannot pick the selection', () => {
    const rendered = render();
    expect(activeLabels(rendered)).toEqual(['Semitones', 'Track “Lead”']);
    expect(buttons(rendered, 'Selection')[0]?.props.isEnabled).toBe(false);
  });

  it('transposes by the typed amount and octaves, diatonically, on the whole song, chords only', () => {
    // Arrange
    const rendered = render();
    const field = rendered.renderer.root.findByType(TextInput);

    // Act
    press(rendered, 'Scale steps');
    ReactTestRenderer.act(() => field.props.onChangeText('-1'));
    press(rendered, '+', 1);
    press(rendered, 'Whole song');
    press(rendered, 'Chords only');
    press(rendered, 'Transpose');

    // Assert
    expect(rendered.onTranspose).toHaveBeenCalledWith({ mode: 'diatonic', amount: -1, octaves: 1, target: 'song', isChordsOnly: true });
    expect(summary(rendered)).toBe('Up 6 scale steps, chord names and diagrams only');
  });

  it('steps the amount with − and +, keeping the field in step, and ignores text that is not a number', () => {
    const rendered = render();
    const field = rendered.renderer.root.findByType(TextInput);
    press(rendered, '−');
    press(rendered, '−');
    press(rendered, '−');
    expect(field.props.value).toBe('-1');
    ReactTestRenderer.act(() => field.props.onChangeText('abc'));
    press(rendered, 'Transpose');
    expect(rendered.onTranspose).toHaveBeenCalledWith(expect.objectContaining({ amount: -1 }));
  });

  it('closes without transposing', () => {
    const rendered = render();
    press(rendered, 'Close');
    expect(rendered.onClose).toHaveBeenCalled();
    expect(rendered.onTranspose).not.toHaveBeenCalled();
  });
});
