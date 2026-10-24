import { type Song, type Track, renderMidi } from '@gp-editor/core';
import { DEFAULT_AUDIO_EXPORT, type AudioExportOptions } from '../src/export/audio-formats';
import {
  audioExportSeconds,
  audioExportSummary,
  audioSavedHint,
  planAudioExport,
  playedTrackIndexes,
  renderAudioFile,
  resolveAudioRange,
} from '../src/export/audio-export-plan';
import { base64ToBytes } from '../src/lib/base64';
import { beat, makeSong, note } from '../test-support/songs';

const ONE_TRACK = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(2, 5)])], [beat(8640, [note(3, 7)])], [beat(12480, [note(4, 2)])]]);

/** ONE_TRACK with more tracks after its guitar, each changed by `overrides`. */
function withTracks(...overrides: Partial<Track>[]): Song {
  const [guitar] = ONE_TRACK.tracks;
  if (guitar === undefined) {
    throw new Error('no track');
  }
  const more = overrides.map((override, index) => ({ ...guitar, number: index + 2, name: `Track ${index + 2}`, ...override }));
  return { ...ONE_TRACK, tracks: [guitar, ...more] };
}

const WAV: AudioExportOptions = DEFAULT_AUDIO_EXPORT;
const LOOP = { fromMeasureIndex: 1, toMeasureIndex: 2 };

describe('playedTrackIndexes', () => {
  it('leaves muted tracks out, and plays only the solo tracks when one is solo, as playback does', () => {
    // Arrange
    const muted = withTracks({ mute: true }, {});
    const solo = withTracks({ solo: true }, {});

    // Act
    const played = [playedTrackIndexes(muted), playedTrackIndexes(solo)];

    // Assert
    expect(played).toEqual([[0, 2], [1]]);
  });
});

describe('resolveAudioRange', () => {
  it('exports the loop’s bars when asked and a loop is set, else the whole song', () => {
    // Arrange
    const ranges = [resolveAudioRange('loop', LOOP), resolveAudioRange('loop', undefined), resolveAudioRange('song', LOOP)];

    // Act
    const resolved = ranges.map((range) => range ?? 'song');

    // Assert
    expect(resolved).toEqual([LOOP, 'song', 'song']);
  });
});

describe('planAudioExport', () => {
  it('makes one file of the whole song, named after the open file, with repeats unfolded at the written tempo', () => {
    // Arrange
    const options: AudioExportOptions = { ...WAV, formatId: 'mp3' };

    // Act
    const files = planAudioExport(ONE_TRACK, 'Song.gp5', options, undefined);

    // Assert
    expect(files).toEqual([{ name: 'Song.mp3', midiOptions: {} }]);
  });

  it('makes one file of the loop’s bars, as written, and says which bars in its name', () => {
    // Arrange
    const options: AudioExportOptions = { ...WAV, range: 'loop' };

    // Act
    const files = planAudioExport(ONE_TRACK, 'Song.gp5', options, LOOP);

    // Assert
    expect(files).toEqual([{ name: 'Song (bars 2–3).wav', midiOptions: { fromHeaderIndex: 1, toHeaderIndex: 2 } }]);
  });

  it('makes one file per playing track, each track alone, named with its number and a file-safe name', () => {
    // Arrange
    const song = withTracks({ name: 'Bass: 5/4', mute: true }, { name: '.Drums' });
    const options: AudioExportOptions = { ...WAV, isPerTrack: true, formatId: 'flac' };

    // Act
    const files = planAudioExport(song, 'Song.gp', options, undefined);

    // Assert
    expect(files).toEqual([
      { name: 'Song - 1 Guitar.flac', trackIndex: 0, midiOptions: { trackIndexes: [0] } },
      { name: 'Song - 3 Drums.flac', trackIndex: 2, midiOptions: { trackIndexes: [2] } },
    ]);
  });

  it('never asks for practice playback: no tempo scale, passes, metronome or count-in', () => {
    // Arrange
    const options: AudioExportOptions = { ...WAV, isPerTrack: true, range: 'loop' };

    // Act
    const keys = planAudioExport(withTracks({}), 'Song.gp5', options, LOOP).flatMap((file) => Object.keys(file.midiOptions));

    // Assert
    expect(new Set(keys)).toEqual(new Set(['fromHeaderIndex', 'toHeaderIndex', 'trackIndexes']));
  });

  it('makes the open file’s name file-safe too, so the folder of one file per track takes it (Finder’s "/" is a ":")', () => {
    // Arrange
    const song = withTracks({});

    // Act
    const names = [true, false].flatMap((isPerTrack) => planAudioExport(song, '.AC:DC - Back/Black.gp5', { ...WAV, isPerTrack }, undefined).map((file) => file.name));

    // Assert
    expect(names).toEqual(['AC-DC - Back-Black - 1 Guitar.wav', 'AC-DC - Back-Black - 2 Track 2.wav', 'AC-DC - Back-Black.wav']);
  });

  it('names a track without a name by its number', () => {
    // Arrange
    const song = withTracks({ name: '  ' });

    // Act
    const names = planAudioExport(song, 'Song.gp5', { ...WAV, isPerTrack: true }, undefined).map((file) => file.name);

    // Assert
    expect(names).toEqual(['Song - 1 Guitar.wav', 'Song - 2 Track 2.wav']);
  });
});

describe('renderAudioFile', () => {
  it('renders the file’s MIDI as playback does and gives the song’s length', () => {
    // Arrange
    const [file] = planAudioExport(ONE_TRACK, 'Song.gp5', { ...WAV, range: 'loop' }, LOOP);
    const expected = renderMidi(ONE_TRACK, { fromHeaderIndex: 1, toHeaderIndex: 2 });

    // Act
    const rendered = file === undefined ? undefined : renderAudioFile(ONE_TRACK, file);

    // Assert
    expect(base64ToBytes(rendered?.midi ?? '')).toEqual(expected.bytes);
    expect(rendered?.seconds).toBe(expected.durationSeconds);
  });
});

describe('audioExportSummary', () => {
  it('says what one file holds: its quality, its length and its name', () => {
    // Arrange
    const options: AudioExportOptions = { ...WAV, bitDepth: 24 };

    // Act
    const summary = audioExportSummary(ONE_TRACK, 'Song.gp5', options, undefined, audioExportSeconds(ONE_TRACK, options.range, undefined));

    // Assert
    expect(summary).toBe('WAV, 24-bit, 44.1 kHz · 00:08 and a tail until the sound dies away → Song.wav');
  });

  it('says how many files one per track makes, into a folder', () => {
    // Arrange
    const song = withTracks({}, {});

    // Act
    const summary = audioExportSummary(song, 'Song.gp5', { ...WAV, isPerTrack: true, range: 'loop' }, LOOP, audioExportSeconds(song, 'loop', LOOP));

    // Assert
    expect(summary).toBe(
      'WAV, 16-bit, 44.1 kHz · 00:04 and a tail until the sound dies away → 3 files, one per track: Song (bars 2–3) - 1 Guitar.wav … Song (bars 2–3) - 3 Track 3.wav, into a folder you choose',
    );
  });

  it('says so when no track plays', () => {
    // Arrange
    const [guitar] = ONE_TRACK.tracks;
    const song: Song = { ...ONE_TRACK, tracks: guitar === undefined ? [] : [{ ...guitar, mute: true }] };

    // Act
    const summary = audioExportSummary(song, 'Song.gp5', WAV, undefined, 8);

    // Assert
    expect(summary).toBe('Every track is muted: nothing to export.');
  });
});

describe('audioSavedHint', () => {
  it('names the saved file, its length and quality, and its folder', () => {
    // Arrange
    const written = [{ name: 'Song.wav', seconds: 10.6 }];

    // Act
    const hint = audioSavedHint(written, 'Music', WAV);

    // Assert
    expect(hint).toBe('Saved Song.wav (00:10, WAV, 16-bit, 44.1 kHz) in “Music”.');
  });

  it('counts the files of one per track', () => {
    // Arrange
    const written = ['Song - 1 Guitar.mp3', 'Song - 2 Bass.mp3', 'Song - 3 Drums.mp3'].map((name) => ({ name, seconds: 30 }));

    // Act
    const hint = audioSavedHint(written, 'Stems', { ...WAV, formatId: 'mp3', mp3Bitrate: 320 });

    // Assert
    expect(hint).toBe('Saved 3 audio files (MP3, 320 kbps, 44.1 kHz), one per track, in “Stems”: Song - 1 Guitar.mp3 … Song - 3 Drums.mp3.');
  });
});
