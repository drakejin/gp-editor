import { describe, expect, it } from 'vitest';
import { parsePitch } from '../src/transcription/pitch';

describe('parsePitch', () => {
  it.each([
    ['C4', 60],
    ['A4', 69],
    ['E2', 40],
    ['C#4', 61],
    ['Bb3', 58],
    ['F♯3', 54],
    ['B♭2', 46],
    ['Cx4', 62],
    ['C##4', 62],
    ['Dbb4', 60],
    ['C𝄪4', 62],
    ['D𝄫4', 60],
    ['E♮4', 64],
    ['Cb4', 59],
    ['B#3', 60],
    ['C-1', 0],
    ['G9', 127],
    ['e4', 64],
    ['bb3', 58],
    [' D3 ', 50],
  ])('reads %s as MIDI %i (C4 = 60)', (text, midi) => {
    // Act
    const pitch = parsePitch(text);

    // Assert
    expect(pitch).toBe(midi);
  });

  it.each(['', 'C', '4', 'H4', 'C10', 'C#-2', 'G#9', 'Cb-1', 'C4#', 'C 4', 'C4.5', 'Cbbb4'])('rejects %j', (text) => {
    // Act
    const pitch = parsePitch(text);

    // Assert
    expect(pitch).toBeUndefined();
  });
});
