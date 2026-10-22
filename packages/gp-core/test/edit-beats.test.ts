import { describe, expect, it } from 'vitest';
import { type BeatAddress, deleteBeat, deleteBeatNotes, insertBeat, setBeatDuration } from '../src/edit/beats';
import type { Beat, Song } from '../src/model/song';
import { assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';

const AT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };
const TRIPLET = { enters: 3, times: 2 };

/** One track, one 4/4 measure, voice 1 only. */
function oneMeasure(...events: ReturnType<typeof rest>[]): Song {
  return deepFreeze(buildSong({ tracks: [[[events]]] }));
}

function layout(song: Song, voiceIndex = 0, measureIndex = 0, trackIndex = 0): string[] {
  return voiceLayout(song, trackIndex, measureIndex, voiceIndex);
}

function patchBeat(song: Song, beatIndex: number, patch: Partial<Beat>): Song {
  const track = song.tracks[0]!;
  const measure = track.measures[0]!;
  const beats = measure.beats.map((beat, i) => (i === beatIndex ? { ...beat, ...patch } : beat));
  return deepFreeze({ ...song, tracks: [{ ...track, measures: [{ ...measure, beats }, ...track.measures.slice(1)] }] });
}

describe('setBeatDuration', () => {
  it('fills the time a shorter note gives up with rests, so the next note keeps its place', () => {
    // Arrange
    const song = oneMeasure(play(2, n(1, 5)), play(2, n(2, 7)));

    // Act
    const edited = setBeatDuration(song, AT, dur(4));

    // Assert
    expect(layout(edited)).toEqual(['0:4:1/5', '960:4:r', '1920:2:2/7']);
    assertEditInvariants(edited);
  });

  it('splits a whole-measure rest into rests of the new duration', () => {
    const edited = setBeatDuration(oneMeasure(rest(1)), AT, dur(4));
    expect(layout(edited)).toEqual(['0:4:r', '960:4:r', '1920:4:r', '2880:4:r']);
  });

  it('takes the room for a longer note from the rest that follows, keeping later notes in place', () => {
    const song = oneMeasure(play(4, n(1, 0)), rest(4), play(4, n(2, 2)), rest(4));
    const edited = setBeatDuration(song, AT, dur(2));
    expect(layout(edited)).toEqual(['0:2:1/0', '1920:4:2/2', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('refills what is left of a longer rest it had to remove', () => {
    const song = oneMeasure(play(4, n(1, 0)), rest(2), play(4, n(2, 2)));
    const edited = setBeatDuration(song, AT, dur(4, { dotted: true }));
    expect(layout(edited)).toEqual(['0:4.:1/0', '1440:4.:r', '2880:4:2/2']);
  });

  it('pushes the following notes right when the free rests come later in the measure', () => {
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(2, 2)), rest(2));
    const edited = setBeatDuration(song, AT, dur(2));
    expect(layout(edited)).toEqual(['0:2:1/0', '1920:4:2/2', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('lets the measure overflow when no rest makes room for a longer duration', () => {
    // Arrange
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3)));

    // Act
    const first = setBeatDuration(song, AT, dur(2));
    const last = setBeatDuration(song, { ...AT, beatIndex: 3 }, dur(2));

    // Assert: no note is lost; the later notes move past the measure end
    expect(layout(first)).toEqual(['0:2:1/0', '1920:4:1/1', '2880:4:1/2', '3840:4:1/3']);
    expect(layout(last)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:2:1/3']);
    assertEditInvariants(first);
    assertEditInvariants(last);
  });

  it('lets a note grow into the unused end of an incomplete measure', () => {
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(1, 2)));
    expect(layout(setBeatDuration(song, AT, dur(2)))).toEqual(['0:2:1/0', '1920:4:1/2']);
  });

  it('supports tuplets, filling the freed time with rests of the same tuplet', () => {
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(1, 2)), rest(2));
    const edited = setBeatDuration(song, AT, dur(8, { tuplet: TRIPLET }));
    expect(layout(edited)).toEqual(['0:8/3:2:1/0', '320:8/3:2:r', '640:8/3:2:r', '960:4:1/2', '1920:2:r']);
    assertEditInvariants(edited);
  });

  it('never moves the events of another voice', () => {
    // Arrange
    const song = deepFreeze(
      buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 2)), rest(2)], [play(2, n(4, 0)), play(2, n(4, 2))]]]] }),
    );

    // Act
    const edited = setBeatDuration(song, AT, dur(2));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:2:1/0', '1920:4:1/2', '2880:4:r']);
    expect(layout(edited, 1)).toEqual(['0:2:4/0', '1920:2:4/2']);
    expect(edited.tracks[0]?.measures[0]?.beats.map((beat) => beat.start - 960)).toEqual([0, 1920, 2880]);
    assertEditInvariants(edited);
  });

  it('edits a secondary voice without touching the first', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 0))], [rest(1)]]]] }));
    const edited = setBeatDuration(song, { ...AT, voiceIndex: 1 }, dur(2));
    expect(layout(edited, 1)).toEqual(['0:2:r', '1920:2:r']);
    expect(layout(edited, 0)).toEqual(['0:1:1/0']);
    expect(edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]).toBe(song.tracks[0]?.measures[0]?.beats[0]?.voices[0]);
  });

  it('moves the text and chord of a beat with its event when no other voice stays there', () => {
    const base = oneMeasure(play(4, n(1, 0)), play(4, n(2, 2)), rest(2));
    const song = patchBeat(base, 1, { text: 'riff', chord: { name: 'E', firstFret: 0, frets: [0] } });
    const moved = setBeatDuration(song, AT, dur(2)).tracks[0]?.measures[0]?.beats.find((beat) => beat.text === 'riff');
    expect(moved?.start).toBe(960 + 1920);
    expect(moved?.chord?.name).toBe('E');
  });

  it('keeps the beat attributes where they are when another voice still plays there', () => {
    const base = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 2)), rest(2)], [play(1, n(4, 0))]]]] }));
    const song = patchBeat(base, 0, { text: 'intro', stroke: { direction: 'down', value: 8 } });
    const beats = setBeatDuration(song, AT, dur(8)).tracks[0]?.measures[0]?.beats ?? [];
    expect(beats[0]).toMatchObject({ start: 960, text: 'intro', stroke: { direction: 'down', value: 8 } });
    expect(beats.slice(1).some((beat) => beat.text !== undefined)).toBe(false);
  });

  it('shares the untouched tracks, measures and headers', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[rest(1)]], [[rest(1)]]], [[[rest(1)]], [[rest(1)]]]] }));
    const edited = setBeatDuration(song, AT, dur(2));
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    expect(edited.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    assertEditInvariants(edited);
  });

  it('returns the same song for the same duration, an invalid duration or an address without an event', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0)), rest(2)], [rest(1)]]]] }));
    expect(setBeatDuration(song, AT, dur(2))).toBe(song);
    expect(setBeatDuration(song, AT, { ...dur(2), value: 3 as 4 })).toBe(song);
    expect(setBeatDuration(song, AT, { ...dur(2), tuplet: { enters: 0, times: 2 } })).toBe(song);
    expect(setBeatDuration(song, { ...AT, voiceIndex: 1, beatIndex: 1 }, dur(4))).toBe(song);
    expect(setBeatDuration(song, { ...AT, beatIndex: 7 }, dur(4))).toBe(song);
    expect(setBeatDuration(song, { ...AT, trackIndex: 3 }, dur(4))).toBe(song);
    expect(setBeatDuration(song, { ...AT, voiceIndex: 4 }, dur(4))).toBe(song);
  });

  it('keeps a pickup note in place, filling the time before it with rests (autoCompleteSilences)', () => {
    // Arrange: a lone quarter at the last beat of the measure, as readers place an anacrusis
    const base = oneMeasure(play(4, n(1, 0)));
    const song = patchBeat(base, 0, { start: 960 + 2880 });

    // Act
    const edited = setBeatDuration(song, AT, dur(8));

    // Assert
    expect(layout(edited)).toEqual(['0:2.:r', '2880:8:1/0', '3360:8:r']);
    assertEditInvariants(edited);
  });

  it('fills a gap in another voice with rests of the tuplet that caused it, keeping that voice’s notes in place', () => {
    // Arrange: voice 2 starts under the second eighth triplet of voice 1 (as setNoteFret on an empty slot leaves it)
    const base = deepFreeze(buildSong({ tracks: [[[[play(dur(8, { tuplet: TRIPLET }), n(1, 0)), play(dur(8, { tuplet: TRIPLET }), n(1, 1)), play(dur(8, { tuplet: TRIPLET }), n(1, 2)), rest(dur(2, { dotted: true }))]]]] }));
    const second = base.tracks[0]!.measures[0]!.beats[1]!;
    const song = patchBeat(base, 1, { voices: [second.voices[0]!, { duration: dur(4), notes: [n(4, 0)], isEmpty: false, direction: 'none' }] });

    // Act
    const edited = setBeatDuration(song, { ...AT, beatIndex: 3 }, dur(2));

    // Assert
    expect(layout(edited, 1)).toEqual(['0:8/3:2:r', '320:4:4/0']);
    expect(layout(edited, 0).slice(3)).toEqual(['960:2:r', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('refuses to edit a measure whose voice leaves a gap no rest can fill', () => {
    const base = oneMeasure(play(4, n(1, 0)), rest(4), rest(2));
    const beats = base.tracks[0]!.measures[0]!.beats;
    const odd = { ...beats[0]!, start: 960 + 50, voices: [{ ...beats[0]!.voices[0]!, isEmpty: true, notes: [] }, { duration: dur(4), notes: [n(4, 0)], isEmpty: false, direction: 'none' as const }] };
    const track = base.tracks[0]!;
    const song = deepFreeze({ ...base, tracks: [{ ...track, measures: [{ ...track.measures[0]!, beats: [beats[0]!, odd, ...beats.slice(1)] }] }] });
    expect(setBeatDuration(song, AT, dur(8))).toBe(song);
  });

  it('keeps a rest that carries a stroke instead of taking its time', () => {
    const base = oneMeasure(play(4, n(1, 0)), rest(4), rest(4), rest(4));
    const song = patchBeat(base, 1, { stroke: { direction: 'down', value: 8 }, pickStroke: 'up' });
    const beats = setBeatDuration(song, AT, dur(2)).tracks[0]?.measures[0]?.beats ?? [];
    expect(beats.find((beat) => beat.stroke.direction === 'down')).toMatchObject({ start: 960 + 1920, pickStroke: 'up' });
  });

  it('finds the addressed event even when a voice object appears twice in the measure', () => {
    const base = oneMeasure(play(4, n(1, 0)), rest(4), rest(2));
    const shared = base.tracks[0]!.measures[0]!.beats[0]!.voices[0]!;
    const song = patchBeat(base, 1, { voices: [shared, base.tracks[0]!.measures[0]!.beats[1]!.voices[1]!] });
    const edited = setBeatDuration(song, { ...AT, beatIndex: 1 }, dur(8));
    expect(layout(edited)).toEqual(['0:4:1/0', '960:8:1/0', '1440:8:r', '1920:2:r']);
  });

  it('cuts a trailing rest to a tuplet length using the tuplet of the edited event', () => {
    // Arrange: an eighth triplet followed by a sixteenth-triplet rest, a plain eighth and rests
    const song = setBeatDuration(oneMeasure(play(8, n(1, 0)), play(8, n(1, 2)), rest(4), rest(2)), AT, dur(8, { tuplet: TRIPLET }));
    expect(layout(song)).toEqual(['0:8/3:2:1/0', '320:16/3:2:r', '480:8:1/2', '960:4:r', '1920:2:r']);

    // Act: another eighth triplet pushes the half rest 320 ticks past the end
    const inserted = insertBeat(song, AT, 'after');

    // Assert: the 1600 ticks left are a dotted quarter and a sixteenth triplet
    expect(layout(inserted)).toEqual(['0:8/3:2:1/0', '320:8/3:2:r', '640:16/3:2:r', '800:8:1/2', '1280:4:r', '2240:4.:r', '3680:16/3:2:r']);
    assertEditInvariants(inserted);
  });

  it('treats dotted and double dotted together as dotted', () => {
    const song = oneMeasure(play(4, n(1, 0)), rest(4), rest(2));
    const edited = setBeatDuration(song, AT, { ...dur(4), dotted: true, doubleDotted: true });
    expect(edited.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration).toEqual({ ...dur(4), dotted: true });
  });
});

describe('insertBeat', () => {
  it('inserts a rest of the same duration after the event and drops the rest pushed out of the measure', () => {
    // Arrange
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(2, 2)), rest(2));

    // Act
    const edited = insertBeat(song, AT, 'after');

    // Assert
    expect(layout(edited)).toEqual(['0:4:1/0', '960:4:r', '1920:4:2/2', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('inserts before the event', () => {
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(2, 2)), rest(2));
    expect(layout(insertBeat(song, AT, 'before'))).toEqual(['0:4:r', '960:4:1/0', '1920:4:2/2', '2880:4:r']);
    expect(layout(insertBeat(song, { ...AT, beatIndex: 1 }, 'before'))).toEqual(['0:4:1/0', '960:4:r', '1920:4:2/2', '2880:4:r']);
  });

  it('uses the duration of the addressed event', () => {
    const song = oneMeasure(play(8, n(1, 0)), rest(8), rest(4), rest(2));
    expect(layout(insertBeat(song, AT, 'after'))).toEqual(['0:8:1/0', '480:8:r', '960:8:r', '1440:4:r', '2400:4.:r']);
  });

  it('pushes notes past the end of a full measure instead of dropping them', () => {
    // Arrange
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3)));

    // Act
    const edited = insertBeat(song, AT, 'after');

    // Assert
    expect(layout(edited)).toEqual(['0:4:1/0', '960:4:r', '1920:4:1/1', '2880:4:1/2', '3840:4:1/3']);
    assertEditInvariants(edited);
  });

  it('extends an incomplete measure', () => {
    expect(layout(insertBeat(oneMeasure(play(4, n(1, 0))), AT, 'after'))).toEqual(['0:4:1/0', '960:4:r']);
  });

  it('leaves the other voices alone', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), rest(4), rest(2)], [play(2, n(4, 0)), play(2, n(4, 2))]]]] }));
    const edited = insertBeat(song, AT, 'before');
    expect(layout(edited, 1)).toEqual(['0:2:4/0', '1920:2:4/2']);
    expect(layout(edited, 0)).toEqual(['0:4:r', '960:4:1/0', '1920:4:r', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('returns the same song for an address without an event', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0)), rest(2)], [rest(1)]]]] }));
    expect(insertBeat(song, { ...AT, beatIndex: 1, voiceIndex: 1 }, 'after')).toBe(song);
    expect(insertBeat(song, { ...AT, measureIndex: 1 }, 'after')).toBe(song);
  });
});

describe('deleteBeat', () => {
  it('removes the event, moves the following ones left and pads the end with a rest', () => {
    // Arrange
    const song = oneMeasure(play(4, n(1, 0)), play(4, n(2, 2)), play(2, n(3, 3)));

    // Act
    const edited = deleteBeat(song, AT);

    // Assert
    expect(layout(edited)).toEqual(['0:4:2/2', '960:2:3/3', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('turns a lone note into a rest of the same length', () => {
    expect(layout(deleteBeat(oneMeasure(play(1, n(1, 0))), AT))).toEqual(['0:1:r']);
  });

  it('returns the same song when deleting a rest changes nothing', () => {
    const song = oneMeasure(rest(1));
    expect(deleteBeat(song, AT)).toBe(song);
    const trailing = oneMeasure(play(2, n(1, 0)), rest(2));
    expect(deleteBeat(trailing, { ...AT, beatIndex: 1 })).toBe(trailing);
  });

  it('removes an event of a secondary voice; a beat left without events disappears', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 0)), play(2, n(1, 2))], [play(4, n(4, 0)), play(4, n(4, 2)), rest(2)]]]] }));
    const edited = deleteBeat(song, { ...AT, beatIndex: 1, voiceIndex: 1 });
    expect(layout(edited, 1)).toEqual(['0:4:4/0', '960:2:r', '2880:4:r']);
    expect(layout(edited, 0)).toEqual(['0:2:1/0', '1920:2:1/2']);
    assertEditInvariants(edited);
  });

  it('shortens an overfull measure without padding past its end', () => {
    const song = oneMeasure(play(2, n(1, 0)), play(2, n(1, 2)), play(4, n(1, 3)));
    const edited = deleteBeat(song, AT);
    expect(layout(edited)).toEqual(['0:2:1/2', '1920:4:1/3', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('returns the same song for an address without an event', () => {
    const song = oneMeasure(rest(1));
    expect(deleteBeat(song, { ...AT, beatIndex: 1 })).toBe(song);
    expect(deleteBeat(song, { ...AT, voiceIndex: 1 })).toBe(song);
    expect(deleteBeat(song, { ...AT, trackIndex: -1 })).toBe(song);
  });
});

describe('deleteBeatNotes', () => {
  it('turns the voice into a rest of the same duration, leaving the other voice and beats in place', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0), n(2, 1)), play(dur(2, { dotted: true }), n(1, 2))], [play(1, n(5, 3))]]]] }));

    // Act
    const edited = deleteBeatNotes(song, { ...AT, beatIndex: 1 });

    // Assert
    expect(layout(edited)).toEqual(['0:4:1/0,2/1', '960:2.:r']);
    expect(layout(edited, 1)).toEqual(['0:1:5/3']);
    expect(edited.tracks[0]?.measures[0]?.beats[0]).toBe(song.tracks[0]?.measures[0]?.beats[0]);
    assertEditInvariants(edited);
  });

  it('empties the addressed voice only', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 0))], [play(1, n(5, 3))]]]] }));
    const edited = deleteBeatNotes(song, { ...AT, voiceIndex: 1 });
    expect(layout(edited, 0)).toEqual(['0:1:1/0']);
    expect(layout(edited, 1)).toEqual(['0:1:r']);
  });

  it('returns the same song for a rest, an empty voice or a missing beat', () => {
    const song = oneMeasure(play(2, n(1, 0)), rest(2));
    expect(deleteBeatNotes(song, { ...AT, beatIndex: 1 })).toBe(song);
    expect(deleteBeatNotes(song, { ...AT, voiceIndex: 1 })).toBe(song);
    expect(deleteBeatNotes(song, { ...AT, beatIndex: 5 })).toBe(song);
  });
});
