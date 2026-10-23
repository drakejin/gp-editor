import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src';
import { MAX_DRAFT_MEASURES, MAX_DRAFT_TRACKS, SongDraft, type TrackSetup } from '../src/formats/common/song-draft';
import { DEFAULT_CHANNEL, STANDARD_TUNING } from '../src/model/defaults';
import { QUARTER_TIME } from '../src/model/song';

const SETUP: TrackSetup = {
  name: 'Guitar',
  channelId: 1,
  strings: STANDARD_TUNING.map((tuning, i) => ({ number: i + 1, tuning })),
  offset: 0,
  clef: 'treble',
};

function draftWithTrack(): SongDraft {
  const draft = new SongDraft();
  draft.addChannel({ ...DEFAULT_CHANNEL });
  draft.addTrack(SETUP);
  return draft;
}

describe('SongDraft', () => {
  it('starts the first measure at QUARTER_TIME in 4/4 at 120 and copies the last header’s time signature and tempo', () => {
    // Arrange
    const draft = draftWithTrack();

    // Act
    const first = draft.addHeader();
    first.tempo = 90;
    const second = draft.addHeader({ numerator: 3, denominator: 4 });
    const third = draft.addHeader();

    // Assert
    expect([first, second, third].map((header) => [header.start, header.timeSignature.numerator, header.tempo])).toEqual([
      [QUARTER_TIME, 4, 90],
      [QUARTER_TIME + 3840, 3, 90],
      [QUARTER_TIME + 3840 + 2880, 3, 90],
    ]);
    expect(draft.tracks[0]?.measures).toHaveLength(3);
  });

  it('adds measures until one holds a start, and refuses a start before the first measure', () => {
    // Arrange
    const draft = draftWithTrack();
    const track = draft.tracks[0];
    if (track === undefined) {
      throw new Error('no track');
    }

    // Act
    const measure = draft.ensureMeasureAt(track, QUARTER_TIME + 3 * 3840 + 10);

    // Assert
    expect(measure.header.number).toBe(4);
    expect(draft.measureAt(track, QUARTER_TIME - 1)).toBeUndefined();
    expect(() => draft.ensureMeasureAt(track, 0)).toThrow(GpFormatError);
  });

  it('reuses the beat at a start, also one pushed onto the measure directly', () => {
    // Arrange
    const draft = draftWithTrack();
    const measure = draft.addHeader() && draft.tracks[0]?.measures[0];
    if (measure === undefined) {
      throw new Error('no measure');
    }
    const first = draft.beatAt(measure, QUARTER_TIME);
    measure.beats.push({ ...first, start: QUARTER_TIME + 960 });

    // Act
    const again = draft.beatAt(measure, QUARTER_TIME);
    const pushed = draft.beatAt(measure, QUARTER_TIME + 960);

    // Assert
    expect(again).toBe(first);
    expect(pushed).toBe(measure.beats[1]);
    expect(measure.beats).toHaveLength(2);
  });

  it('retimes the last measure only while it starts at the given tick and is empty', () => {
    // Arrange
    const draft = draftWithTrack();
    const header = draft.addHeader();
    const measure = draft.tracks[0]?.measures[0];

    // Act
    draft.retimeOpenHeader(QUARTER_TIME + 1, { numerator: 2, denominator: 4 });
    draft.retimeOpenHeader(QUARTER_TIME, { numerator: 3, denominator: 4 });
    if (measure !== undefined) {
      draft.beatAt(measure, QUARTER_TIME);
    }
    draft.retimeOpenHeader(QUARTER_TIME, { numerator: 5, denominator: 4 });

    // Assert
    expect(header.timeSignature).toEqual({ numerator: 3, denominator: 4 });
  });

  it('refuses more measures or tracks than its limits', () => {
    // Arrange
    const draft = draftWithTrack();
    for (let i = 0; i < MAX_DRAFT_MEASURES; i++) {
      draft.addHeader();
    }
    const many = new SongDraft();
    for (let i = 0; i < MAX_DRAFT_TRACKS; i++) {
      many.addTrack(SETUP);
    }

    // Act and assert
    expect(() => draft.addHeader()).toThrow(`The song is longer than ${MAX_DRAFT_MEASURES} measures`);
    expect(() => many.addTrack(SETUP)).toThrow(`The song has more than ${MAX_DRAFT_TRACKS} tracks`);
  });

  it('gives a percussion track key signature 0 and keeps its lyrics', () => {
    // Arrange
    const draft = new SongDraft();
    const channel = draft.addChannel({ ...DEFAULT_CHANNEL, bank: 128, program: 0, isPercussion: true });
    draft.addTrack({ ...SETUP, channelId: channel.id, lyrics: { from: 1, text: 'la' } });
    draft.addHeader();
    const measure = draft.tracks[0]?.measures[0];
    if (measure !== undefined) {
      measure.keySignature = 3;
    }

    // Act
    const song = draft.toSong({ format: 'tef', version: '3.04' }, { title: '', subtitle: '', artist: '', album: '', words: '', music: '', copyright: '', transcriber: '', instructions: '', notice: [] });

    // Assert
    expect(song.tracks[0]).toMatchObject({ isPercussion: true, lyrics: { from: 1, text: 'la' } });
    expect(song.tracks[0]?.measures[0]?.keySignature).toBe(0);
    expect(song.channels[0]?.name).toBe('DrumKit 1');
  });
});
