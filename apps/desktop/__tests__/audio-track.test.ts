import { buildAudioTrack, buildSyncMap, type Song } from '@gp-editor/core';
import {
  audioGain,
  audioTrackChange,
  audioPlaybackOf,
  audioSecondsAtRender,
  formatDetune,
  isAudioTrackAudible,
  nearestOccurrence,
  newAudioTrackFields,
  parseAudioPeaks,
  shiftDetune,
  sliderToVolume,
  syncPointAt,
  volumeToSlider,
} from '../src/lib/audio-track';
import { bytesToBase64 } from '../src/lib/base64';
import { header, makeSong } from '../test-support/songs';

/** Four empty bars of 4/4 at 120 BPM (two seconds each) with an audio track. */
function withAudio(extra: Partial<Parameters<typeof buildAudioTrack>[0]> = {}, song: Song = makeSong([[], [], [], []])): Song {
  return { ...song, audioTrack: buildAudioTrack({ assetId: 'take', ...extra }) };
}

const RUN = { atSeconds: 1, fromSeconds: 10, toSeconds: 14, rate: 0.5 };

describe('audio track volume', () => {
  it('maps the 0–1 fader onto the mixer slider and back', () => {
    // Arrange / Act / Assert
    expect(volumeToSlider(0.8)).toBe(102);
    expect(volumeToSlider(2)).toBe(127);
    expect(sliderToVolume(127)).toBe(1);
    expect(sliderToVolume(-3)).toBe(0);
  });

  it('plays the fader on the curve of a MIDI volume', () => {
    // Arrange / Act / Assert
    expect(audioGain(0.5)).toBe(0.25);
    expect(audioGain(1.5)).toBe(1);
  });
});

describe('when the audio track plays', () => {
  it('plays unless muted, or silenced by another solo track', () => {
    // Arrange
    const song = withAudio();
    const [track] = song.tracks;
    const soloTrack: Song = { ...song, tracks: track === undefined ? [] : [{ ...track, solo: true }] };

    // Act / Assert
    expect(isAudioTrackAudible(song)).toBe(true);
    expect(isAudioTrackAudible(withAudio({ mute: true }))).toBe(false);
    expect(isAudioTrackAudible(soloTrack)).toBe(false);
    expect(isAudioTrackAudible({ ...soloTrack, audioTrack: buildAudioTrack({ assetId: 'take', solo: true }) })).toBe(true);
    expect(isAudioTrackAudible(makeSong([[]]))).toBe(false);
  });

  it('gives the native player the runs, the gain and the detune', () => {
    // Arrange
    const song = withAudio({ volume: 0.5, detuneCents: -30 });

    // Act
    const playback = audioPlaybackOf(song, [RUN]);

    // Assert
    expect(playback).toEqual({ assetId: 'take', runs: [RUN], gain: 0.25, detuneCents: -30 });
    expect(audioPlaybackOf(song, [])).toBeNull();
    expect(audioPlaybackOf(withAudio({ mute: true }), [RUN])).toBeNull();
  });

  it('finds the moment of the audio heard at a second of the render', () => {
    // Arrange / Act / Assert
    expect(audioSecondsAtRender([RUN], 3)).toBe(11);
    expect(audioSecondsAtRender([RUN], 0.5)).toBeUndefined();
    expect(audioSecondsAtRender([RUN], 20)).toBeUndefined();
    expect(audioSecondsAtRender(undefined, 3)).toBeUndefined();
  });
});

describe('detune', () => {
  it('reads in cents with a sign and stays within two octaves', () => {
    // Arrange / Act / Assert
    expect(formatDetune(0)).toBe('0 ¢');
    expect(formatDetune(120)).toBe('+120 ¢');
    expect(formatDetune(-50)).toBe('−50 ¢');
    expect(shiftDetune(2390, 100)).toBe(2400);
    expect(shiftDetune(-2390, -100)).toBe(-2400);
  });
});

describe('sync points from the cursor', () => {
  it('marks the start of the bar’s occurrence heard nearest to now', () => {
    // Arrange: bars 1–2 repeat, so bar 1 plays at 0 s and 4 s
    const repeated = makeSong([[], [], []], [header(1, { repeatOpen: true }), header(2, { repeatClose: 1 }), header(3)]);
    const map = buildSyncMap(withAudio({}, repeated));

    // Act / Assert
    expect(nearestOccurrence(map, 0, 3.5)).toBe(1);
    expect(nearestOccurrence(map, 0, 0.5)).toBe(0);
    expect(nearestOccurrence(map, 0, undefined)).toBe(0);
    expect(syncPointAt(map, 0, 4.2)).toEqual({ measureIndex: 0, occurrence: 1, position: 0, seconds: 4.2 });
  });

  it('names a new audio track after its file', () => {
    // Arrange / Act / Assert
    expect(newAudioTrackFields({ assetId: 'id', fileName: 'Take 3.wav', extension: 'wav' })).toEqual({
      assetId: 'id',
      fileExtension: 'wav',
      originalFilePath: 'Take 3.wav',
    });
  });
});

describe('parseAudioPeaks', () => {
  it('reads the min and max bytes of the native waveform', () => {
    // Arrange
    const raw = { bucketsPerSecond: 200, durationSeconds: 1.5, peaks: bytesToBase64(Uint8Array.from([0x80 + 1, 0x7f, 0, 0])) };

    // Act
    const peaks = parseAudioPeaks(raw);

    // Assert
    expect(peaks?.bucketsPerSecond).toBe(200);
    expect(Array.from(peaks?.values ?? [])).toEqual([-127, 127, 0, 0]);
  });

  it('refuses what is not a waveform', () => {
    // Arrange / Act / Assert
    expect(parseAudioPeaks(null)).toBeUndefined();
    expect(parseAudioPeaks({ bucketsPerSecond: 0, durationSeconds: 1, peaks: '' })).toBeUndefined();
    expect(parseAudioPeaks({ bucketsPerSecond: 200, durationSeconds: -1, peaks: '' })).toBeUndefined();
    expect(parseAudioPeaks({ bucketsPerSecond: 200, durationSeconds: 1, peaks: '%%' })).toBeUndefined();
  });
});

describe('audioTrackChange', () => {
  it('restarts playback for another file, mute or solo, plays volume and detune live, and leaves sync points to the next start', () => {
    // Arrange
    const song = withAudio();
    const track = song.audioTrack!;
    const changed = (fields: Partial<typeof track>): Song => ({ ...song, audioTrack: { ...track, ...fields } });

    // Act / Assert
    expect(audioTrackChange(song, song)).toBe('none');
    expect(audioTrackChange(song, changed({ assetId: 'other' }))).toBe('restart');
    expect(audioTrackChange(song, changed({ mute: true }))).toBe('restart');
    expect(audioTrackChange(song, changed({ solo: true }))).toBe('restart');
    expect(audioTrackChange(song, makeSong([[]]))).toBe('restart');
    expect(audioTrackChange(song, changed({ volume: 0.3 }))).toBe('live');
    expect(audioTrackChange(song, changed({ detuneCents: 50 }))).toBe('live');
    expect(audioTrackChange(song, changed({ syncPoints: [{ measureIndex: 0, occurrence: 0, position: 0, seconds: 1 }] }))).toBe('none');
  });
});
