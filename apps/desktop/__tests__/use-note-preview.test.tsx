import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import { useNotePreview } from '../src/hooks/use-note-preview';
import { PREVIEW_NOTE } from '../src/lib/note-preview';
import { makeSong } from '../test-support/songs';

const mockPreviewNote = jest.fn((..._args: number[]) => Promise.resolve());

jest.mock('../src/native/player', () => ({
  previewNote: (...args: number[]) => mockPreviewNote(...args),
}));

const base = makeSong([[]]);
const SONG: Song = { ...base, channels: [{ ...DEFAULT_CHANNEL, id: 1, program: 27 }], tracks: [{ ...base.tracks[0]!, channelId: 1 }] };

/** `null`: no song open. */
function renderPreview(isEnabled: boolean, song: Song | null = SONG): ((pitch: number) => void) | undefined {
  let latest: ((pitch: number) => void) | undefined;
  function Probe() {
    latest = useNotePreview(song ?? undefined, 0, isEnabled);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return latest;
}

beforeEach(() => jest.clearAllMocks());

describe('useNotePreview', () => {
  it('plays a hovered pitch with the track’s program on its MIDI channel', () => {
    // Act
    renderPreview(true)?.(60);

    // Assert
    expect(mockPreviewNote).toHaveBeenCalledWith(0, 27, 60, PREVIEW_NOTE.velocity, PREVIEW_NOTE.durationMs);
  });

  it('gives nothing to hover while the setting is off, or without a song', () => {
    expect(renderPreview(false)).toBeUndefined();
    expect(renderPreview(true, null)).toBeUndefined();
  });
});
