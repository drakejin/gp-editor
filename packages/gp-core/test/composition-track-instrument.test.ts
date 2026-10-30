import { describe, expect, it } from 'vitest';
import { trackInstrumentOf, trackProgramOf } from '../src/composition/track-instrument';
import { addTrack } from '../src/edit/tracks';
import type { Song } from '../src/model/song';
import { buildSong, n, play } from './helpers/edit-songs';

/** A one-track song whose track plays `program` on `tuning` (string 1 first), named `name`. */
function songWith(program: number, tuning: readonly number[] = [64, 59, 55, 50, 45, 40], name = 'Track 1'): Song {
  const song = buildSong({ tracks: [[[[play(1, n(1, 0))]]]] });
  const channel = song.channels[0];
  const track = song.tracks[0];
  if (channel === undefined || track === undefined) {
    throw new Error('buildSong made no track');
  }
  return { ...song, channels: [{ ...channel, program }], tracks: [{ ...track, name, strings: tuning.map((open, index) => ({ number: index + 1, tuning: open })) }] };
}

describe('trackInstrumentOf', () => {
  it('reads a guitar, bass, banjo or ukulele from the channel’s program and the strings', () => {
    expect(trackInstrumentOf(songWith(25), 0)).toBe('guitar');
    expect(trackInstrumentOf(songWith(30), 0)).toBe('guitar');
    expect(trackInstrumentOf(songWith(33, [43, 38, 33, 28]), 0)).toBe('bass');
    expect(trackInstrumentOf(songWith(25, [43, 38, 33, 28]), 0)).toBe('bass');
    expect(trackInstrumentOf(songWith(105, [62, 59, 55, 50, 67]), 0)).toBe('banjo');
    expect(trackInstrumentOf(songWith(24, [69, 64, 60, 67]), 0)).toBe('ukulele');
  });

  it('reads drums, a voice by its program or name, keyboards, and any other instrument', () => {
    expect(trackInstrumentOf(addTrack(songWith(25), { kind: 'drums' }), 1)).toBe('drums');
    expect(trackInstrumentOf(songWith(53), 0)).toBe('vocals');
    expect(trackInstrumentOf(songWith(73, undefined, 'Lead Vocals'), 0)).toBe('vocals');
    expect(trackInstrumentOf(songWith(0), 0)).toBe('keys');
    expect(trackInstrumentOf(songWith(4), 0)).toBe('keys');
    expect(trackInstrumentOf(songWith(19), 0)).toBe('keys');
    expect(trackInstrumentOf(songWith(48), 0)).toBe('other');
    expect(trackInstrumentOf(songWith(81), 0)).toBe('other');
  });

  it('reads a track without a channel as a guitar, and a track the song lacks as undefined', () => {
    // Arrange
    const song = songWith(25);
    const orphan: Song = { ...song, channels: [] };

    // Assert
    expect(trackInstrumentOf(orphan, 0)).toBe('guitar');
    expect(trackInstrumentOf(song, 3)).toBeUndefined();
  });
});

describe('trackProgramOf', () => {
  it('reads the General MIDI program of a track’s channel, a steel guitar without one', () => {
    expect(trackProgramOf(songWith(33), 0)).toBe(33);
    expect(trackProgramOf({ ...songWith(33), channels: [] }, 0)).toBe(25);
  });
});
