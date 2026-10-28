import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { type Song, buildAudioTrack } from '@gp-editor/core';
import { AudioExportPanel } from '../src/components/AudioExportPanel';
import { BarButton } from '../src/components/BarButton';
import { type AudioExportOptions, DEFAULT_AUDIO_EXPORT } from '../src/export/audio-formats';
import type { AudioExportStatus } from '../src/hooks/use-audio-export';
import type { LoopRange } from '../src/state/practice';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** The audio track files the native side keeps (native/audio-track's isAudioLoaded). */
const mockLoadedAudio = new Set<string>();

jest.mock('../src/native/audio-track', () => ({
  isAudioLoaded: (assetId: string) => mockLoadedAudio.has(assetId),
}));

const SONG: Song = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(2, 5)])], [beat(8640, [note(3, 7)])]]);

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onChangeOptions: jest.Mock;
  readonly onExport: jest.Mock;
  readonly onCancel: jest.Mock;
  readonly onClose: jest.Mock;
}

interface RenderInput {
  readonly options?: AudioExportOptions;
  readonly status?: AudioExportStatus;
  readonly loop?: LoopRange;
  readonly song?: Song;
}

function render({ options = DEFAULT_AUDIO_EXPORT, status = { kind: 'idle' }, loop, song = SONG }: RenderInput = {}): Rendered {
  const onChangeOptions = jest.fn();
  const onExport = jest.fn();
  const onCancel = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AudioExportPanel
        palette={PALETTE}
        song={song}
        fileName="Song.gp5"
        loop={loop}
        options={options}
        status={status}
        onChangeOptions={onChangeOptions}
        onExport={onExport}
        onCancel={onCancel}
        onClose={onClose}
      />,
    );
  });
  return { renderer, onChangeOptions, onExport, onCancel, onClose };
}

function buttons({ renderer }: Rendered): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAllByType(BarButton);
}

function button(rendered: Rendered, label: string): ReactTestRenderer.ReactTestInstance {
  const found = buttons(rendered).find((candidate) => candidate.props.label === label);
  if (found === undefined) {
    throw new Error(`no button "${label}"`);
  }
  return found;
}

function labels(rendered: Rendered): string[] {
  return buttons(rendered).map((candidate) => candidate.props.label as string);
}

function texts({ renderer }: Rendered): string {
  return renderer.root
    .findAllByType(Text)
    .map((text) => (Array.isArray(text.props.children) ? text.props.children.join('') : String(text.props.children)))
    .join('\n');
}

describe('AudioExportPanel: settings', () => {
  it('offers the five formats, and for WAV its bit depths and sample rates', () => {
    // Arrange
    const rendered = render();

    // Act
    const shown = labels(rendered);

    // Assert
    expect(shown).toEqual(expect.arrayContaining(['WAV', 'AIFF', 'FLAC', 'MP3', 'Ogg Vorbis', '16-bit', '24-bit', '44.1 kHz', '48 kHz']));
    expect(button(rendered, 'WAV').props.isActive).toBe(true);
    expect(button(rendered, '16-bit').props.isActive).toBe(true);
  });

  it('offers the bit rates for MP3 and the qualities for Ogg Vorbis, not bit depths', () => {
    // Arrange
    const mp3 = render({ options: { ...DEFAULT_AUDIO_EXPORT, formatId: 'mp3' } });
    const ogg = render({ options: { ...DEFAULT_AUDIO_EXPORT, formatId: 'ogg' } });

    // Act
    const shown = [labels(mp3), labels(ogg)];

    // Assert
    expect(shown[0]).toEqual(expect.arrayContaining(['128 kbps', '192 kbps', '256 kbps', '320 kbps', 'VBR']));
    expect(shown[0]).not.toContain('16-bit');
    expect(shown[1]).toEqual(expect.arrayContaining(['Q4', 'Q6', 'Q8', 'Q10']));
  });

  it('changes a setting through onChangeOptions', () => {
    // Arrange
    const rendered = render();

    // Act
    ReactTestRenderer.act(() => button(rendered, 'FLAC').props.onPress());
    ReactTestRenderer.act(() => button(rendered, '48 kHz').props.onPress());
    ReactTestRenderer.act(() => button(rendered, 'One file per track').props.onPress());

    // Assert
    expect(rendered.onChangeOptions.mock.calls.map(([options]) => options)).toEqual([
      { ...DEFAULT_AUDIO_EXPORT, formatId: 'flac' },
      { ...DEFAULT_AUDIO_EXPORT, sampleRate: 48000 },
      { ...DEFAULT_AUDIO_EXPORT, isPerTrack: true },
    ]);
  });

  it('offers the loop’s bars only when a loop is set', () => {
    // Arrange
    const withoutLoop = render();
    const withLoop = render({ loop: { fromMeasureIndex: 1, toMeasureIndex: 2 } });
    const oneBar = render({ loop: { fromMeasureIndex: 4, toMeasureIndex: 4 } });

    // Act
    const loopButtons = [button(withoutLoop, 'Loop bars (none set)'), button(withLoop, 'Loop bars 2–3'), button(oneBar, 'Loop bar 5')];

    // Assert
    expect(loopButtons.map((candidate) => candidate.props.isEnabled)).toEqual([false, true, true]);
  });
});

describe('AudioExportPanel: exporting', () => {
  it('shows what it will write, and Export… starts it', () => {
    // Arrange
    const rendered = render();

    // Act
    ReactTestRenderer.act(() => button(rendered, 'Export…').props.onPress());

    // Assert
    expect(texts(rendered)).toContain('WAV, 16-bit, 44.1 kHz · 00:06 and a tail until the sound dies away → Song.wav');
    expect(rendered.onExport).toHaveBeenCalledTimes(1);
  });

  it('cannot export when every track is muted', () => {
    // Arrange
    const [guitar] = SONG.tracks;
    const muted: Song = { ...SONG, tracks: guitar === undefined ? [] : [{ ...guitar, mute: true }] };

    // Act
    const rendered = render({ song: muted });

    // Assert
    expect(button(rendered, 'Export…').props.isEnabled).toBe(false);
    expect(texts(rendered)).toContain('Every track is muted: nothing to export.');
  });

  it('shows the progress while rendering, with Cancel, and no settings to change', () => {
    // Arrange
    const status: AudioExportStatus = { kind: 'rendering', fileIndex: 1, fileCount: 3, fraction: 0.45 };

    // Act
    const rendered = render({ status });
    ReactTestRenderer.act(() => button(rendered, 'Cancel').props.onPress());

    // Assert
    expect(texts(rendered)).toContain('Rendering file 2 of 3: 45%');
    expect(rendered.onCancel).toHaveBeenCalledTimes(1);
    expect(button(rendered, 'Export…').props.isEnabled).toBe(false);
    expect(button(rendered, 'MP3').props.isEnabled).toBe(false);
  });

  it('says when it waits for the save panel and when it stops', () => {
    // Arrange
    const choosing = render({ status: { kind: 'choosing' } });
    const cancelling = render({ status: { kind: 'cancelling' } });

    // Act
    const shown = [texts(choosing), texts(cancelling)];

    // Assert
    expect(shown[0]).toContain('Choose where to save…');
    expect(shown[1]).toContain('Stopping…');
  });

  it('closes with Close', () => {
    // Arrange
    const rendered = render();

    // Act
    ReactTestRenderer.act(() => button(rendered, 'Close').props.onPress());

    // Assert
    expect(rendered.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AudioExportPanel: a song with an audio track', () => {
  const WITH_AUDIO: Song = {
    ...SONG,
    audioTrack: buildAudioTrack({ assetId: 'take', syncPoints: [{ measureIndex: 1, occurrence: 0, position: 0, seconds: 4 }] }),
  };

  afterEach(() => mockLoadedAudio.clear());

  it('says the song plays at the audio track’s pace, not at its own tempo, when its file is loaded', () => {
    // Arrange
    mockLoadedAudio.add('take');

    // Act
    const rendered = render({ song: WITH_AUDIO });

    // Assert
    expect(texts(rendered)).toContain('at the audio track’s pace with its recording under it.');
    expect(texts(rendered)).not.toContain('at its own tempo');
  });

  it('says the song plays at its own tempo while the audio track’s file is not loaded', () => {
    // Act
    const rendered = render({ song: WITH_AUDIO });

    // Assert
    expect(texts(rendered)).toContain('repeats unfolded, at its own tempo.');
  });
});
