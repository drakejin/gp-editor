import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_MASTER, type Song, buildEffect, setTrackEffects } from '@gp-editor/core';
import { type AudioTools, useAudioTools } from '../src/hooks/use-audio-tools';
import type { MixLayout } from '../src/lib/mix';
import type { PanelId } from '../src/state/panels';
import { beat, makeSong, note } from '../test-support/songs';

const mockSetMix = jest.fn((_mix: MixLayout) => Promise.resolve());
const mockListeners: Record<string, () => void> = {};

jest.mock('../src/native/audio-effects', () => ({
  setPlayerMix: (mix: MixLayout) => mockSetMix(mix),
  loadLineInDevices: () => Promise.resolve({ devices: [], defaultId: '', isOutputBuiltIn: false }),
  startLineIn: () => Promise.resolve(),
  updateLineIn: () => Promise.resolve(),
  stopLineIn: () => Promise.resolve(),
  lineInLevel: () => Promise.resolve(-120),
  subscribeMixerRequests: (listener: () => void) => {
    mockListeners.mixer = listener;
    return () => undefined;
  },
  subscribeLineInRequests: (listener: () => void) => {
    mockListeners.lineIn = listener;
    return () => undefined;
  },
}));

const song = makeSong([[beat(960, [note(1, 0)])]]);

function renderHook(initial: Song, togglePanel: (panel: PanelId) => void) {
  let latest: AudioTools | undefined;
  function Probe({ shown }: { readonly shown: Song }) {
    latest = useAudioTools(shown, 0, togglePanel);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe shown={initial} />);
  });
  return {
    current: () => latest!,
    show: (shown: Song) => ReactTestRenderer.act(() => renderer.update(<Probe shown={shown} />)),
    unmount: () => ReactTestRenderer.act(() => renderer.unmount()),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('useAudioTools', () => {
  it('sends the song’s effects to the engine, again only when a chain or the master changes', () => {
    // Arrange
    const hook = renderHook(song, jest.fn());
    const withDrive = setTrackEffects(song, 0, [buildEffect('drive')]);

    // Act
    hook.show({ ...song, info: { ...song.info, title: 'Renamed' } });
    hook.show(withDrive);

    // Assert
    expect(mockSetMix.mock.calls.map(([mix]) => mix.tracks)).toEqual([[null], [[buildEffect('drive')]]]);
    expect(mockSetMix.mock.calls[0]?.[0].master).toBe(DEFAULT_MASTER);
    hook.unmount();
  });

  it('plays a dragged value in place of the song’s, then the song’s again', () => {
    // Arrange
    const hook = renderHook(song, jest.fn());
    mockSetMix.mockClear();

    // Act
    ReactTestRenderer.act(() => hook.current().previewMix({ trackIndex: 0, effects: [buildEffect('chorus')] }));
    ReactTestRenderer.act(() => hook.current().previewMix(undefined));

    // Assert
    expect(mockSetMix.mock.calls.map(([mix]) => mix.tracks)).toEqual([[[buildEffect('chorus')]], [null]]);
    hook.unmount();
  });

  it('toggles the mixer from View ▸ Mixer and opens the line in from Tools ▸ Line In…', async () => {
    // Arrange
    const togglePanel = jest.fn<void, [PanelId]>();
    const hook = renderHook(song, togglePanel);

    // Act
    ReactTestRenderer.act(() => mockListeners.mixer?.());
    await ReactTestRenderer.act(async () => {
      mockListeners.lineIn?.();
      await Promise.resolve();
    });

    // Assert
    expect(togglePanel).toHaveBeenCalledWith('mixer');
    expect(hook.current().lineIn.isOpen).toBe(true);
    hook.unmount();
  });
});
