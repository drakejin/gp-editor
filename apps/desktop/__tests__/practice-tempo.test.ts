import {
  metronomeVelocity,
  parseTempoText,
  playbackTempo,
  resolveTrainerMaxTempo,
  shiftSpeedScale,
  shiftTempoScale,
  tempoBounds,
  tempoPercent,
  trainerPassTempo,
} from '../src/lib/practice-tempo';

describe('tempoBounds', () => {
  it('allows a quarter to three times the written tempo', () => {
    // Act / Assert
    expect(tempoBounds(120)).toEqual({ min: 30, max: 360 });
  });

  it('never goes under 20 BPM, but always allows the written tempo itself', () => {
    // Act / Assert
    expect(tempoBounds(60)).toEqual({ min: 20, max: 180 });
    expect(tempoBounds(15)).toEqual({ min: 15, max: 45 });
  });
});

describe('playback tempo', () => {
  it('shows the written tempo scaled and rounded, with the percentage', () => {
    // Act / Assert
    expect(playbackTempo(100, 0.95)).toBe(95);
    expect(playbackTempo(90, 1 / 3)).toBe(30);
    expect(tempoPercent(0.95)).toBe(95);
  });

  it('moves the shown tempo by 5 BPM steps as a scale of the written tempo', () => {
    // Act
    const slower = shiftTempoScale(1, 100, -5);
    const faster = shiftTempoScale(slower, 100, 10);

    // Assert
    expect(slower).toBeCloseTo(0.95, 10);
    expect(faster).toBeCloseTo(1.05, 10);
  });

  it('clamps the shifted tempo to the bounds', () => {
    // Act / Assert
    expect(shiftTempoScale(2.98, 100, 5)).toBe(3);
    expect(shiftTempoScale(0.3, 100, -10)).toBe(0.25);
    expect(shiftTempoScale(0.4, 60, -5)).toBeCloseTo(20 / 60, 10);
  });
});

describe('speed trainer', () => {
  it('adds the step on every pass until the top tempo, then stays there', () => {
    // Act
    const tempos = [0, 1, 2, 3, 4, 5].map((passIndex) => trainerPassTempo(80, 10, 110, passIndex));

    // Assert
    expect(tempos).toEqual([80, 90, 100, 110, 110, 110]);
  });

  it('keeps every pass at the start tempo when the step is 0 or the top is below the start', () => {
    // Act / Assert
    expect(trainerPassTempo(80, 0, 110, 7)).toBe(80);
    expect(trainerPassTempo(120, 5, 100, 3)).toBe(120);
  });

  it('defaults the top tempo to the written tempo or 20 BPM above the playback tempo, whichever is higher', () => {
    // Act / Assert
    expect(resolveTrainerMaxTempo(undefined, 100, 0.7)).toBe(100);
    expect(resolveTrainerMaxTempo(undefined, 100, 0.95)).toBe(115);
  });

  it('keeps a set top tempo, clamped to the playback tempo bounds of the bar', () => {
    // Act / Assert
    expect(resolveTrainerMaxTempo(140, 100, 0.95)).toBe(140);
    expect(resolveTrainerMaxTempo(500, 100, 0.95)).toBe(300);
    expect(resolveTrainerMaxTempo(undefined, 100, 2.9)).toBe(300);
  });
});

describe('decimal tempos', () => {
  it('shows a decimal written tempo with its decimals, a scaled one to two decimals', () => {
    expect(playbackTempo(92.5, 1)).toBe(92.5);
    expect(playbackTempo(92.5, 0.8)).toBe(74);
    expect(playbackTempo(100, 0.333)).toBe(33.3);
  });

  it('reads a typed tempo: decimals with a point or a comma, two kept; nothing else', () => {
    expect(parseTempoText('92.5')).toBe(92.5);
    expect(parseTempoText(' 92,25 ')).toBe(92.25);
    expect(parseTempoText('120.456')).toBe(120.46);
    expect(parseTempoText('140 bpm')).toBeUndefined();
    expect(parseTempoText('')).toBeUndefined();
    expect(parseTempoText('0')).toBeUndefined();
    expect(parseTempoText('-90')).toBeUndefined();
  });
});

describe('relative speed and metronome volume', () => {
  it('steps the speed on the 5% grid within 25%–200%', () => {
    expect(shiftSpeedScale(1, 5)).toBeCloseTo(1.05, 10);
    expect(shiftSpeedScale(0.83, -5)).toBeCloseTo(0.8, 10);
    expect(shiftSpeedScale(0.27, -5)).toBeCloseTo(0.25, 10);
    expect(shiftSpeedScale(1.98, 5)).toBeCloseTo(2, 10);
    expect(shiftSpeedScale(2.5, 5)).toBe(2.5);
    expect(shiftSpeedScale(0.2, -5)).toBe(0.2);
  });

  it('turns the metronome volume into the accent’s MIDI velocity', () => {
    expect(metronomeVelocity(100)).toBe(127);
    expect(metronomeVelocity(50)).toBe(64);
    expect(metronomeVelocity(0)).toBe(1);
  });
});
