import { describe, expect, it } from 'vitest';
import { layoutBars } from '../src/edit/bar-flow';
import { splitAtBarLines } from '../src/edit/tied-pieces';
import type { VoiceEvent } from '../src/edit/timeline';
import { EMPTY_NOTE_EFFECT, durationTicks } from '../src/model/defaults';
import type { Duration, Note } from '../src/model/song';
import { dur, n } from './helpers/edit-songs';
import { fromTux, toTux } from './helpers/ticks';

function event(duration: Duration, ...notes: Note[]): VoiceEvent {
  return { voice: { duration, notes, isEmpty: false, direction: 'none' }, attributes: { stroke: { direction: 'down', value: 8 }, pickStroke: 'none' } };
}

function summary(bars: readonly (readonly VoiceEvent[])[]): string[][] {
  return bars.map((bar) => bar.map((piece) => `${toTux(durationTicks(piece.voice.duration))}:${piece.voice.notes.map((note) => `${note.fret}${note.isTied ? '~' : ''}`).join(',') || 'r'}`));
}

const WHOLE_BAR = fromTux(3840);

describe('layoutBars', () => {
  it('cuts a note held over two bar lines into tied pieces, one share per bar', () => {
    // Arrange: a dotted whole note from beat 3 of a 4/4 bar, then 2/4 bars
    const events = [event(dur(2)), event(dur(1, { dotted: true }), n(1, 5))];
    const lengths = [WHOLE_BAR, fromTux(1920), fromTux(1920), fromTux(1920)];

    // Act
    const bars = layoutBars(events, (index) => lengths[index] ?? WHOLE_BAR);

    // Assert
    expect(summary(bars)).toEqual([['1920:r', '1920:5'], ['1920:5~'], ['1920:5~']]);
    expect(bars[0]?.[1]?.attributes?.stroke.direction).toBe('down');
    expect(bars[1]?.[0]?.attributes).toBeUndefined();
  });

  it('lets a note that cannot be cut over-fill its bar and starts the next bar after it', () => {
    // Arrange: 100 ticks cannot be written as notes
    const events = [event(dur(4), n(1, 1)), event(dur(4), n(1, 2))];

    // Act
    const bars = layoutBars(events, () => fromTux(100));

    // Assert
    expect(summary(bars)).toEqual([['960:1'], ['960:2']]);
  });

  it('returns no bars for no events', () => {
    expect(layoutBars([], () => WHOLE_BAR)).toEqual([]);
  });
});

describe('splitAtBarLines', () => {
  it('keeps sustained effects on the middle pieces and nothing else', () => {
    // Arrange
    const note: Note = { ...n(2, 7), effect: { ...EMPTY_NOTE_EFFECT, letRing: true, ghostNote: true, harmonic: { type: 'natural', data: 0 }, slides: ['outDownwards'] } };

    // Act
    const pieces = splitAtBarLines(event(dur(1), note), [960, 1920, 960].map(fromTux));

    // Assert
    const middle = pieces?.[1]?.[0]?.voice.notes[0];
    expect(middle).toMatchObject({ isTied: true, effect: { letRing: true, ghostNote: false, harmonic: { type: 'natural', data: 0 }, slides: [] } });
    expect(pieces?.[2]?.[0]?.voice.notes[0]?.effect.slides).toEqual(['outDownwards']);
    expect(pieces?.[0]?.[0]?.voice.notes[0]?.effect.slides).toEqual([]);
  });

  it('is undefined when a share cannot be written', () => {
    expect(splitAtBarLines(event(dur(4)), [100, 860].map(fromTux))).toBeUndefined();
  });
});
