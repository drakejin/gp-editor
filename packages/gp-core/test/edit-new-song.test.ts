import { describe, expect, it } from 'vitest';
import { NEW_SONG_MEASURES, buildNewSong } from '../src/edit/new-song';
import { STANDARD_TUNING, durationTicks, measureTicks } from '../src/model/defaults';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { assertEditInvariants } from './helpers/edit-songs';

describe('buildNewSong', () => {
  it('starts a blank sheet: one guitar track in standard tuning, empty 4/4 bars at 120 bpm', () => {
    // Act
    const song = buildNewSong();

    // Assert
    expect(song.measureHeaders).toHaveLength(NEW_SONG_MEASURES);
    expect(song.measureHeaders.every((header) => header.tempo === 120 && header.timeSignature.numerator === 4 && header.timeSignature.denominator === 4)).toBe(true);
    expect(song.tracks).toHaveLength(1);
    const [track] = song.tracks;
    expect(track?.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_TUNING);
    expect(track?.isPercussion).toBe(false);
    expect(song.channels.map((channel) => channel.id)).toEqual([track?.channelId]);
    assertEditInvariants(song);
  });

  it('fills every bar with rests, so the cursor has a beat to type into', () => {
    const song = buildNewSong();
    song.tracks[0]?.measures.forEach((measure, index) => {
      const header = song.measureHeaders[index];
      const ticks = measure.beats.reduce((sum, beat) => sum + durationTicks(beat.voices[0]!.duration), 0);
      expect(ticks).toBe(measureTicks(header!.timeSignature.numerator, header!.timeSignature.denominator));
      expect(measure.beats.every((beat) => beat.voices[0]?.notes.length === 0 && beat.voices[0]?.isEmpty === false)).toBe(true);
    });
  });

  it('saves as GP5 and reads back with the same bars and track', () => {
    const song = buildNewSong();
    const reread = readSong(writeSong(song, 'gp5'));
    expect(reread.measureHeaders).toHaveLength(NEW_SONG_MEASURES);
    expect(reread.tracks[0]?.strings).toEqual(song.tracks[0]?.strings);
    expect(reread.tracks[0]?.measures[0]?.beats).toHaveLength(song.tracks[0]?.measures[0]?.beats.length ?? -1);
  });
});
