import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { KeyboardHomeContext, TextField, type TextFieldProps } from '../src/components/TextField';

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

  it('never makes a secure field: react-native-macos’s makes AppKit abort the app when it takes focus (macOS 26)', () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    // Act: the type refuses the prop; at run time it is overridden anyway
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        // @ts-expect-error secureTextEntry is not a TextField prop
        <TextField value="" onChangeText={() => undefined} secureTextEntry />,
      );
    });

    // Assert
    expect(renderer.root.findByType(TextInput).props.secureTextEntry).toBe(false);
  });

  it('lets Esc go on, so it closes the panel the field is in', () => {
    const event = { nativeEvent: { key: 'Escape' }, stopPropagation: jest.fn() };
    const field = render();
    ReactTestRenderer.act(() => field.props.onKeyDown(event));
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe('TextField leaving the window', () => {
  /** A field under the window’s keyboard home: its TextInput, and a way to take it away. */
  function mountUnderHome(home: jest.Mock, props: Partial<TextFieldProps> = {}) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <KeyboardHomeContext.Provider value={home}>
          <TextField value="" onChangeText={() => undefined} {...props} />
        </KeyboardHomeContext.Provider>,
      );
    });
    const input = renderer.root.findByType(TextInput);
    return { input, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
  }

  it('gives the keyboard back to the window’s home (the score) when it goes away with the keyboard: its panel closed', () => {
    // Arrange
    const home = jest.fn();
    const field = mountUnderHome(home);
    ReactTestRenderer.act(() => field.input.props.onFocus({ nativeEvent: {} }));

    // Act
    field.unmount();

    // Assert
    expect(home).toHaveBeenCalledTimes(1);
  });

  it('leaves the keyboard where it is when it goes away without it', () => {
    const home = jest.fn();
    const field = mountUnderHome(home);
    field.unmount();
    expect(home).not.toHaveBeenCalled();
  });

  it('leaves the keyboard where it is when it lost it before going away (another field took it)', () => {
    const home = jest.fn();
    const field = mountUnderHome(home);
    ReactTestRenderer.act(() => field.input.props.onFocus({ nativeEvent: {} }));
    ReactTestRenderer.act(() => field.input.props.onBlur({ nativeEvent: {} }));
    field.unmount();
    expect(home).not.toHaveBeenCalled();
  });

  it('still calls its own focus and blur handlers', () => {
    // Arrange
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const field = mountUnderHome(jest.fn(), { onFocus, onBlur });

    // Act
    ReactTestRenderer.act(() => field.input.props.onFocus({ nativeEvent: {} }));
    ReactTestRenderer.act(() => field.input.props.onBlur({ nativeEvent: {} }));

    // Assert
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
