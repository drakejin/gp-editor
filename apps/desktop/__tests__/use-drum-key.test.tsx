import ReactTestRenderer from 'react-test-renderer';
import { type DrumKey, useDrumKey } from '../src/hooks/use-drum-key';

let mockMenuRequest: (() => void) | undefined;
jest.mock('../src/native/gp-files', () => ({
  subscribeDrumKeyRequests: (handler: () => void) => {
    mockMenuRequest = handler;
    return () => {
      mockMenuRequest = undefined;
    };
  },
}));

function renderHook(onClosed: () => void) {
  const latest: { current?: DrumKey } = {};
  function Probe() {
    latest.current = useDrumKey(onClosed);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return latest;
}

describe('useDrumKey', () => {
  it('opens and closes from View ▸ Drum Key and its buttons, the keyboard back to the score when it closes', () => {
    // Arrange
    const onClosed = jest.fn();
    const drumKey = renderHook(onClosed);

    // Act / Assert
    ReactTestRenderer.act(() => mockMenuRequest?.());
    expect(drumKey.current?.isOpen).toBe(true);
    ReactTestRenderer.act(() => drumKey.current?.toggle());
    expect(drumKey.current?.isOpen).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
    ReactTestRenderer.act(() => drumKey.current?.toggle());
    ReactTestRenderer.act(() => drumKey.current?.close());
    expect(drumKey.current?.isOpen).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(2);
  });

  it('keeps the choice of the whole kit', () => {
    const drumKey = renderHook(jest.fn());

    ReactTestRenderer.act(() => drumKey.current?.setShowsWholeKit(true));

    expect(drumKey.current?.showsWholeKit).toBe(true);
  });
});
