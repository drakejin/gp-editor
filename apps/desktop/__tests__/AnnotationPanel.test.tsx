import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AnnotationPanel, type AnnotationPanelProps } from '../src/components/annotations/AnnotationPanel';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { setLanguage } from '../src/lib/i18n/i18n';
import { PALETTE } from '../test-support/score-helpers';

/** Every panel rendered by a test, unmounted before the language goes back to English. */
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function render(overrides: Partial<AnnotationPanelProps> = {}) {
  const props: AnnotationPanelProps = {
    palette: PALETTE,
    draft: { at: { trackIndex: 0, measureIndex: 2, beatIndex: 1 }, text: 'Watch the bend', placement: 'below', isEdited: false },
    hasAnnotation: true,
    onChangeText: jest.fn(),
    onChangePlacement: jest.fn(),
    onApply: jest.fn(),
    onDelete: jest.fn(),
    onMoveHere: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<AnnotationPanel {...props} />);
  });
  mounted.push(renderer);
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const button = (label: string) => buttons().find((found) => found.props.label === label);
  const press = (label: string) => ReactTestRenderer.act(() => button(label)?.props.onPress());
  const field = () => renderer.root.findAllByType(TextInput)[0];
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { props, button, buttons, press, field, texts };
}

describe('AnnotationPanel', () => {
  afterEach(() => {
    ReactTestRenderer.act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
    setLanguage('en');
  });

  it('shows where the annotation is, its placement lit, its text in a multi-line field', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['Annotation', 'Bar 3, beat 2']));
    expect(panel.button('Below')?.props.isActive).toBe(true);
    expect(panel.button('Above')?.props.isActive).toBe(false);
    expect(panel.field()?.props).toMatchObject({ value: 'Watch the bend', multiline: true, accessibilityLabel: 'Annotation text' });
  });

  it('types, places, applies, deletes and closes through its handlers', () => {
    // Arrange
    const panel = render({ draft: { at: { trackIndex: 0, measureIndex: 0, beatIndex: 0 }, text: 'x', placement: 'above', isEdited: true } });

    // Act
    ReactTestRenderer.act(() => panel.field()?.props.onChangeText('louder'));
    panel.press('Below');
    panel.press('Apply');
    panel.press('Delete');
    panel.press('Close');

    // Assert
    expect(panel.props.onChangeText).toHaveBeenCalledWith('louder');
    expect(panel.props.onChangePlacement).toHaveBeenCalledWith('below');
    expect(panel.props.onApply).toHaveBeenCalled();
    expect(panel.props.onDelete).toHaveBeenCalled();
    expect(panel.props.onClose).toHaveBeenCalled();
    expect(panel.texts()).toContain('Not written yet: Apply (⌘↩), or click another beat — what was typed goes on this one.');
  });

  it('applies on ⌘↩ and lets ↩ start a new line', () => {
    // Arrange
    const panel = render({ draft: { at: { trackIndex: 0, measureIndex: 0, beatIndex: 0 }, text: 'x', placement: 'above', isEdited: true } });
    const keyDown = (key: string, metaKey: boolean) => ReactTestRenderer.act(() => panel.field()?.props.onKeyDown({ nativeEvent: { key, metaKey }, stopPropagation: jest.fn() }));

    // Act
    keyDown('Enter', false);
    const afterReturn = (panel.props.onApply as jest.Mock).mock.calls.length;
    keyDown('Enter', true);

    // Assert
    expect(afterReturn).toBe(0);
    expect(panel.props.onApply).toHaveBeenCalledTimes(1);
    expect(panel.field()?.props.keyDownEvents).toEqual([{ key: 'Enter', metaKey: true }]);
  });

  it('greys Apply until something is typed and Delete on a beat without an annotation', () => {
    const panel = render({ hasAnnotation: false });
    expect(panel.button('Apply')?.props.isEnabled).toBe(false);
    expect(panel.button('Delete')?.props.isEnabled).toBe(false);
  });

  it('offers to move another beat’s annotation here, quoting it', () => {
    // Act
    const panel = render({ hasAnnotation: false, movable: { at: { trackIndex: 0, measureIndex: 0, beatIndex: 3 }, excerpt: 'breathe' } });
    panel.press('Move “breathe” here');

    // Assert
    expect(panel.button('Move “breathe” here')?.props.tooltip).toBe('Move the annotation of bar 1, beat 4 to this beat');
    expect(panel.props.onMoveHere).toHaveBeenCalled();
    expect(render().button('Move “breathe” here')).toBeUndefined();
  });

  it('speaks Korean', () => {
    setLanguage('ko');
    const panel = render();
    expect(panel.texts()).toEqual(expect.arrayContaining(['메모', '마디 3 · 2번째 박']));
    expect(panel.buttons().map((found) => found.props.label)).toEqual(['보표 위', '보표 아래', '적용', '삭제', '닫기']);
  });
});
