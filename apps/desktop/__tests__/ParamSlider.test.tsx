import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { effectParamSpec } from '@gp-editor/core';
import { ParamSlider, type ParamSliderProps } from '../src/components/effects/ParamSlider';
import { PALETTE } from '../test-support/score-helpers';

const WIDTH = 110;

function spec(type: Parameters<typeof effectParamSpec>[0], id: string) {
  const found = effectParamSpec(type, id);
  if (found === undefined) {
    throw new Error(`no ${type}.${id}`);
  }
  return found;
}

function render(overrides: Partial<ParamSliderProps>) {
  const onChange = jest.fn<void, [number]>();
  const onPreview = jest.fn<void, [number | undefined]>();
  const props: ParamSliderProps = { palette: PALETTE, spec: spec('delay', 'mix'), value: 25, width: WIDTH, onChange, onPreview, ...overrides };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ParamSlider {...props} />);
  });
  const surface = () => renderer.root.findAll((node) => typeof node.props.onPressIn === 'function')[0]!;
  const event = (x: number) => ({ nativeEvent: { locationX: x, pageX: 500 + x } });
  const texts = () => renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { renderer, surface, event, texts, onChange, onPreview };
}

describe('ParamSlider', () => {
  it('shows its label and value, plays the value while dragging and writes it when the drag ends', () => {
    // Arrange
    const slider = render({});

    // Act: press at the left end, drag to the right end
    ReactTestRenderer.act(() => slider.surface().props.onPressIn(slider.event(0)));
    ReactTestRenderer.act(() => slider.surface().props.onPressMove({ nativeEvent: { locationX: 0, pageX: 500 + WIDTH } }));
    const dragging = slider.texts();
    ReactTestRenderer.act(() => slider.surface().props.onPressOut({ nativeEvent: { locationX: 0, pageX: 500 + WIDTH } }));

    // Assert
    expect(slider.onPreview.mock.calls).toEqual([[0], [100]]);
    expect(dragging).toEqual(['Mix', '100%']);
    expect(slider.onChange.mock.calls).toEqual([[100]]);
    expect(slider.texts()).toEqual(['Mix', '25%']);
  });

  it('ends the preview without an edit when the drag comes back to where it started', () => {
    // Arrange
    const slider = render({ value: 0 });

    // Act
    ReactTestRenderer.act(() => slider.surface().props.onPressIn(slider.event(0)));
    ReactTestRenderer.act(() => slider.surface().props.onPressOut(slider.event(0)));

    // Assert
    expect(slider.onChange).not.toHaveBeenCalled();
    expect(slider.onPreview.mock.calls).toEqual([[0], [undefined]]);
  });

  it('steps through a choice with its previous and next buttons', () => {
    // Arrange
    const slider = render({ spec: spec('reverb', 'room'), value: 8 });

    // Act
    const [previous, next] = slider.renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
    ReactTestRenderer.act(() => previous?.props.onPress());
    ReactTestRenderer.act(() => next?.props.onPress());

    // Assert
    expect(slider.texts()).toContain('Cathedral');
    expect(slider.onChange.mock.calls).toEqual([[7], [0]]);
  });

  it('moves a twentieth of the way per VoiceOver step', () => {
    const slider = render({ value: 50 });
    ReactTestRenderer.act(() => slider.surface().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    ReactTestRenderer.act(() => slider.surface().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(slider.onChange.mock.calls).toEqual([[55], [45]]);
  });
});
