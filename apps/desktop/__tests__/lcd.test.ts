import { lcdInfo } from '../src/lib/lcd';
import { INITIAL_PRACTICE } from '../src/state/practice';
import { beat, makeSong, note } from '../test-support/songs';

/** Three 4/4 bars at 120 BPM (2 s each); a note on string 2, fret 5 in the first beat of bar 2. */
const SONG = makeSong([[beat(960, [])], [beat(4800, [note(2, 5)])], [beat(8640, [])]]);
const CURSOR = { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 2 };

describe('lcdInfo', () => {
  it('shows the track, the cursor’s bar, its time signature, time and tempo, and the note under the cursor', () => {
    // Act
    const info = lcdInfo({ song: SONG, trackIndex: 0, cursor: CURSOR, practice: INITIAL_PRACTICE });

    // Assert
    expect(info).toEqual({
      track: '1. Guitar',
      bar: '2/3',
      timeSignature: '4/4',
      clock: '00:02 / 00:06',
      tempo: '♩ = 120',
      tempoBpm: 120,
      position: 'Voice 1 · Beat 1 · String 2 · Fret 5',
    });
  });

  it('shows a banjo drone note’s fret as the tab does (stored 2 is fret 7)', () => {
    const banjo = { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, strings: [62, 59, 55, 50, 67].map((tuning, i) => ({ number: i + 1, tuning })) })) };
    const song = { ...banjo, tracks: [{ ...banjo.tracks[0]!, measures: [banjo.tracks[0]!.measures[0]!, { ...banjo.tracks[0]!.measures[1]!, beats: [beat(4800, [note(5, 2)])] }] }] };
    expect(lcdInfo({ song, trackIndex: 0, cursor: { ...CURSOR, string: 5 }, practice: INITIAL_PRACTICE }).position).toBe('Voice 1 · Beat 1 · String 5 · Fret 7');
  });

  it('follows the playing bar while playing, at the playback speed', () => {
    const info = lcdInfo({
      song: SONG,
      trackIndex: 0,
      cursor: CURSOR,
      playing: { measureIndex: 2, beatIndex: 0 },
      practice: { ...INITIAL_PRACTICE, tempoScale: 0.5 },
    });
    expect(info).toMatchObject({ bar: '3/3', clock: '00:08 / 00:12', tempo: '♩ = 60 (50%)', tempoBpm: 60 });
  });

  it('shows the loop pass being played and its tempo while the speed trainer runs', () => {
    const info = lcdInfo({
      song: SONG,
      trackIndex: 0,
      cursor: CURSOR,
      playing: { measureIndex: 1, beatIndex: 0 },
      practice: { ...INITIAL_PRACTICE, isLooping: true },
      loopPass: { passIndex: 2, tempo: 110 },
    });
    expect(info.tempo).toBe('♩ = 110 · pass 3');
  });

  it('shows a decimal tempo with its decimals', () => {
    const song = { ...SONG, measureHeaders: SONG.measureHeaders.map((header) => ({ ...header, tempo: 92.5 })) };
    expect(lcdInfo({ song, trackIndex: 0, cursor: CURSOR, practice: INITIAL_PRACTICE }).tempo).toBe('♩ = 92.5');
  });

  it('shows the locked tempo with a padlock (short enough for the LCD at 1280 pt), and counts the time at it', () => {
    // Act: 120 BPM bars locked at 60 (4 s a bar), then played at 50%
    const locked = lcdInfo({ song: SONG, trackIndex: 0, cursor: CURSOR, practice: { ...INITIAL_PRACTICE, lockedTempo: 60 } });
    const slower = lcdInfo({ song: SONG, trackIndex: 0, cursor: CURSOR, practice: { ...INITIAL_PRACTICE, lockedTempo: 60, tempoScale: 0.5 } });

    // Assert
    expect(locked).toMatchObject({ tempo: '♩ = 60 🔒', clock: '00:04 / 00:12', tempoBpm: 60 });
    expect(slower).toMatchObject({ tempo: '♩ = 30 (50%) 🔒', tempoBpm: 60 });
  });

  it('says when the cursor is on an empty string or a rest', () => {
    const info = lcdInfo({ song: SONG, trackIndex: 0, cursor: { ...CURSOR, measureIndex: 0 }, practice: INITIAL_PRACTICE });
    expect(info.position).toBe('Voice 1 · Beat 1 · String 2 · empty');
  });

  it('names the voice the cursor is on, and its note only', () => {
    // Act: the cursor on voice 3 of the beat whose voice 1 plays fret 5 on string 2
    const info = lcdInfo({ song: SONG, trackIndex: 0, cursor: { ...CURSOR, voiceIndex: 2 }, practice: INITIAL_PRACTICE });

    // Assert
    expect(info.position).toBe('Voice 3 · Beat 1 · String 2 · empty');
  });
});
