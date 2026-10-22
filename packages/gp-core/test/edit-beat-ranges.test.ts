import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from '../src/edit/beat-ranges';
import { EMPTY_NOTE_EFFECT, NO_STROKE } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';

function at(measureIndex: number, beatIndex: number, voiceIndex = 0, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

/** One track of 4/4 bars, voice 1 only. */
function bars(...measures: (readonly EventSpec[])[]): Song {
  return deepFreeze(buildSong({ tracks: [measures.map((events) => [events])] }));
}

function layout(song: Song, measureIndex: number, voiceIndex = 0, trackIndex = 0): string[] {
  return voiceLayout(song, trackIndex, measureIndex, voiceIndex);
}

function tied(string: number, fret: number): Note {
  return { ...n(string, fret), isTied: true };
}

function item(value: 1 | 2 | 4 | 8, ...notes: Note[]): BeatFragmentItem {
  return { duration: dur(value), notes, stroke: NO_STROKE, pickStroke: 'none' };
}

function fragment(...items: BeatFragmentItem[]): BeatFragment {
  return { isPercussion: false, items };
}

function noteSummary(fragmentItems: readonly BeatFragmentItem[]): string[] {
  return fragmentItems.map((entry) => `${entry.duration.value}:${entry.notes.map((note) => `${note.string}/${note.fret}${note.isTied ? '~' : ''}`).join(',') || 'r'}`);
}

const FOUR_QUARTERS = [play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))];
const NEXT_QUARTERS = [play(4, n(1, 4)), play(4, n(1, 5)), play(4, n(1, 6)), play(4, n(1, 7))];

describe('copyBeats', () => {
  it('lifts a run of beats across a bar line, rests included', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, [play(4, n(1, 4)), rest(4), rest(2)]);

    // Act
    const copied = copyBeats(song, at(0, 2), at(1, 1));

    // Assert
    expect(noteSummary(copied.items)).toEqual(['4:1/2', '4:1/3', '4:1/4', '4:r']);
    expect(copied.isPercussion).toBe(false);
  });

  it('reads a backwards range from its earlier end', () => {
    const song = bars(FOUR_QUARTERS, NEXT_QUARTERS);
    expect(copyBeats(song, at(1, 0), at(0, 3))).toEqual(copyBeats(song, at(0, 3), at(1, 0)));
  });

  it('keeps the stroke, pick stroke and text of the copied beats', () => {
    // Arrange
    const plain = bars(FOUR_QUARTERS);
    const measure = plain.tracks[0]!.measures[0]!;
    const beats = measure.beats.map((beat, i) => (i === 1 ? { ...beat, stroke: { direction: 'down' as const, value: 16 }, pickStroke: 'up' as const, text: 'riff' } : beat));
    const song = deepFreeze({ ...plain, tracks: [{ ...plain.tracks[0]!, measures: [{ ...measure, beats }] }] });

    // Act
    const [first] = copyBeats(song, at(0, 1), at(0, 1)).items;

    // Assert
    expect(first).toMatchObject({ stroke: { direction: 'down', value: 16 }, pickStroke: 'up', text: 'riff' });
  });

  it('keeps a chord diagram through cut and paste back', () => {
    // Arrange
    const chord = { name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] };
    const plain = bars(FOUR_QUARTERS, NEXT_QUARTERS);
    const measure = plain.tracks[0]!.measures[0]!;
    const beats = measure.beats.map((beat, i) => (i === 2 ? { ...beat, chord } : beat));
    const song = deepFreeze({ ...plain, tracks: [{ ...plain.tracks[0]!, measures: [{ ...measure, beats }, plain.tracks[0]!.measures[1]!] }] });

    // Act
    const copied = copyBeats(song, at(0, 1), at(0, 2));
    const restored = insertBeatsFlowing(deleteBeatsFlowing(song, at(0, 1), at(0, 2)), at(0, 1), copied);

    // Assert
    expect(copied.items[1]?.chord).toEqual(chord);
    expect(restored.tracks[0]!.measures[0]!.beats[2]!.chord).toEqual(chord);
  });

  it('drops a tie that starts before the range and keeps one that starts inside it', () => {
    // Arrange: the last note of bar 1 is tied over the bar line
    const song = bars(FOUR_QUARTERS, [play(4, tied(1, 3)), play(4, n(1, 5)), rest(2)]);

    // Act
    const fromBar2 = copyBeats(song, at(1, 0), at(1, 1));
    const overBarLine = copyBeats(song, at(0, 3), at(1, 0));

    // Assert
    expect(noteSummary(fromBar2.items)).toEqual(['4:1/3', '4:1/5']);
    expect(noteSummary(overBarLine.items)).toEqual(['4:1/3', '4:1/3~']);
  });

  it('copies only the addressed voice', () => {
    const song = deepFreeze(buildSong({ tracks: [[[FOUR_QUARTERS, [play(2, n(3, 9)), play(2, n(3, 10))]]]] }));
    expect(noteSummary(copyBeats(song, at(0, 0, 1), at(0, 3, 1)).items)).toEqual(['2:3/9', '2:3/10']);
    expect(noteSummary(copyBeats(song, at(0, 1), at(0, 2)).items)).toEqual(['4:1/1', '4:1/2']);
  });

  it('marks beats copied from a drum track', () => {
    const plain = bars(FOUR_QUARTERS);
    const drums = deepFreeze({ ...plain, tracks: [{ ...plain.tracks[0]!, isPercussion: true }] });
    expect(copyBeats(drums, at(0, 0), at(0, 1)).isPercussion).toBe(true);
  });

  it('copies nothing for a beat or voice that does not exist', () => {
    const song = bars(FOUR_QUARTERS);
    expect(copyBeats(song, at(0, 9), at(0, 1)).items).toEqual([]);
    expect(copyBeats(song, at(0, 0), at(5, 0)).items).toEqual([]);
    expect(copyBeats(song, at(0, 0, 7), at(0, 1, 7)).items).toEqual([]);
    expect(copyBeats(song, at(0, 0, 0, 3), at(0, 1)).items).toEqual([]);
  });
});

describe('deleteBeatsFlowing', () => {
  it('pulls the following bars back and fills the end of the track with rests', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, NEXT_QUARTERS, [rest(1)]);

    // Act
    const edited = deleteBeatsFlowing(song, at(0, 1), at(0, 2));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/3', '1920:4:1/4', '2880:4:1/5']);
    expect(layout(edited, 1)).toEqual(['0:4:1/6', '960:4:1/7', '1920:2:r']);
    expect(edited.tracks[0]!.measures[2]).toBe(song.tracks[0]!.measures[2]);
    assertEditInvariants(edited);
  });

  it('splits a note pulled over a bar line into tied notes', () => {
    // Arrange
    const song = bars([play(8, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3)), play(8, n(1, 4))], [play(4, n(2, 5)), play(4, n(2, 6)), play(4, n(2, 7)), play(4, n(2, 8))]);

    // Act
    const edited = deleteBeatsFlowing(song, at(0, 0), at(0, 0));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:8:1/4', '3360:8:2/5']);
    expect(layout(edited, 1)).toEqual(['0:8:2/5', '480:4:2/6', '1440:4:2/7', '2400:4:2/8', '3360:8:r']);
    expect(edited.tracks[0]!.measures[1]!.beats[0]!.voices[0]!.notes[0]!.isTied).toBe(true);
    expect(edited.tracks[0]!.measures[0]!.beats[4]!.voices[0]!.notes[0]!.isTied).toBe(false);
    assertEditInvariants(edited);
  });

  it('unties the note after the range: its tie started inside it', () => {
    const song = bars(FOUR_QUARTERS, [play(4, tied(1, 3)), play(4, n(1, 5)), rest(2)]);
    const edited = deleteBeatsFlowing(song, at(0, 3), at(0, 3));
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:1/3']);
    expect(edited.tracks[0]!.measures[0]!.beats[3]!.voices[0]!.notes[0]!.isTied).toBe(false);
    assertEditInvariants(edited);
  });

  it('re-bars into the next time signature', () => {
    // Arrange: 4/4 then 3/4
    const song = deepFreeze(
      buildSong({ timeSignatures: [{ numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }], tracks: [[[FOUR_QUARTERS], [NEXT_QUARTERS.slice(0, 3)]]] }),
    );

    // Act
    const edited = deleteBeatsFlowing(song, at(0, 0), at(0, 0));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:4:1/4']);
    expect(layout(edited, 1)).toEqual(['0:4:1/5', '960:4:1/6', '1920:4:r']);
    assertEditInvariants(edited);
  });

  it('leaves the other voices and tracks as they are', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[FOUR_QUARTERS, [play(2, n(3, 9)), play(2, n(3, 10))]], [NEXT_QUARTERS]], [[FOUR_QUARTERS], [NEXT_QUARTERS]]] }));

    // Act
    const edited = deleteBeatsFlowing(song, at(0, 1), at(1, 0));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/5', '1920:4:1/6', '2880:4:1/7']);
    expect(layout(edited, 0, 1)).toEqual(['0:2:3/9', '1920:2:3/10']);
    expect(layout(edited, 1)).toEqual(['0:1:r']);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    assertEditInvariants(edited);
  });

  it('keeps a second voice empty in the bars where it had nothing', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[FOUR_QUARTERS, [play(2, n(3, 9)), play(2, n(3, 10))]], [NEXT_QUARTERS]]] }));

    // Act
    const edited = deleteBeatsFlowing(song, at(0, 0, 1), at(0, 0, 1));

    // Assert
    expect(layout(edited, 0, 1)).toEqual(['0:2:3/10', '1920:2:r']);
    expect(layout(edited, 1, 1)).toEqual([]);
    expect(edited.tracks[0]!.measures[1]).toBe(song.tracks[0]!.measures[1]);
    assertEditInvariants(edited);
  });

  it('returns the same song for a missing beat', () => {
    const song = bars(FOUR_QUARTERS);
    expect(deleteBeatsFlowing(song, at(0, 7), at(0, 1))).toBe(song);
    expect(deleteBeatsFlowing(song, at(0, 0, 4), at(0, 1, 4))).toBe(song);
  });
});

describe('insertBeatsFlowing', () => {
  it('pushes what follows across the bar line and drops rests pushed past the end', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, [play(4, n(1, 4)), play(4, n(1, 5)), rest(2)]);

    // Act
    const edited = insertBeatsFlowing(song, at(0, 1), fragment(item(2, n(2, 9))));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:2:2/9', '2880:4:1/1']);
    expect(layout(edited, 1)).toEqual(['0:4:1/2', '960:4:1/3', '1920:4:1/4', '2880:4:1/5']);
    expect(edited.measureHeaders).toHaveLength(2);
    assertEditInvariants(edited);
  });

  it('splits a pasted note over the bar line into tied notes', () => {
    const song = bars([play(2, n(1, 0)), play(4, n(1, 1)), rest(4)], [rest(1)]);
    const edited = insertBeatsFlowing(song, at(0, 2), fragment(item(2, n(2, 9))));
    expect(layout(edited, 0)).toEqual(['0:2:1/0', '1920:4:1/1', '2880:4:2/9']);
    expect(layout(edited, 1)).toEqual(['0:4:2/9', '960:2.:r']);
    expect(edited.tracks[0]!.measures[1]!.beats[0]!.voices[0]!.notes[0]!.isTied).toBe(true);
    assertEditInvariants(edited);
  });

  it('appends bars for notes pushed past the last bar, copying its header, in every track', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tempos: [100, 140], tracks: [[[FOUR_QUARTERS], [NEXT_QUARTERS]], [[[rest(1)]], [[rest(1)]]]] }));

    // Act
    const edited = insertBeatsFlowing(song, at(1, 0), fragment(item(2, n(2, 9))));

    // Assert
    expect(edited.measureHeaders).toHaveLength(3);
    expect(edited.measureHeaders[2]).toMatchObject({ number: 3, tempo: 140, timeSignature: { numerator: 4, denominator: 4 } });
    expect(layout(edited, 1)).toEqual(['0:2:2/9', '1920:4:1/4', '2880:4:1/5']);
    expect(layout(edited, 2)).toEqual(['0:4:1/6', '960:4:1/7', '1920:2:r']);
    expect(layout(edited, 2, 0, 1)).toEqual(['0:1:r']);
    assertEditInvariants(edited);
  });

  it('pastes into a rest of an empty second voice at the beat it is on', () => {
    const song = bars(FOUR_QUARTERS, NEXT_QUARTERS);
    const edited = insertBeatsFlowing(song, at(0, 2, 1), fragment(item(4, n(3, 9))));
    expect(layout(edited, 0, 1)).toEqual(['0:2:r', '1920:4:3/9', '2880:4:r']);
    expect(layout(edited, 1, 1)).toEqual([]);
    expect(layout(edited, 0)).toEqual(layout(song, 0));
    assertEditInvariants(edited);
  });

  it('inserts after a note of the voice that the beat falls inside', () => {
    const song = deepFreeze(buildSong({ tracks: [[[FOUR_QUARTERS, [play(2, n(3, 9)), rest(2)]]]] }));
    const edited = insertBeatsFlowing(song, at(0, 1, 1), fragment(item(4, n(3, 5))));
    expect(layout(edited, 0, 1)).toEqual(['0:2:3/9', '1920:4:3/5', '2880:4:r']);
  });

  it('unties the beat it lands before, and the first pasted note', () => {
    // Arrange
    const song = bars([play(4, n(1, 0)), play(4, tied(1, 0)), rest(2)]);

    // Act
    const edited = insertBeatsFlowing(song, at(0, 1), fragment(item(4, tied(1, 0))));

    // Assert
    const notes = edited.tracks[0]!.measures[0]!.beats.map((beat) => beat.voices[0]!.notes[0]?.isTied);
    expect(notes).toEqual([false, false, false, undefined]);
  });

  it('leaves out notes on strings the track lacks', () => {
    // Arrange
    const plain = bars(FOUR_QUARTERS);
    const fourStrings = deepFreeze({ ...plain, tracks: [{ ...plain.tracks[0]!, strings: plain.tracks[0]!.strings.slice(0, 4) }] });

    // Act
    const edited = insertBeatsFlowing(fourStrings, at(0, 0), fragment(item(4, n(2, 3), n(5, 3)), item(4, n(6, 1))));

    // Assert
    expect(layout(edited, 0).slice(0, 2)).toEqual(['0:4:2/3', '960:4:r']);
    assertEditInvariants(edited);
  });

  it('refuses drum beats in a guitar track, an empty fragment and a missing beat', () => {
    const song = bars(FOUR_QUARTERS);
    expect(insertBeatsFlowing(song, at(0, 0), { isPercussion: true, items: [item(4, n(1, 36))] })).toBe(song);
    expect(insertBeatsFlowing(song, at(0, 0), fragment())).toBe(song);
    expect(insertBeatsFlowing(song, at(0, 9), fragment(item(4, n(1, 1))))).toBe(song);
    expect(insertBeatsFlowing(song, at(0, 0, 5), fragment(item(4, n(1, 1))))).toBe(song);
  });

  it('keeps the effects with the note pieces they belong to when a note is split', () => {
    // Arrange
    const note: Note = { ...n(1, 5), effect: { ...EMPTY_NOTE_EFFECT, accentuatedNote: true, vibrato: true, hammer: true, slides: ['intoFromBelow', 'shift'] } };
    const song = bars([play(2, n(1, 0)), play(4, n(1, 1)), rest(4)], [rest(1)]);

    // Act
    const edited = insertBeatsFlowing(song, at(0, 2), fragment(item(2, note)));

    // Assert
    const first = edited.tracks[0]!.measures[0]!.beats[2]!.voices[0]!.notes[0]!;
    const last = edited.tracks[0]!.measures[1]!.beats[0]!.voices[0]!.notes[0]!;
    expect(first.effect).toMatchObject({ accentuatedNote: true, vibrato: true, hammer: false, slides: ['intoFromBelow'] });
    expect(last).toMatchObject({ isTied: true, effect: { accentuatedNote: false, vibrato: true, hammer: true, slides: ['shift'] } });
  });

  it('keeps a wide vibrato on every piece of a split note', () => {
    // Arrange
    const note: Note = { ...n(1, 5), effect: { ...EMPTY_NOTE_EFFECT, wideVibrato: true } };
    const song = bars([play(2, n(1, 0)), play(4, n(1, 1)), rest(4)], [rest(1)]);

    // Act
    const edited = insertBeatsFlowing(song, at(0, 2), fragment(item(2, note)));

    // Assert
    const last = edited.tracks[0]!.measures[1]!.beats[0]!.voices[0]!.notes[0]!;
    expect(last).toMatchObject({ isTied: true, effect: { vibrato: false, wideVibrato: true } });
  });
});

describe('copy, cut and paste together', () => {
  it('reproduces copied bars where they are pasted', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, [play(2, n(2, 4)), play(8, n(3, 5)), play(8, n(3, 6)), rest(4)], [play(4, n(1, 9)), rest(2), rest(4)]);

    // Act
    const copied = copyBeats(song, at(0, 0), at(1, 3));
    const pasted = insertBeatsFlowing(song, at(2, 0), copied);

    // Assert
    expect(layout(pasted, 2)).toEqual(layout(song, 0));
    expect(layout(pasted, 3)).toEqual(layout(song, 1));
    expect(layout(pasted, 4)).toEqual(['0:4:1/9', '960:2.:r']);
    assertEditInvariants(pasted);
  });

  it('restores the song when the cut beats are pasted back where they were', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, [play(2, n(2, 4)), play(8, n(3, 5)), play(8, n(3, 6)), play(4, n(1, 7))], [play(4, n(1, 9)), rest(dur(2, { dotted: true }))]);
    const from = at(0, 2);
    const to = at(1, 0);

    // Act
    const copied = copyBeats(song, from, to);
    const cut = deleteBeatsFlowing(song, from, to);
    const restored = insertBeatsFlowing(cut, from, copied);

    // Assert
    expect(noteSummary(copied.items)).toEqual(['4:1/2', '4:1/3', '2:2/4']);
    expect(layout(cut, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:8:3/5', '2400:8:3/6', '2880:4:1/7']);
    expect(layout(cut, 1)).toEqual(['0:4:1/9', '960:2.:r']);
    expect(layout(cut, 2)).toEqual(['0:1:r']);
    expect([0, 1, 2].map((measureIndex) => layout(restored, measureIndex))).toEqual([0, 1, 2].map((measureIndex) => layout(song, measureIndex)));
    assertEditInvariants(cut);
    assertEditInvariants(restored);
  });
});
