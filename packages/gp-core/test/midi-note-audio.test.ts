import { describe, expect, it } from 'vitest';
import { renderMidi, type Song } from '../src/index';
import type { NoteAudio } from '../src/model/song';
import { playedNotes, readMidi } from './helpers/midi-reader';
import { makeSong, note } from './helpers/midi-song';

/** A song of one quarter note (fret 0 on string 1, velocity 95) with the given audio settings. */
function songWith(audio: NoteAudio | undefined): Song {
  const played = note({ fret: 0, string: 1 });
  return makeSong({ tracks: [{ measures: [[{ notes: [audio === undefined ? played : { ...played, audio }] }]] }] });
}

function sounding(song: Song): number[][] {
  return playedNotes(readMidi(renderMidi(song).bytes)).map((played) => [played.start, played.end ?? -1, played.velocity]);
}

describe('renderMidi note audio settings', () => {
  it('plays a note as written without settings', () => {
    expect(sounding(songWith(undefined))).toEqual([[0, 960, 95]]);
  });

  it('sounds the note for its duration percentage', () => {
    expect(sounding(songWith({ durationPercent: 50, offsetPercent: 0, velocityOffset: 0 }))).toEqual([[0, 480, 95]]);
    expect(sounding(songWith({ durationPercent: 150, offsetPercent: 0, velocityOffset: 0 }))).toEqual([[0, 1440, 95]]);
  });

  it('starts the note later by its offset, a percentage of the beat, without moving its end', () => {
    expect(sounding(songWith({ durationPercent: 100, offsetPercent: 25, velocityOffset: 0 }))).toEqual([[240, 960, 95]]);
  });

  it('adds the velocity change, keeping the velocity within 1–127', () => {
    expect(sounding(songWith({ durationPercent: 100, offsetPercent: 0, velocityOffset: -20 }))).toEqual([[0, 960, 75]]);
    expect(sounding(songWith({ durationPercent: 100, offsetPercent: 0, velocityOffset: 100 }))).toEqual([[0, 960, 127]]);
    expect(sounding(songWith({ durationPercent: 100, offsetPercent: 0, velocityOffset: -127 }))).toEqual([[0, 960, 1]]);
  });
});
