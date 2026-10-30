import { describe, expect, it } from 'vitest';
import { type ComposeScope, MAX_COMPOSED_BARS, MAX_COMPOSED_NEW_TRACKS } from '../src/composition/compose-types';
import { parseComposedBars } from '../src/composition/parse-bars';
import { WRITE_BARS_TOOL } from '../src/composition/write-bars-tool';
import { CompositionError, TranscriptionError } from '../src/errors';
import { GM_PERCUSSION_NAMES } from '../src/formats/common/channels';
import { TRANSCRIPTION_TOOL } from '../src/transcription/tool';
import { MAX_TRANSCRIBED_TRACKS } from '../src/transcription/types';
import { DRUMS, drum, play, tab } from './helpers/transcription-pages';

/** A song of three tracks (Guitar, Bass, Drums), the answer may write the guitar and the drums, no new tracks. */
const SCOPE: ComposeScope = { trackCount: 3, trackNames: ['Guitar', 'Bass', 'Drums'], writableTracks: [0, 2], allowsNewTracks: false, maxBars: 8 };

const guitarPart = { track: 0, beats: [play('whole', tab(1, 5))] };
const bassPart = { track: 1, beats: [play('whole', tab(4, 0))] };
const drumPart = { track: 2, beats: [play('whole', drum('Acoustic Snare'))] };

describe('WRITE_BARS_TOOL', () => {
  it('asks for the bars, the new tracks before them and warnings, every note of any staff as the PDF import reads them', () => {
    // Arrange
    const { properties, required } = WRITE_BARS_TOOL.input_schema;
    const note = properties.bars.items.properties.parts.items.properties.beats.items.properties.notes.items;

    // Assert
    expect(WRITE_BARS_TOOL.name).toBe('write_bars');
    expect(required).toEqual(['bars']);
    expect(Object.keys(properties)).toEqual(['newTracks', 'bars', 'warnings']);
    expect(properties.bars.maxItems).toBe(MAX_COMPOSED_BARS);
    expect(properties.newTracks.maxItems).toBe(MAX_COMPOSED_NEW_TRACKS);
    expect(note.properties.drum.enum).toEqual(GM_PERCUSSION_NAMES);
    expect(Object.keys(note.properties)).toEqual(expect.arrayContaining(['string', 'fret', 'pitch', 'drum', 'tied', 'effects']));
  });

  it('describes a new track as the PDF import’s contract describes a track, and a bar by its meter, tempo, key and parts only', () => {
    // Arrange
    const { properties } = WRITE_BARS_TOOL.input_schema;

    // Assert
    expect(properties.newTracks.items).toEqual(TRANSCRIPTION_TOOL.input_schema.properties.tracks.items);
    expect(Object.keys(properties.bars.items.properties)).toEqual(['timeSignature', 'tempo', 'keySignature', 'parts']);
    expect(properties.bars.items.properties.parts.items.properties.track.maximum).toBe(MAX_TRANSCRIBED_TRACKS - 1);
  });
});

describe('parseComposedBars', () => {
  it('reads the bars in order, each with its meter, tempo and key when given, and the model’s warnings', () => {
    // Arrange
    const answer = {
      bars: [{ timeSignature: { numerator: 3, denominator: 4 }, tempo: 90, keySignature: 2, parts: [guitarPart] }, { parts: [guitarPart, drumPart] }],
      warnings: ['kept the groove', 7],
    };

    // Act
    const composed = parseComposedBars(answer, SCOPE);

    // Assert
    expect(composed.bars).toEqual([
      { timeSignature: { numerator: 3, denominator: 4 }, tempo: 90, keySignature: 2, parts: [guitarPart] },
      { parts: [guitarPart, drumPart] },
    ]);
    expect(composed.newTracks).toEqual([]);
    expect(composed.warnings).toEqual(['kept the groove']);
  });

  it('leaves out a part for a track it may not write, once per track, naming the track', () => {
    // Act
    const composed = parseComposedBars({ bars: [{ parts: [guitarPart, bassPart] }, { parts: [bassPart] }] }, SCOPE);

    // Assert
    expect(composed.bars.map((bar) => bar.parts.map((part) => part.track))).toEqual([[0], []]);
    expect(composed.warnings).toEqual(['Track 2 (Bass): its parts in 2 bars were left out (not one of the tracks to write)']);
  });

  it('leaves out a part for a track the song does not have, and parts beyond the contract’s track indexes', () => {
    // Act
    const composed = parseComposedBars({ bars: [{ parts: [{ ...guitarPart, track: 5 }, { ...guitarPart, track: 99 }, guitarPart] }] }, SCOPE);

    // Assert
    expect(composed.bars[0]?.parts).toEqual([guitarPart]);
    expect(composed.warnings).toEqual([
      'Track 6: its parts in 1 bar were left out (no such track)',
      'Track 100: its parts in 1 bar were left out (no such track)',
    ]);
  });

  it('takes new tracks when allowed: the first is the track after the song’s last, and its parts are written', () => {
    // Arrange
    const scope = { ...SCOPE, allowsNewTracks: true };
    const newDrums = { track: 3, beats: [play('whole', drum('Ride Cymbal 1'))] };

    // Act
    const composed = parseComposedBars({ newTracks: [DRUMS], bars: [{ parts: [guitarPart, newDrums] }] }, scope);

    // Assert
    expect(composed.newTracks).toEqual([DRUMS]);
    expect(composed.bars[0]?.parts).toEqual([guitarPart, newDrums]);
    expect(composed.warnings).toEqual([]);
  });

  it('leaves out new tracks when they are not allowed, with their parts', () => {
    // Act
    const composed = parseComposedBars({ newTracks: [DRUMS], bars: [{ parts: [guitarPart, { track: 3, beats: drumPart.beats }] }] }, SCOPE);

    // Assert
    expect(composed.newTracks).toEqual([]);
    expect(composed.bars[0]?.parts).toEqual([guitarPart]);
    expect(composed.warnings).toEqual([
      'New tracks were not allowed: 1 new track left out',
      'Track 4: its parts in 1 bar were left out (no such track)',
    ]);
  });

  it('keeps at most MAX_COMPOSED_NEW_TRACKS new tracks, and no more than the contract’s track indexes hold', () => {
    // Arrange
    const many = Array.from({ length: MAX_COMPOSED_NEW_TRACKS + 2 }, (_, index) => ({ ...DRUMS, name: `Drums ${index + 1}` }));
    const crowded: ComposeScope = { ...SCOPE, trackCount: MAX_TRANSCRIBED_TRACKS - 1, trackNames: [], allowsNewTracks: true };

    // Act
    const capped = parseComposedBars({ newTracks: many, bars: [{ parts: [] }] }, { ...SCOPE, allowsNewTracks: true });
    const full = parseComposedBars({ newTracks: many, bars: [{ parts: [] }] }, crowded);

    // Assert
    expect(capped.newTracks).toHaveLength(MAX_COMPOSED_NEW_TRACKS);
    expect(capped.warnings).toEqual([`${MAX_COMPOSED_NEW_TRACKS + 2} new tracks given: the last 2 were left out (at most ${MAX_COMPOSED_NEW_TRACKS})`]);
    expect(full.newTracks).toHaveLength(1);
  });

  it('keeps the bars the scope allows and says how many were left out', () => {
    // Arrange
    const bars = Array.from({ length: 11 }, () => ({ parts: [guitarPart] }));

    // Act
    const composed = parseComposedBars({ bars }, SCOPE);

    // Assert
    expect(composed.bars).toHaveLength(8);
    expect(composed.warnings).toEqual(['11 bars written: the last 3 were left out (at most 8)']);
  });

  it('never keeps more than MAX_COMPOSED_BARS, whatever the scope says', () => {
    const bars = Array.from({ length: MAX_COMPOSED_BARS + 1 }, () => ({ parts: [] }));
    expect(parseComposedBars({ bars }, { ...SCOPE, maxBars: 1000 }).bars).toHaveLength(MAX_COMPOSED_BARS);
  });

  it('leaves out what a bar of the tool does not hold: repeats, endings and lyrics', () => {
    // Act
    const composed = parseComposedBars({ bars: [{ repeatOpen: true, repeatClose: 2, alternateEnding: 1, lyrics: ['la'], parts: [guitarPart] }] }, SCOPE);

    // Assert
    expect(composed.bars).toEqual([{ parts: [guitarPart] }]);
  });

  it('reads an answer without bars as nothing written, keeping its warnings', () => {
    expect(parseComposedBars({ bars: [], warnings: ['The request asks for a different song.'] }, SCOPE)).toEqual({
      bars: [],
      newTracks: [],
      warnings: ['The request asks for a different song.'],
    });
  });

  it('refuses what it cannot read: no object, bars that are not a list, a beat without a duration', () => {
    expect(() => parseComposedBars('bars', SCOPE)).toThrow(CompositionError);
    expect(() => parseComposedBars({ bars: 'all of them' }, SCOPE)).toThrow(TranscriptionError);
    expect(() => parseComposedBars({ bars: [{ parts: [{ track: 0, beats: [{ notes: [] }] }] }] }, SCOPE)).toThrow(/bars\[0\]\.parts\[0\]\.beats\[0\]\.duration/);
  });
});
