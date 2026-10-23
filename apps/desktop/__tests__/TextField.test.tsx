import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { TextField } from '../src/components/TextField';

function render(onKeyDown?: jest.Mock) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TextField value="" onChangeText={() => undefined} onKeyDown={onKeyDown} />);
  });
  return renderer.root.findByType(TextInput);
}

describe('TextField', () => {
  it('keeps its keys: they do not bubble on to the score’s key handler', () => {
    // Arrange
    const onKeyDown = jest.fn();
    const event = { nativeEvent: { key: '5' }, stopPropagation: jest.fn() };

    const field = render(onKeyDown);

    // Act
    ReactTestRenderer.act(() => field.props.onKeyDown(event));

    // Assert
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(event);
  });

  it('keeps its keys without a handler of its own too', () => {
    const event = { nativeEvent: { key: 'r' }, stopPropagation: jest.fn() };
    const field = render();
    ReactTestRenderer.act(() => field.props.onKeyDown(event));
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('lets Esc go on, so it closes the panel the field is in', () => {
    const event = { nativeEvent: { key: 'Escape' }, stopPropagation: jest.fn() };
    const field = render();
    ReactTestRenderer.act(() => field.props.onKeyDown(event));
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
