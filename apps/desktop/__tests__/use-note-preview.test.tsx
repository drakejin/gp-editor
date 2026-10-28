import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import { useNotePreview } from '../src/hooks/use-note-preview';
import { PREVIEW_NOTE } from '../src/lib/note-preview';
import { makeSong } from '../test-support/songs';

const mockPreviewNote = jest.fn((_note: object) => Promise.resolve());

jest.mock('../src/native/player', () => ({
  previewNote: (note: object) => mockPreviewNote(note),
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
    expect(mockPreviewNote).toHaveBeenCalledWith({ midiChannel: 0, program: 27, key: 60, velocity: PREVIEW_NOTE.velocity, durationMs: PREVIEW_NOTE.durationMs, trackIndex: 0 });
  });

  it('gives nothing to hover while the setting is off, or without a song', () => {
    expect(renderPreview(false)).toBeUndefined();
    expect(renderPreview(true, null)).toBeUndefined();
  });
});
