import type { Beat, Song } from '@gp-editor/core';
import { TAB, layoutMeasure } from '../src/lib/layout';
import { type ScoreMode, rowGeometry } from '../src/score/geometry';
import { positionY } from '../src/score/notation/metrics';
import { placeMeasureChords } from '../src/score/notation/voice-placement';
import { type NoteHitRow, hitTestNote } from '../src/score/note-hit';
import { placeRow, rowHeaderWidth } from '../src/score/row';
import { FRET_BOX } from '../src/score/symbols/small-frets';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const START = toTux(header(1).start);

/** Bar 1: G4 (fret 3 on string 1), then E4 (fret 5 on string 2) — written an octave up, G5 and E5. */
const SONG = makeSong([[beat(START, [note(1, 3)]), beat(START + 960, [note(2, 5)])]]);

function hitRow(song: Song = SONG, mode: ScoreMode = 'notationAndTab', voiceIndex: number | undefined = 0): NoteHitRow {
  const track = song.tracks[0]!;
  const placed = placeRow({ measures: [layoutMeasure(song, 0, 0)] }, rowHeaderWidth(mode, track));
  return { song, trackIndex: 0, placed, geometry: rowGeometry(mode, track.strings.length), mode, voiceIndex };
}

/** The centre of beat `beatIndex` of the row's bar, on the tab line of `string`. */
function fretPoint(row: NoteHitRow, beatIndex: number, string: number): { readonly x: number; readonly y: number } {
  const [bar] = row.placed;
  return {
    x: (bar?.x ?? Number.NaN) + (bar?.layout.beats[beatIndex]?.x ?? Number.NaN),
    y: (row.geometry.tabTop ?? Number.NaN) + (string - 1) * TAB.stringGap,
  };
}

/** Two voices on one beat: voice 1 on string 1, voice 2 on string 5. */
function twoVoices(): Song {
  const upper = beat(START, [note(1, 3)]);
  const lower: Beat = { ...upper, voices: [...upper.voices, ...beat(START, [note(5, 3)]).voices] };
  return makeSong([[lower]]);
}

describe('hitTestNote on the tab', () => {
  it('finds the note whose fret number is under the pointer: its beat, voice and string', () => {
    // Arrange
    const row = hitRow();
    const { x, y } = fretPoint(row, 1, 2);

    // Act + Assert
    expect(hitTestNote(row, x, y)).toEqual({ measureIndex: 0, beatIndex: 1, voiceIndex: 0, string: 2 });
    expect(hitTestNote(row, x + FRET_BOX.width / 2 - 1, y + FRET_BOX.height / 2 - 2)).toEqual({ measureIndex: 0, beatIndex: 1, voiceIndex: 0, string: 2 });
  });

  it('finds none on a string without a note, nor beside a fret number', () => {
    // Arrange
    const row = hitRow();
    const { x, y } = fretPoint(row, 1, 2);

    // Act + Assert
    expect(hitTestNote(row, x, y + TAB.stringGap)).toBeUndefined();
    expect(hitTestNote(row, x + FRET_BOX.width / 2 + 2, y)).toBeUndefined();
  });

  it('finds only the edited voice’s notes, or any voice’s when none is edited (multivoice)', () => {
    // Arrange
    const row = hitRow(twoVoices());
    const lower = fretPoint(row, 0, 5);

    // Act + Assert
    expect(hitTestNote(row, lower.x, lower.y)).toBeUndefined();
    expect(hitTestNote({ ...row, voiceIndex: 1 }, lower.x, lower.y)).toEqual({ measureIndex: 0, beatIndex: 0, voiceIndex: 1, string: 5 });
    expect(hitTestNote({ ...row, voiceIndex: undefined }, lower.x, lower.y)).toEqual({ measureIndex: 0, beatIndex: 0, voiceIndex: 1, string: 5 });
  });

  it('finds no note in a slashed beat (its slash stands for every note)', () => {
    // Arrange
    const slashed: Song = { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, hasSlashNotation: true })) };
    const row = hitRow(slashed);
    const { x, y } = fretPoint(row, 0, 1);

    // Act + Assert
    expect(hitTestNote(row, x, y)).toBeUndefined();
  });
});

describe('hitTestNote on the notation staff', () => {
  it('finds the note whose notehead is under the pointer, and none on an empty line or space', () => {
    // Arrange: G5 sits in the space above the top line (staff position 9).
    const row = hitRow();
    const { x } = fretPoint(row, 0, 1);
    const top = row.geometry.notationTop ?? Number.NaN;

    // Act + Assert
    expect(hitTestNote(row, x, positionY(top, 9))).toEqual({ measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
    expect(hitTestNote(row, x + 3, positionY(top, 9) + 2)).toEqual({ measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
    expect(hitTestNote(row, x, positionY(top, 5))).toBeUndefined();
  });

  it('tells apart the two noteheads of a second, set either side of the stem', () => {
    // Arrange: F5 and E5 written (F4 on string 1, E4 on string 2) in one beat.
    const song = makeSong([[beat(START, [note(1, 1), note(2, 5)])]]);
    const row = hitRow(song);
    const [bar] = row.placed;
    const track = song.tracks[0]!;
    const { chords } = placeMeasureChords(track, track.measures[0]!, {
      layout: bar!.layout,
      header: song.measureHeaders[0]!,
      top: row.geometry.notationTop ?? Number.NaN,
      transposition: 12,
    });
    const heads = chords[0]?.heads ?? [];
    const centre = (string: number) => {
      const head = heads.find((each) => each.note.string === string)!;
      return { x: bar!.x + head.x + head.width / 2, y: head.y };
    };

    // Act + Assert
    expect(heads.map((head) => head.x)).not.toEqual([heads[0]?.x, heads[0]?.x]);
    expect(hitTestNote(row, centre(1).x, centre(1).y)?.string).toBe(1);
    expect(hitTestNote(row, centre(2).x, centre(2).y)?.string).toBe(2);
  });

  it('finds no notehead where the row does not draw the notation (tab only)', () => {
    // Arrange: the geometry has a notation staff, but the row shows the tab alone.
    const row = { ...hitRow(), mode: 'tab' as const };
    const { x } = fretPoint(row, 0, 1);

    // Act + Assert
    expect(hitTestNote(row, x, positionY(row.geometry.notationTop ?? Number.NaN, 9))).toBeUndefined();
  });
});
