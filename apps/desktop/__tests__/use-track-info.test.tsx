import ReactTestRenderer from 'react-test-renderer';
import { type TrackInfo, type TrackInfoScope, useTrackInfo } from '../src/hooks/use-track-info';

/** The hook in a probe whose scope the test changes; the hook's latest value, re-read after every act(). */
function renderTrackInfo(scope: TrackInfoScope) {
  const onClosed = jest.fn();
  let info: TrackInfo | undefined;
  function Probe(props: TrackInfoScope) {
    info = useTrackInfo(onClosed, props);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe {...scope} />);
  });
  const current = () => {
    if (info === undefined) {
      throw new Error('the hook did not run');
    }
    return info;
  };
  const rescope = (next: TrackInfoScope) => ReactTestRenderer.act(() => renderer.update(<Probe {...next} />));
  return { current, rescope, onClosed };
}

describe('useTrackInfo', () => {
  it('opens on a track beside a control and closes once, giving the keyboard back', () => {
    // Arrange
    const panel = renderTrackInfo({ tabId: 'a', trackCount: 3 });

    // Act
    ReactTestRenderer.act(() => panel.current().open(2, { x: 10, y: 600 }));
    const opened = { ...panel.current() };
    ReactTestRenderer.act(() => panel.current().close());
    ReactTestRenderer.act(() => panel.current().close());

    // Assert
    expect(opened).toEqual(expect.objectContaining({ isOpen: true, trackIndex: 2, anchor: { x: 10, y: 600 } }));
    expect(panel.current().isOpen).toBe(false);
    expect(panel.onClosed).toHaveBeenCalledTimes(1);
  });

  it('closes when another tab is shown, and stays closed when its tab comes back', () => {
    // Arrange
    const panel = renderTrackInfo({ tabId: 'a', trackCount: 3 });
    ReactTestRenderer.act(() => panel.current().open(1, { x: 0, y: 0 }));

    // Act
    panel.rescope({ tabId: 'b', trackCount: 3 });
    const inOtherTab = panel.current().isOpen;
    panel.rescope({ tabId: 'a', trackCount: 3 });

    // Assert
    expect(inOtherTab).toBe(false);
    expect(panel.current().isOpen).toBe(false);
    expect(panel.current().trackIndex).toBeUndefined();
  });

  it('is closed while its track is not in the song', () => {
    const panel = renderTrackInfo({ tabId: 'a', trackCount: 3 });
    ReactTestRenderer.act(() => panel.current().open(2, { x: 0, y: 0 }));
    panel.rescope({ tabId: 'a', trackCount: 2 });
    expect(panel.current().isOpen).toBe(false);
  });
});
