import { MAX_FRAME_LENGTH, MIN_FRAME_LENGTH } from '@gp-editor/core';
import { SILENT_INPUT, nextTunerInput, parseAudioFrame } from '../src/lib/tuner-input';
import { bytesToBase64 } from '../src/lib/base64';
import { pcmBase64, sineFrameEvent } from '../test-support/audio-frames';

const SILENT_FRAME = Array.from({ length: MIN_FRAME_LENGTH }, () => 0);

describe('parseAudioFrame', () => {
  it('decodes 16-bit PCM into samples in -1 … 1 with the frame’s sample rate', () => {
    // Arrange
    const raw = [...SILENT_FRAME];
    raw[0] = 16384;
    raw[1] = -32768;
    raw[2] = 32767;

    // Act
    const frame = parseAudioFrame({ sampleRate: 6000, samples: pcmBase64(raw) });

    // Assert
    expect(frame?.sampleRate).toBe(6000);
    expect(frame?.samples).toHaveLength(MIN_FRAME_LENGTH);
    expect(frame?.samples[0]).toBe(0.5);
    expect(frame?.samples[1]).toBe(-1);
    expect(frame?.samples[2]).toBeCloseTo(1, 4);
  });

  it('refuses what is not a frame: no object, a bad sample rate, no base64, an odd byte count', () => {
    const samples = pcmBase64(SILENT_FRAME);
    expect(parseAudioFrame(undefined)).toBeUndefined();
    expect(parseAudioFrame('frame')).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: 0, samples })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: Number.NaN, samples })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: '6000', samples })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: 6000, samples: 42 })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: 6000, samples: '###' })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: 6000, samples: bytesToBase64(new Uint8Array(MIN_FRAME_LENGTH * 2 + 1)) })).toBeUndefined();
  });

  it('refuses frames too short or too long for the pitch detector', () => {
    expect(parseAudioFrame({ sampleRate: 6000, samples: pcmBase64(SILENT_FRAME.slice(1)) })).toBeUndefined();
    expect(parseAudioFrame({ sampleRate: 6000, samples: pcmBase64(Array.from({ length: MAX_FRAME_LENGTH + 1 }, () => 0)) })).toBeUndefined();
  });
});

const A2_BODY = sineFrameEvent(110);
const SILENT_BODY = sineFrameEvent(0);

describe('nextTunerInput', () => {
  it('reads the frame’s level and pitch', () => {
    // Act
    const input = nextTunerInput(SILENT_INPUT, A2_BODY);

    // Assert
    expect(input.levelDb).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 1);
    expect(input.frequency).toBeCloseTo(110, 1);
    expect(input.queue).toHaveLength(1);
  });

  it('holds the last pitch for a few silent frames, then lets go', () => {
    // Arrange
    const playing = nextTunerInput(SILENT_INPUT, A2_BODY);

    // Act
    const afterOne = nextTunerInput(playing, SILENT_BODY);
    const afterFive = Array.from({ length: 5 }, () => SILENT_BODY).reduce(nextTunerInput, playing);

    // Assert
    expect(afterOne.levelDb).toBe(-120);
    expect(afterOne.frequency).toBeCloseTo(110, 1);
    expect(afterFive.frequency).toBeUndefined();
  });

  it('keeps the input as it was for a body that is not a frame', () => {
    const playing = nextTunerInput(SILENT_INPUT, A2_BODY);
    expect(nextTunerInput(playing, { sampleRate: 6000 })).toBe(playing);
  });

  it('skips a frame the detector refuses (a sample rate too low for its search range)', () => {
    expect(nextTunerInput(SILENT_INPUT, { ...A2_BODY, sampleRate: 2000 })).toBe(SILENT_INPUT);
  });
});
