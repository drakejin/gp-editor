import { type Song, buildAudioTrack, readSongFile, writeSong } from '@gp-editor/core';
import { songBytesFor, withLoadedAudio } from '../src/lib/audio-track-files';
import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import { audioData, loadAudioData } from '../src/native/audio-track';
import { makeSong } from '../test-support/songs';

jest.mock('../src/native/audio-track', () => ({
  loadAudioData: jest.fn(),
  audioData: jest.fn(),
}));

const loadMock = loadAudioData as jest.MockedFunction<typeof loadAudioData>;
const dataMock = audioData as jest.MockedFunction<typeof audioData>;

const AUDIO = Uint8Array.from({ length: 300 }, (_, index) => (index * 7) % 256);

function withAudio(): Song {
  return { ...makeSong([[], []]), audioTrack: buildAudioTrack({ assetId: 'file-id', fileExtension: 'ogg', originalFilePath: 'take.ogg' }) };
}

beforeEach(() => {
  loadMock.mockReset();
  dataMock.mockReset();
});

describe('opening a .gp file with an audio track', () => {
  it('hands the audio to the native side once and names it by the id it gives', async () => {
    // Arrange
    const file = readSongFile(writeSong(withAudio(), 'gp', { audioTrackData: AUDIO }));
    loadMock.mockResolvedValue({ assetId: 'native-id', durationSeconds: 1, sampleRate: 44100, channelCount: 2 });

    // Act
    const { song, hint } = await withLoadedAudio(file);

    // Assert
    expect(loadMock).toHaveBeenCalledWith(bytesToBase64(AUDIO), 'ogg');
    expect(song.audioTrack?.assetId).toBe('native-id');
    expect(hint).toBeUndefined();
  });

  it('opens the song with its audio track silent when macOS cannot play the file', async () => {
    // Arrange
    const file = readSongFile(writeSong(withAudio(), 'gp', { audioTrackData: AUDIO }));
    loadMock.mockRejectedValue(new Error('unknown format'));

    // Act
    const { song, hint } = await withLoadedAudio(file);

    // Assert
    expect(song.audioTrack?.assetId).toBe('file-id');
    expect(hint).toBe("The audio track's file cannot be played: unknown format.");
  });

  it('leaves a song without an audio track as it is', async () => {
    // Arrange
    const file = { song: makeSong([[]]) };

    // Act
    const opened = await withLoadedAudio(file);

    // Assert
    expect(opened.song).toBe(file.song);
    expect(loadMock).not.toHaveBeenCalled();
  });
});

describe('saving a song with an audio track', () => {
  it('embeds the audio file in a .gp file, fetched from the native side', async () => {
    // Arrange
    dataMock.mockResolvedValue(bytesToBase64(AUDIO));

    // Act
    const { bytes, hint } = await songBytesFor(withAudio(), 'gp');

    // Assert
    expect(dataMock).toHaveBeenCalledWith('file-id');
    expect(hint).toBeUndefined();
    expect(Array.from(readSongFile(bytes).audioTrackData ?? [])).toEqual(Array.from(AUDIO));
  });

  it('fetches nothing for GP5, GP4 and GP3, which leave the audio track out', async () => {
    // Arrange / Act
    const { bytes } = await songBytesFor(withAudio(), 'gp5');

    // Assert
    expect(dataMock).not.toHaveBeenCalled();
    expect(readSongFile(bytes).song.audioTrack).toBeUndefined();
  });

  it('saves without the audio track, and says so, when its file is not loaded', async () => {
    // Arrange
    dataMock.mockRejectedValue(new Error('The audio track’s file is not loaded'));

    // Act
    const { bytes, hint } = await songBytesFor(withAudio(), 'gp');

    // Assert
    expect(hint).toBe('The audio track was left out: The audio track’s file is not loaded.');
    expect(readSongFile(bytes).song.audioTrack).toBeUndefined();
    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(bytes.length);
  });
});
