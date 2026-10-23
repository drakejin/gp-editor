import { hasScaleNeck, selectionNotes, sourceSummary, trackNotes } from '../src/lib/scale-sources';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: A (string 3 fret 2), C (string 2 fret 1); bar 2: E (string 1 open), then a rest; bar 3: G (string 1 fret 3). */
const SONG = makeSong([
  [beat(960, [note(3, 2)]), beat(1920, [note(2, 1)])],
  [beat(4800, [note(1, 0)]), beat(5760, [])],
  [beat(8640, [note(1, 3)])],
]);

describe('selectionNotes', () => {
  it('reads the selected beats, across bars', () => {
    const source = selectionNotes(SONG, 0, { first: { measureIndex: 0, beatIndex: 1 }, last: { measureIndex: 1, beatIndex: 1 } }, 0);
    expect(source).toEqual({ label: 'the selection', pitches: [60, 64] });
  });

  it('reads the cursor’s bar when nothing is selected', () => {
    expect(selectionNotes(SONG, 0, undefined, 2)).toEqual({ label: 'bar 3', pitches: [67] });
  });
});

describe('trackNotes', () => {
  it('reads every note of the track', () => {
    expect(trackNotes(SONG, 0)).toEqual({ label: 'the track', pitches: [57, 60, 64, 67] });
    expect(trackNotes(SONG, 5)).toEqual({ label: 'the track', pitches: [] });
  });
});

describe('sourceSummary', () => {
  it('counts the notes and names their pitch classes from C up', () => {
    expect(sourceSummary(trackNotes(SONG, 0))).toBe('4 notes in the track: C E G A');
    expect(sourceSummary({ label: 'bar 2', pitches: [] })).toBe('No notes in bar 2');
    expect(sourceSummary({ label: 'bar 2', pitches: [64] })).toBe('1 note in bar 2: E');
  });
});

describe('hasScaleNeck', () => {
  it('is true for a pitched track of 3 to 10 strings', () => {
    const track = SONG.tracks[0]!;
    expect(hasScaleNeck(track)).toBe(true);
    expect(hasScaleNeck({ ...track, isPercussion: true })).toBe(false);
    expect(hasScaleNeck({ ...track, strings: track.strings.slice(0, 2) })).toBe(false);
    expect(hasScaleNeck(undefined)).toBe(false);
  });
});
