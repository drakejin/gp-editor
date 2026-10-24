import {
  AUDIO_FORMATS,
  type AudioExportOptions,
  DEFAULT_AUDIO_EXPORT,
  audioFileSettings,
  audioFormat,
  audioQualityText,
  mp3BitrateLabel,
  oggQualityLabel,
} from '../src/export/audio-formats';

const OPTIONS: AudioExportOptions = DEFAULT_AUDIO_EXPORT;

describe('AUDIO_FORMATS', () => {
  it('offers WAV, AIFF, FLAC, MP3 and Ogg Vorbis, each with its file extension and a note for the save panel', () => {
    // Arrange
    const ids = AUDIO_FORMATS.map((format) => format.id);

    // Act
    const extensions = AUDIO_FORMATS.map((format) => format.extension);

    // Assert
    expect(ids).toEqual(['wav', 'aiff', 'flac', 'mp3', 'ogg']);
    expect(extensions).toEqual(['wav', 'aiff', 'flac', 'mp3', 'ogg']);
    expect(AUDIO_FORMATS.every((format) => (format.note ?? '').length > 0)).toBe(true);
    expect(AUDIO_FORMATS.filter((format) => format.isLossless).map((format) => format.id)).toEqual(['wav', 'aiff', 'flac']);
  });

  it('finds a format by its id', () => {
    // Arrange
    const id = 'mp3';

    // Act
    const format = audioFormat(id);

    // Assert
    expect(format.label).toBe('MP3 (.mp3)');
  });
});

describe('audioFileSettings', () => {
  it('sends the native writer the format, sample rate and every quality setting', () => {
    // Arrange
    const options: AudioExportOptions = { ...OPTIONS, formatId: 'flac', sampleRate: 48000, bitDepth: 24, mp3Bitrate: 320, oggQuality: 8 };

    // Act
    const settings = audioFileSettings(options);

    // Assert
    expect(settings).toEqual({ format: 'flac', sampleRate: 48000, bitDepth: 24, mp3Bitrate: 320, oggQuality: 8 });
  });
});

describe('audioQualityText', () => {
  it('describes a lossless file by its bit depth and sample rate', () => {
    // Arrange
    const options: AudioExportOptions = { ...OPTIONS, formatId: 'aiff', bitDepth: 24, sampleRate: 48000 };

    // Act
    const text = audioQualityText(options);

    // Assert
    expect(text).toBe('AIFF, 24-bit, 48 kHz');
  });

  it('describes an MP3 by its bit rate, constant or variable', () => {
    // Arrange
    const constant: AudioExportOptions = { ...OPTIONS, formatId: 'mp3', mp3Bitrate: 192 };
    const variable: AudioExportOptions = { ...OPTIONS, formatId: 'mp3', mp3Bitrate: 0 };

    // Act
    const texts = [audioQualityText(constant), audioQualityText(variable)];

    // Assert
    expect(texts).toEqual(['MP3, 192 kbps, 44.1 kHz', 'MP3, VBR (V2, about 190 kbps), 44.1 kHz']);
  });

  it('describes an Ogg Vorbis file by its quality', () => {
    // Arrange
    const options: AudioExportOptions = { ...OPTIONS, formatId: 'ogg', oggQuality: 6 };

    // Act
    const text = audioQualityText(options);

    // Assert
    expect(text).toBe('Ogg Vorbis, quality 6 (about 192 kbps), 44.1 kHz');
  });
});

describe('quality labels', () => {
  it('labels the MP3 bit rates and Vorbis qualities for the panel buttons', () => {
    // Arrange
    const bitrates = [128, 0] as const;
    const qualities = [4, 10] as const;

    // Act
    const labels = [...bitrates.map(mp3BitrateLabel), ...qualities.map(oggQualityLabel)];

    // Assert
    expect(labels).toEqual(['128 kbps', 'VBR', 'Q4', 'Q10']);
  });
});
