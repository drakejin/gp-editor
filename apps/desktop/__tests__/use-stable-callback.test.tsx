import ReactTestRenderer from 'react-test-renderer';
import { useStableCallback } from '../src/hooks/use-stable-callback';

/** Renders a probe whose callback adds `offset`; returns the callbacks each render handed out and a re-render. */
function renderProbe(offset: number) {
  const handedOut: ((value: number) => number)[] = [];
  function Probe({ by }: { readonly by: number }) {
    handedOut.push(useStableCallback((value: number) => value + by));
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe by={offset} />);
  });
  const rerender = (by: number) => ReactTestRenderer.act(() => renderer.update(<Probe by={by} />));
  return { handedOut, rerender };
}

describe('useStableCallback', () => {
  it('hands out the same function on every render, so memoised children keep equal props', () => {
    // Arrange
    const { handedOut, rerender } = renderProbe(1);

    // Act
    rerender(2);
    rerender(3);

    // Assert
    expect(handedOut).toHaveLength(3);
    expect(new Set(handedOut).size).toBe(1);
  });

  it('calls the callback of the latest render', () => {
    // Arrange
    const { handedOut, rerender } = renderProbe(1);
    const first = handedOut[0];

    // Act
    rerender(10);

    // Assert
    expect(first?.(5)).toBe(15);
  });
});
