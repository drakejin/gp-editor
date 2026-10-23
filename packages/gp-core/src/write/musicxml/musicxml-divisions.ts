// MusicXML divisions for a song (TuxGuitar writes its own 960; the model's QUARTER_TIME is far finer): the coarsest exact unit.
import { durationTicks, measureTicks } from '../../model/defaults';
import { QUARTER_TIME, type Song } from '../../model/song';

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * The largest number of ticks every position and length the score writes is a whole multiple of: measure lengths, beat
 * positions in their measure and voice durations. A quarter note is QUARTER_TIME / unit divisions (4 for a song of
 * sixteenths, 12 with sixteenth-note triplets), so durations stay small whole numbers.
 */
export function tickUnit(song: Song): number {
  let unit = QUARTER_TIME;
  song.measureHeaders.forEach((header) => {
    unit = gcd(unit, measureTicks(header.timeSignature.numerator, header.timeSignature.denominator));
  });
  for (const track of song.tracks) {
    track.measures.forEach((measure) => {
      const start = song.measureHeaders[measure.headerIndex]?.start ?? 0;
      for (const beat of measure.beats) {
        unit = gcd(unit, beat.start - start);
        beat.voices.forEach((voice) => {
          unit = voice.isEmpty ? unit : gcd(unit, durationTicks(voice.duration));
        });
      }
    });
  }
  return Math.max(1, unit);
}
