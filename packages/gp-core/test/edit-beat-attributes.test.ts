import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { setBeatPickStroke, setBeatStroke, setBeatText } from '../src/edit/beat-attributes';
import { NO_STROKE } from '../src/model/defaults';
import type { Song, Stroke, StrokeDirection } from '../src/model/song';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

const AT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };

/** A chord on beat 0, a rest on beat 1 (two voices, the second one a whole rest). */
function makeSong(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0), n(2, 1)), rest(2)], [rest(1)]]]] }));
}

const beatOf = (song: Song, beatIndex = 0) => song.tracks[0]?.measures[0]?.beats[beatIndex];

describe('setBeatStroke', () => {
  it('sets an up or down stroke at a speed, leaving the other beats alone', () => {
    // Arrange
    const song = makeSong();

    // Act
    const down = setBeatStroke(song, AT, { direction: 'down', value: 16 });
    const up = setBeatStroke(down, AT, { direction: 'up', value: 64 });

    // Assert
    expect(beatOf(down)?.stroke).toEqual({ direction: 'down', value: 16 });
    expect(beatOf(up)?.stroke).toEqual({ direction: 'up', value: 64 });
    expect(beatOf(up, 1)).toBe(beatOf(song, 1));
    expect(beatOf(song)?.stroke).toEqual(NO_STROKE);
  });

  it('clears the stroke with direction none, whatever the speed', () => {
    const stroked = setBeatStroke(makeSong(), AT, { direction: 'up', value: 32 });
    expect(beatOf(setBeatStroke(stroked, AT, { direction: 'none', value: 8 }))?.stroke).toEqual(NO_STROKE);
  });

  it.each<Stroke>([
    { direction: 'down', value: 12 },
    { direction: 'up', value: 0 },
    { direction: 'up', value: 2 },
    { direction: 'sideways' as StrokeDirection, value: 16 },
  ])('refuses the stroke %o', (stroke) => {
    const song = makeSong();
    expect(setBeatStroke(song, AT, stroke)).toBe(song);
  });

  it('returns the same song for the same stroke or a missing beat', () => {
    const song = makeSong();
    expect(setBeatStroke(song, AT, NO_STROKE)).toBe(song);
    const stroked = setBeatStroke(song, AT, { direction: 'down', value: 16 });
    expect(setBeatStroke(stroked, AT, { direction: 'down', value: 16 })).toBe(stroked);
    expect(setBeatStroke(song, { ...AT, beatIndex: 4 }, { direction: 'down', value: 16 })).toBe(song);
  });
});

describe('setBeatPickStroke', () => {
  it('sets and clears the pick stroke of the beat', () => {
    // Act
    const up = setBeatPickStroke(makeSong(), AT, 'up');
    const none = setBeatPickStroke(up, AT, 'none');

    // Assert
    expect(beatOf(up)?.pickStroke).toBe('up');
    expect(beatOf(none)?.pickStroke).toBe('none');
  });

  it('returns the same song for the same direction, an unknown one or a missing beat', () => {
    const song = makeSong();
    expect(setBeatPickStroke(song, AT, 'none')).toBe(song);
    expect(setBeatPickStroke(song, AT, 'left' as StrokeDirection)).toBe(song);
    expect(setBeatPickStroke(song, { ...AT, measureIndex: 3 }, 'down')).toBe(song);
  });
});

describe('setBeatText', () => {
  it('sets the text of the beat, trimmed', () => {
    // Act
    const edited = setBeatText(makeSong(), { ...AT, beatIndex: 1 }, '  let ring  ');

    // Assert
    expect(beatOf(edited, 1)?.text).toBe('let ring');
  });

  it('removes the text for an empty or blank text, or none', () => {
    const song = setBeatText(makeSong(), AT, 'intro');
    const blank = beatOf(setBeatText(song, AT, '   '));
    expect(blank).not.toHaveProperty('text');
    expect(beatOf(setBeatText(song, AT, undefined))).not.toHaveProperty('text');
  });

  it('returns the same song for the same text, no text to remove or a missing beat', () => {
    const song = makeSong();
    expect(setBeatText(song, AT, '')).toBe(song);
    const texted = setBeatText(song, AT, 'intro');
    expect(setBeatText(texted, AT, ' intro ')).toBe(texted);
    expect(setBeatText(song, { ...AT, beatIndex: 2 }, 'intro')).toBe(song);
  });
});
