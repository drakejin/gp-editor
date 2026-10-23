/**
 * GPIF rhythms with a secondary tuplet (a tuplet inside a tuplet, as Guitar Pro 7 and 8 store it), on a hand-written
 * document: none of the alphaTab fixtures has one.
 */
import { describe, expect, it } from 'vitest';
import { readGpifDocument } from '../src/formats/gpif/gpif-reader';
import { gpifToSong } from '../src/formats/gpif/gpif-to-song';
import { QUARTER_TIME, type Duration, type Song } from '../src/model/song';
import { assertSongInvariants } from './helpers/invariants';

const TRACK = '<Track id="0"><Name>Guitar</Name>'
  + '<GeneralMidi><Program>25</Program><PrimaryChannel>0</PrimaryChannel><SecondaryChannel>1</SecondaryChannel></GeneralMidi>'
  + '<Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property></Properties></Track>';

const NOTE = '<Note id="0"><Properties><Property name="String"><String>0</String></Property>'
  + '<Property name="Fret"><Fret>3</Fret></Property></Properties></Note>';

/** One 4/4 bar whose voice plays `rhythmRefs` in order (each beat a note), with `rhythms` as the rhythm list. */
function bar(rhythms: string, rhythmRefs: readonly number[]): Song {
  const beats = rhythmRefs.map((ref, index) => `<Beat id="${index}"><Rhythm ref="${ref}"/><Notes>0</Notes></Beat>`).join('');
  const xml = `<GPIF><Tracks>${TRACK}</Tracks><MasterBars><MasterBar><Time>4/4</Time><Bars>0</Bars></MasterBar></MasterBars>`
    + '<Bars><Bar id="0"><Voices>0 -1 -1 -1</Voices></Bar></Bars>'
    + `<Voices><Voice id="0"><Beats>${rhythmRefs.map((_, index) => index).join(' ')}</Beats></Voice></Voices>`
    + `<Beats>${beats}</Beats><Notes>${NOTE}</Notes><Rhythms>${rhythms}</Rhythms></GPIF>`;
  const song = gpifToSong(readGpifDocument(xml, 7), { format: 'gp7', version: 'test' });
  assertSongInvariants(song);
  return song;
}

function durations(song: Song): readonly Duration[] {
  return (song.tracks[0]?.measures[0]?.beats ?? []).map((beat) => beat.voices[0]?.duration).filter((duration): duration is Duration => duration !== undefined);
}

function offsets(song: Song): readonly number[] {
  const start = song.measureHeaders[0]?.start ?? 0;
  return (song.tracks[0]?.measures[0]?.beats ?? []).map((beat) => (beat.start - start) / QUARTER_TIME);
}

const QUINTUPLET = '<Rhythm id="0"><NoteValue>16th</NoteValue><PrimaryTuplet num="5" den="4"/></Rhythm>';
const TRIPLET_IN_QUINTUPLET = '<Rhythm id="1"><NoteValue>16th</NoteValue><PrimaryTuplet num="5" den="4"/><SecondaryTuplet num="3" den="2"/></Rhythm>';
const HALF = '<Rhythm id="2"><NoteValue>Half</NoteValue></Rhythm>';
const QUARTER = '<Rhythm id="3"><NoteValue>Quarter</NoteValue></Rhythm>';

describe('GPIF secondary tuplets', () => {
  it('reads the secondary tuplet as the tuplet inside the primary one', () => {
    // Act
    const song = bar(QUINTUPLET + TRIPLET_IN_QUINTUPLET + HALF + QUARTER, [0, 1, 1, 1, 0, 0, 3, 2]);

    // Assert
    const [first, nested] = durations(song);
    expect(first).toEqual({ value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 } });
    expect(nested).toEqual({ value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 }, innerTuplet: { enters: 3, times: 2 } });
  });

  it('places the beats after a tuplet inside a tuplet exactly', () => {
    // Act
    const song = bar(QUINTUPLET + TRIPLET_IN_QUINTUPLET + HALF + QUARTER, [0, 1, 1, 1, 0, 0, 3, 2]);

    // Assert: a fifth of a quarter, three triplets in two fifths, two fifths, then the quarter and the half
    expect(offsets(song)).toEqual([0, 0.2, 0.2 + 2 / 15, 0.2 + 4 / 15, 0.6, 0.8, 1, 2].map((offset) => expect.closeTo(offset, 12)));
    const start = song.measureHeaders[0]?.start ?? 0;
    expect(song.tracks[0]?.measures[0]?.beats[6]?.start).toBe(start + QUARTER_TIME);
    expect(song.tracks[0]?.measures[0]?.beats[7]?.start).toBe(start + 2 * QUARTER_TIME);
  });

  it('takes a secondary tuplet without a primary one as the tuplet itself', () => {
    // Arrange
    const alone = '<Rhythm id="0"><NoteValue>Eighth</NoteValue><SecondaryTuplet num="3" den="2"/></Rhythm>';

    // Act
    const [duration] = durations(bar(alone, [0]));

    // Assert
    expect(duration).toEqual({ value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } });
  });

  it('ignores a secondary tuplet of 1:1 or with no notes', () => {
    // Arrange
    const normal = '<Rhythm id="0"><NoteValue>Eighth</NoteValue><PrimaryTuplet num="3" den="2"/><SecondaryTuplet num="1" den="1"/></Rhythm>'
      + '<Rhythm id="1"><NoteValue>Eighth</NoteValue><PrimaryTuplet num="3" den="2"/><SecondaryTuplet num="0" den="2"/></Rhythm>';

    // Act
    const [first, second] = durations(bar(normal, [0, 1]));

    // Assert
    expect(first).toEqual({ value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } });
    expect(second).toEqual(first);
  });
});
