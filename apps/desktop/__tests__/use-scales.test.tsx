import ReactTestRenderer from 'react-test-renderer';
import { type ScalesTool, useScales } from '../src/hooks/use-scales';

/** The hook's latest value, re-read after every act(). */
function renderScales(): () => ScalesTool {
  let tool: ScalesTool | undefined;
  function Probe() {
    tool = useScales();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => {
    if (tool === undefined) {
      throw new Error('the hook did not run');
    }
    return tool;
  };
}

describe('useScales', () => {
  it('opens and closes the panel, keeping the chosen scale marked after it closes', () => {
    // Arrange
    const current = renderScales();

    // Act
    ReactTestRenderer.act(() => current().open());
    ReactTestRenderer.act(() => current().choose({ rootIndex: 13, scaleIndex: 6 }));
    ReactTestRenderer.act(() => current().close());

    // Assert
    expect(current().isOpen).toBe(false);
    expect(current().choice).toEqual({ rootIndex: 13, scaleIndex: 6 });
    expect(current().highlight).toEqual({ pitchClasses: [9, 0, 2, 4, 7], root: 9 });
  });

  it('clears the marks', () => {
    const current = renderScales();
    ReactTestRenderer.act(() => current().choose({ rootIndex: 0, scaleIndex: 0 }));
    ReactTestRenderer.act(() => current().clear());
    expect(current().choice).toBeUndefined();
    expect(current().highlight).toBeUndefined();
  });
});
