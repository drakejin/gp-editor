import { trackInstrument } from '../src/lib/instruments';
import { makeSong } from '../test-support/songs';

const CHANNEL = { id: 1, name: 'Lead', program: 30, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };

describe('trackInstrument', () => {
  it('names the General MIDI program of the track’s channel', () => {
    const song = { ...makeSong([[]]), channels: [CHANNEL] };
    expect(trackInstrument(song, 0)).toEqual({ program: 30, name: 'Distortion Electric Guitar', isPercussion: false });
  });

  it('calls a percussion track drums', () => {
    const base = makeSong([[]]);
    const song = { ...base, channels: [{ ...CHANNEL, isPercussion: true, program: 0 }], tracks: base.tracks.map((track) => ({ ...track, isPercussion: true })) };
    expect(trackInstrument(song, 0)).toEqual({ program: 0, name: 'Drums', isPercussion: true });
  });

  it('is undefined for a missing track or channel', () => {
    expect(trackInstrument(makeSong([[]]), 0)).toBeUndefined();
    expect(trackInstrument({ ...makeSong([[]]), channels: [CHANNEL] }, 4)).toBeUndefined();
  });
});
