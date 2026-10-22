import ReactTestRenderer from 'react-test-renderer';
import { MIXER, MixerSlider, type MixerSliderProps, formatMixerValue, sliderThumbX, sliderValueAt } from '../src/components/MixerSlider';
import { PALETTE } from '../test-support/score-helpers';

const WIDTH = 137;

interface Pointer {
  readonly locationX: number;
  readonly pageX: number;
}

function render(overrides: Partial<MixerSliderProps> = {}) {
  const onChange = jest.fn<void, [number]>();
  const props: MixerSliderProps = { value: 100, width: WIDTH, label: 'Volume', palette: PALETTE, onChange, ...overrides };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<MixerSlider {...props} />);
  });
  const surface = () => renderer.root.findByProps({ accessibilityRole: 'adjustable' });
  const event = ({ locationX, pageX }: Pointer) => ({ nativeEvent: { locationX, pageX } });
  // The page is 300 pt left of the slider, so pageX = 300 + x while the pointer is over it.
  const at = (x: number): Pointer => ({ locationX: x, pageX: 300 + x });
  const grant = (x: number) => ReactTestRenderer.act(() => surface().props.onResponderGrant(event(at(x))));
  const move = (x: number) => ReactTestRenderer.act(() => surface().props.onResponderMove(event({ locationX: 0, pageX: 300 + x })));
  const release = (x: number) => ReactTestRenderer.act(() => surface().props.onResponderRelease(event({ locationX: 0, pageX: 300 + x })));
  const thumbLeft = () => {
    const thumb = renderer.root.findByProps({ testID: 'mixer-slider-thumb' });
    return [thumb.props.style].flat().reduce((left: number, style: { left?: number } | null) => style?.left ?? left, Number.NaN);
  };
  return { renderer, surface, grant, move, release, thumbLeft, onChange, props };
}

describe('slider geometry', () => {
  it('maps the ends of the track to 0 and 127 and clamps beyond them', () => {
    // Arrange
    const left = sliderThumbX(0, WIDTH);
    const right = sliderThumbX(MIXER.max, WIDTH);

    // Act / Assert
    expect(sliderValueAt(left, WIDTH)).toBe(0);
    expect(sliderValueAt(right, WIDTH)).toBe(127);
    expect(sliderValueAt(-50, WIDTH)).toBe(0);
    expect(sliderValueAt(WIDTH + 50, WIDTH)).toBe(127);
    expect(sliderValueAt(sliderThumbX(64, WIDTH), WIDTH)).toBe(64);
  });

  it('keeps the thumb inside the track', () => {
    expect(sliderThumbX(0, WIDTH)).toBe(MIXER.thumbSize / 2);
    expect(sliderThumbX(127, WIDTH)).toBe(WIDTH - MIXER.thumbSize / 2);
  });

  it('writes a volume as its number and a pan from the centre', () => {
    expect(formatMixerValue(100, false)).toBe('100');
    expect(formatMixerValue(64, true)).toBe('centre');
    expect(formatMixerValue(44, true)).toBe('L 20');
    expect(formatMixerValue(127, true)).toBe('R 63');
  });
});

describe('MixerSlider dragging', () => {
  it('jumps to the value under a click and reports it on release', () => {
    // Arrange
    const slider = render();
    const x = sliderThumbX(30, WIDTH);

    // Act
    slider.grant(x);
    slider.release(x);

    // Assert
    expect(slider.onChange).toHaveBeenCalledTimes(1);
    expect(slider.onChange).toHaveBeenCalledWith(30);
  });

  it('follows the pointer while dragging and reports only once, when the drag ends', () => {
    // Arrange
    const slider = render();
    const start = sliderThumbX(100, WIDTH);

    // Act
    slider.grant(start);
    slider.move(sliderThumbX(60, WIDTH));
    const leftWhileDragging = slider.thumbLeft();
    slider.move(sliderThumbX(40, WIDTH));

    // Assert
    expect(slider.onChange).not.toHaveBeenCalled();
    expect(leftWhileDragging).toBe(sliderThumbX(60, WIDTH) - MIXER.thumbSize / 2);
    slider.release(sliderThumbX(40, WIDTH));
    expect(slider.onChange).toHaveBeenCalledTimes(1);
    expect(slider.onChange).toHaveBeenCalledWith(40);
  });

  it('clamps a drag past the end of the track to 127', () => {
    // Arrange
    const slider = render({ value: 10 });

    // Act
    slider.grant(sliderThumbX(10, WIDTH));
    slider.release(WIDTH + 200);

    // Assert
    expect(slider.onChange).toHaveBeenCalledWith(127);
  });

  it('reports nothing when the drag ends where it began', () => {
    const slider = render({ value: 100 });
    slider.grant(sliderThumbX(100, WIDTH));
    slider.release(sliderThumbX(100, WIDTH));
    expect(slider.onChange).not.toHaveBeenCalled();
  });

  it('drops a drag another view takes over, without reporting it', () => {
    // Arrange
    const slider = render();
    slider.grant(sliderThumbX(20, WIDTH));

    // Act
    ReactTestRenderer.act(() => slider.surface().props.onResponderTerminate());

    // Assert
    expect(slider.onChange).not.toHaveBeenCalled();
    expect(slider.thumbLeft()).toBe(sliderThumbX(100, WIDTH) - MIXER.thumbSize / 2);
  });

  it('does not take the pointer or VoiceOver steps when disabled, and says so', () => {
    // Arrange
    const slider = render({ isEnabled: false });

    // Act
    ReactTestRenderer.act(() => slider.surface().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));

    // Assert
    expect(slider.surface().props.onStartShouldSetResponder()).toBe(false);
    expect(slider.onChange).not.toHaveBeenCalled();
    expect(slider.surface().props.accessibilityState).toEqual({ disabled: true });
  });

  it('keeps the drag when a scroll view asks for it', () => {
    const slider = render();
    expect(slider.surface().props.onStartShouldSetResponder()).toBe(true);
    expect(slider.surface().props.onResponderTerminationRequest()).toBe(false);
  });
});

describe('MixerSlider look and accessibility', () => {
  it('names itself and its value for VoiceOver and the tooltip', () => {
    // Act
    const slider = render({ value: 44, label: 'Pan', isCentred: true });

    // Assert
    const props = slider.surface().props;
    expect(props.accessibilityLabel).toBe('Pan');
    expect(props.accessibilityValue).toEqual({ min: 0, max: 127, now: 44, text: 'L 20' });
    expect(props.tooltip).toBe('Pan: L 20');
  });

  it('fills a centred slider from the centre to the thumb', () => {
    // Act
    const slider = render({ value: 30, isCentred: true });

    // Assert
    const fill = slider.renderer.root.findByProps({ testID: 'mixer-slider-fill' });
    const style = Object.assign({}, ...[fill.props.style].flat()) as { left: number; width: number };
    expect(style.left).toBeCloseTo(sliderThumbX(30, WIDTH));
    expect(style.left + style.width).toBeCloseTo(sliderThumbX(64, WIDTH));
  });

  it('fills a volume slider from the left end to the thumb', () => {
    const slider = render({ value: 127 });
    const fill = slider.renderer.root.findByProps({ testID: 'mixer-slider-fill' });
    const style = Object.assign({}, ...[fill.props.style].flat()) as { left: number; width: number };
    expect(style.left).toBe(0);
    expect(style.width).toBeCloseTo(sliderThumbX(127, WIDTH));
  });

  it('steps by VoiceOver increments, clamped', () => {
    // Arrange
    const slider = render({ value: 124 });

    // Act
    ReactTestRenderer.act(() => slider.surface().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));

    // Assert
    expect(slider.onChange).toHaveBeenCalledWith(127);
  });
});
