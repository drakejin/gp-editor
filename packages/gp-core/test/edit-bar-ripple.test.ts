import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { deleteBeat, deleteBeatWithFlow, insertBeat, insertBeatWithFlow, setBeatDuration, setBeatDurationWithFlow } from '../src/edit/beats';
import { setNoteFret } from '../src/edit/edit-song';
import { isMeasureOverfull } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';

// A beat edit that leaves a bar too long moves the excess on into the next bars, and deleting a beat pulls the music
// after it back — one voice of one track, stopping where a rest at the end of a bar takes the push or gives the time.

function at(measureIndex: number, beatIndex: number, voiceIndex = 0, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

/** One track of 4/4 bars, voice 1 only. */
function bars(...measures: (readonly EventSpec[])[]): Song {
  return deepFreeze(buildSong({ tracks: [measures.map((events) => [events])] }));
}

/** voiceLayout with tied notes marked `~`. */
function layout(song: Song, measureIndex: number, voiceIndex = 0, trackIndex = 0): string[] {
  const plain = voiceLayout(song, trackIndex, measureIndex, voiceIndex);
  const beats = (song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? []).filter((beat) => beat.voices[voiceIndex]?.isEmpty === false);
  return plain.map((entry, index) => (beats[index]?.voices[voiceIndex]?.notes.some((note) => note.isTied) === true ? `${entry}~` : entry));
}

function quarters(...frets: number[]): EventSpec[] {
  return frets.map((fret) => play(4, n(1, fret)));
}

describe('a beat edit that makes a bar too long', () => {
  it('moves the last note on into the next bar, whose rest at the end takes the push', () => {
    // Arrange
    const song = bars(quarters(0, 1, 2, 3), [...quarters(4, 5), rest(2)], quarters(8, 9, 10, 11));

    // Act
    const edited = insertBeat(song, at(0, 0), 'after');

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:r', '1920:4:1/1', '2880:4:1/2']);
    expect(layout(edited, 1)).toEqual(['0:4:1/3', '960:4:1/4', '1920:4:1/5', '2880:4:r']);
    expect(edited.tracks[0]?.measures[2]).toBe(song.tracks[0]?.measures[2]);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    assertEditInvariants(edited);
  });

  it('ripples through full bars until a bar ending in a rest takes the push', () => {
    const song = bars(quarters(0, 1, 2, 3), quarters(4, 5, 6, 7), [...quarters(8, 9, 10), rest(4)], quarters(12, 13, 14, 15));
    const edited = insertBeat(song, at(0, 1), 'after');
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:r', '2880:4:1/2']);
    expect(layout(edited, 1)).toEqual(['0:4:1/3', '960:4:1/4', '1920:4:1/5', '2880:4:1/6']);
    expect(layout(edited, 2)).toEqual(['0:4:1/7', '960:4:1/8', '1920:4:1/9', '2880:4:1/10']);
    expect(edited.tracks[0]?.measures[3]).toBe(song.tracks[0]?.measures[3]);
    assertEditInvariants(edited);
  });

  it('cuts a note the bar line crosses into tied notes', () => {
    // Arrange: a dotted half and a quarter fill the bar; a dotted-half rest inserted before them
    const song = bars([play(dur(2, { dotted: true }), n(1, 0)), play(4, n(1, 1))], [rest(1)]);

    // Act
    const edited = insertBeat(song, at(0, 0), 'before');

    // Assert: the dotted half starts on beat 4, its last two beats tied over the bar line
    expect(layout(edited, 0)).toEqual(['0:2.:r', '2880:4:1/0']);
    expect(layout(edited, 1)).toEqual(['0:2:1/0~', '1920:4:1/1', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('adds bars at the end of the song (every track, rests) rather than dropping anything', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[quarters(0, 1, 2, 3)]], [[[rest(1)]]]] }));

    // Act
    const edited = insertBeatWithFlow(song, at(0, 1), 'after');

    // Assert
    expect(edited.song.measureHeaders).toHaveLength(2);
    expect(layout(edited.song, 1)).toEqual(['0:4:1/3', '960:2.:r']);
    expect(layout(edited.song, 1, 0, 1)).toEqual(['0:1:r']);
    expect(edited.flow).toEqual({ direction: 'later', movedNotes: 1, lastMeasureIndex: 1, addedBars: 1 });
    assertEditInvariants(edited.song);
  });

  it('carries the rest a beat inserted after a full bar’s last beat into the next bar', () => {
    const song = bars(quarters(0, 1, 2, 3), [...quarters(4, 5), rest(2)]);
    const edited = insertBeatWithFlow(song, at(0, 3), 'after');
    expect(layout(edited.song, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:1/3']);
    expect(layout(edited.song, 1)).toEqual(['0:4:r', '960:4:1/4', '1920:4:1/5', '2880:4:r']);
    expect(edited.flow).toEqual({ direction: 'later', movedNotes: 0, lastMeasureIndex: 1, addedBars: 0 });
  });

  it('keeps an edit that only eats the rests at the end of its bar inside the bar', () => {
    const song = bars([...quarters(0, 1), rest(2)], quarters(4, 5, 6, 7));
    const edited = insertBeatWithFlow(song, at(0, 0), 'after');
    expect(layout(edited.song, 0)).toEqual(['0:4:1/0', '960:4:r', '1920:4:1/1', '2880:4:r']);
    expect(edited.song.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(edited.flow).toBeUndefined();
  });

  it('moves a longer note’s excess on as a tied note', () => {
    // Arrange
    const song = bars(quarters(0, 1, 2, 3), [rest(1)]);

    // Act
    const edited = setBeatDurationWithFlow(song, at(0, 3), dur(2));

    // Assert
    expect(layout(edited.song, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:1/3']);
    expect(layout(edited.song, 1)).toEqual(['0:4:1/3~', '960:2.:r']);
    expect(edited.flow).toEqual({ direction: 'later', movedNotes: 1, lastMeasureIndex: 1, addedBars: 0 });
    assertEditInvariants(edited.song);
  });

  it('pushes the next notes on when a note grows in a full bar', () => {
    const song = bars(quarters(0, 1, 2, 3), [rest(1)]);
    const edited = setBeatDuration(song, at(0, 0), dur(2));
    expect(layout(edited, 0)).toEqual(['0:2:1/0', '1920:4:1/1', '2880:4:1/2']);
    expect(layout(edited, 1)).toEqual(['0:4:1/3', '960:2.:r']);
  });

  it('lets a longer rest at the end of a full bar push into the next bar', () => {
    const song = bars([...quarters(0, 1, 2), rest(4)], quarters(4, 5, 6, 7), [rest(1)]);
    const edited = setBeatDuration(song, at(0, 3), dur(2));
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:r']);
    expect(layout(edited, 1)).toEqual(['0:4:r', '960:4:1/4', '1920:4:1/5', '2880:4:1/6']);
    expect(layout(edited, 2)).toEqual(['0:4:1/7', '960:2.:r']);
  });

  it('lays the music into each bar’s own length across a time signature change', () => {
    // Arrange: bar 2 is in 3/4
    const song = deepFreeze(
      buildSong({ timeSignatures: [{ numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }], tracks: [[[quarters(0, 1, 2, 3)], [quarters(4, 5, 6)]]] }),
    );

    // Act
    const edited = insertBeat(song, at(0, 0), 'after');

    // Assert
    expect(layout(edited, 1)).toEqual(['0:4:1/3', '960:4:1/4', '1920:4:1/5']);
    expect(edited.measureHeaders[2]?.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(layout(edited, 2)).toEqual(['0:4:1/6', '960:2:r']);
  });

  it('ripples one voice only: the other voice and the other tracks stay', () => {
    // Arrange
    const song = deepFreeze(
      buildSong({
        tracks: [
          [
            [quarters(0, 1, 2, 3), [play(2, n(4, 0)), play(2, n(4, 2))]],
            [[rest(1)], [play(1, n(4, 5))]],
          ],
          [[[play(1, n(2, 2))]], [[play(1, n(2, 3))]]],
        ],
      }),
    );

    // Act
    const edited = insertBeat(song, at(0, 0), 'after');

    // Assert
    expect(layout(edited, 0, 1)).toEqual(['0:2:4/0', '1920:2:4/2']);
    expect(layout(edited, 1, 1)).toEqual(['0:1:4/5']);
    expect(layout(edited, 1, 0)).toEqual(['0:4:1/3', '960:2.:r']);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    assertEditInvariants(edited);
  });

  it('ripples a second voice on its own', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[rest(1)], quarters(0, 1, 2, 3)], [[play(1, n(3, 9))], [rest(1)]]]] }));
    const edited = insertBeat(song, at(0, 0, 1), 'after');
    expect(layout(edited, 1, 1)).toEqual(['0:4:1/3', '960:2.:r']);
    expect(layout(edited, 1, 0)).toEqual(['0:1:3/9']);
    assertEditInvariants(edited);
  });

  it('takes a beat’s text along with its note into the next bar', () => {
    // Arrange
    const song = bars(quarters(0, 1, 2, 3), [rest(1)]);
    const track = song.tracks[0]!;
    const measure = track.measures[0]!;
    const beats = measure.beats.map((beat, index) => (index === 3 ? { ...beat, text: 'go' } : beat));
    const marked = deepFreeze({ ...song, tracks: [{ ...track, measures: [{ ...measure, beats }, track.measures[1]!] }] });

    // Act
    const edited = insertBeat(marked, at(0, 0), 'after');

    // Assert
    expect(edited.tracks[0]?.measures[1]?.beats[0]?.text).toBe('go');
    expect(edited.tracks[0]?.measures[0]?.beats.some((beat) => beat.text !== undefined)).toBe(false);
  });

  it('carries a tuplet group the bar line would cut whole into the next bar, rests filling what it leaves', () => {
    // Arrange: a dotted quarter pushes a triplet group across the bar line
    const triplet = dur(8, { tuplet: { enters: 3, times: 2 } });
    const song = bars([play(4, n(1, 0)), ...quarters(1, 2), play(triplet, n(1, 3)), play(triplet, n(1, 4)), play(triplet, n(1, 5))], [rest(1)]);

    // Act
    const edited = setBeatDurationWithFlow(song, at(0, 0), dur(4, { dotted: true }));

    // Assert
    expect(layout(edited.song, 0)).toEqual(['0:4.:1/0', '1440:4:1/1', '2400:4:1/2', '3360:8:r']);
    expect(layout(edited.song, 1)).toEqual(['0:8/3:2:1/3', '320:8/3:2:1/4', '640:8/3:2:1/5', '960:2.:r']);
    expect(edited.flow?.movedNotes).toBe(3);
    assertEditInvariants(edited.song);
  });

  it('leaves the bar too long, as before, when a tuplet group cannot be carried, and says where', () => {
    // Arrange: a 2/4 bar whose first beat becomes a half-note triplet: the group never closes inside the bar
    const song = deepFreeze(buildSong({ timeSignatures: [{ numerator: 2, denominator: 4 }, { numerator: 2, denominator: 4 }], tracks: [[[quarters(0, 1)], [[rest(2)]]]] }));

    // Act
    const edited = setBeatDurationWithFlow(song, at(0, 0), dur(2, { tuplet: { enters: 3, times: 2 } }));

    // Assert
    const header = edited.song.measureHeaders[0]!;
    expect(isMeasureOverfull(edited.song.tracks[0]!.measures[0]!, header)).toBe(true);
    expect(edited.song.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(edited.flow).toEqual({ direction: 'later', movedNotes: 0, lastMeasureIndex: 0, addedBars: 0, keptMeasureIndex: 0 });
  });

  it('keeps the lyrics on their notes: a tied piece a bar line makes gets a blank syllable', () => {
    // Arrange: every beat with notes takes a syllable, a tied one too
    const song = bars([play(dur(2, { dotted: true }), n(1, 0)), play(4, n(1, 1))], [...quarters(2, 3), rest(2)]);
    const sung = deepFreeze({ ...song, tracks: [{ ...song.tracks[0]!, lyrics: { from: 1, text: 'one two three four' } }] });

    // Act
    const edited = insertBeat(sung, at(0, 0), 'before');

    // Assert: the dotted half goes on tied into bar 2; its tied piece sings nothing, the others keep their syllables
    expect(layout(edited, 1)).toEqual(['0:2:1/0~', '1920:4:1/1', '2880:4:1/2']);
    expect(edited.tracks[0]?.lyrics).toEqual({ from: 1, text: 'one  two three four' });
  });

  it('leaves the lyrics alone when no note is cut, or the cut piece shares its beat with another voice', () => {
    const song = bars(quarters(0, 1, 2, 3), [rest(1)]);
    const sung = deepFreeze({ ...song, tracks: [{ ...song.tracks[0]!, lyrics: { from: 1, text: 'a b c d' } }] });
    expect(insertBeat(sung, at(0, 0), 'after').tracks[0]?.lyrics?.text).toBe('a b c d');
    const twoVoices = deepFreeze(buildSong({ tracks: [[[quarters(0, 1, 2, 3), [rest(1)]], [[rest(1)], [play(1, n(4, 5))]]]] }));
    const voiced = deepFreeze({ ...twoVoices, tracks: [{ ...twoVoices.tracks[0]!, lyrics: { from: 1, text: 'a b c d e' } }] });
    expect(setBeatDuration(voiced, at(0, 3), dur(2)).tracks[0]?.lyrics?.text).toBe('a b c d e');
  });

  it('keeps every note and every tie through a long ripple (no time is lost)', () => {
    const song = bars(quarters(0, 1, 2, 3), quarters(4, 5, 6, 7), quarters(8, 9, 10, 11));
    const edited = setBeatDuration(song, at(0, 0), dur(1));
    const frets = [0, 1, 2].flatMap((measureIndex) => layout(edited, measureIndex)).concat(layout(edited, 3));
    expect(frets).toEqual([
      '0:1:1/0',
      '0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:4:1/4',
      '0:4:1/5', '960:4:1/6', '1920:4:1/7', '2880:4:1/8',
      '0:4:1/9', '960:4:1/10', '1920:4:1/11', '2880:4:r',
    ]);
    expect(edited.measureHeaders).toHaveLength(4);
  });
});

describe('deleting a beat pulls the music after it back', () => {
  it('pulls the next bar’s first notes back, and that bar’s rest at the end grows', () => {
    // Arrange
    const song = bars([...quarters(0, 1), rest(4), play(4, n(1, 3))], [...quarters(4, 5, 6), rest(4)], quarters(8, 9, 10, 11));

    // Act
    const edited = deleteBeatWithFlow(song, at(0, 2));

    // Assert
    expect(layout(edited.song, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/3', '2880:4:1/4']);
    expect(layout(edited.song, 1)).toEqual(['0:4:1/5', '960:4:1/6', '1920:4:r', '2880:4:r']);
    expect(edited.song.tracks[0]?.measures[2]).toBe(song.tracks[0]?.measures[2]);
    expect(edited.flow).toEqual({ direction: 'earlier', movedNotes: 1, lastMeasureIndex: 1, addedBars: 0 });
    assertEditInvariants(edited.song);
  });

  it('pulls bar by bar until a bar ending in a rest takes the gap', () => {
    const song = bars(quarters(0, 1, 2, 3), quarters(4, 5, 6, 7), [...quarters(8, 9), rest(2)]);
    const edited = deleteBeat(song, at(0, 0));
    expect(layout(edited, 0)).toEqual(['0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:4:1/4']);
    expect(layout(edited, 1)).toEqual(['0:4:1/5', '960:4:1/6', '1920:4:1/7', '2880:4:1/8']);
    expect(layout(edited, 2)).toEqual(['0:4:1/9', '960:2:r', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('leaves the next bars alone when the bar ends in a rest that can grow (as before)', () => {
    const song = bars([...quarters(0, 1), rest(2)], quarters(4, 5, 6, 7));
    const edited = deleteBeatWithFlow(song, at(0, 0));
    expect(layout(edited.song, 0)).toEqual(['0:4:1/1', '960:2:r', '2880:4:r']);
    expect(edited.song.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(edited.flow).toBeUndefined();
  });

  it('pulls back a rest deleted at the end of a bar: the next bar’s first note takes its place', () => {
    const song = bars([...quarters(0, 1, 2), rest(4)], [...quarters(4, 5, 6), rest(4)]);
    const edited = deleteBeat(song, at(0, 3));
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:1/4']);
    expect(layout(edited, 1)).toEqual(['0:4:1/5', '960:4:1/6', '1920:4:r', '2880:4:r']);
  });

  it('cuts a note the gap ends inside into tied notes', () => {
    // Arrange: deleting a quarter pulls a half note back: its first quarter ends bar 1, its second starts bar 2
    const song = bars(quarters(0, 1, 2, 3), [play(2, n(1, 4)), play(4, n(1, 5)), rest(4)]);

    // Act
    const edited = deleteBeat(song, at(0, 0));

    // Assert
    expect(layout(edited, 0)).toEqual(['0:4:1/1', '960:4:1/2', '1920:4:1/3', '2880:4:1/4']);
    expect(layout(edited, 1)).toEqual(['0:4:1/4~', '960:4:1/5', '1920:4:r', '2880:4:r']);
    assertEditInvariants(edited);
  });

  it('stops at a bar of only rests: that bar keeps its rests and the gap is a rest', () => {
    const song = bars(quarters(0, 1, 2, 3), [rest(1)], quarters(8, 9, 10, 11));
    const edited = deleteBeat(song, at(0, 1));
    expect(layout(edited, 0)).toEqual(['0:4:1/0', '960:4:1/2', '1920:4:1/3', '2880:4:r']);
    expect(edited.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(edited.tracks[0]?.measures[2]).toBe(song.tracks[0]?.measures[2]);
  });

  it('pads the last bar of the song with a rest (the end of the track’s music)', () => {
    const song = bars(quarters(0, 1, 2, 3));
    expect(layout(deleteBeat(song, at(0, 1)), 0)).toEqual(['0:4:1/0', '960:4:1/2', '1920:4:1/3', '2880:4:r']);
  });

  it('stops before a tuplet group the gap would cut, leaving the gap as a rest', () => {
    const triplet = dur(8, { tuplet: { enters: 3, times: 2 } });
    const song = bars(quarters(0, 1, 2, 3), [play(8, n(1, 4)), play(triplet, n(1, 5)), play(triplet, n(1, 6)), play(triplet, n(1, 7)), rest(8), rest(2)]);
    const edited = deleteBeatWithFlow(song, at(0, 3));
    expect(layout(edited.song, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:r']);
    expect(edited.song.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(edited.flow).toEqual({ direction: 'earlier', movedNotes: 0, lastMeasureIndex: 0, addedBars: 0, keptMeasureIndex: 1 });
  });

  it('pulls one voice only: the other voice keeps its notes', () => {
    const song = deepFreeze(buildSong({ tracks: [[[quarters(0, 1, 2, 3), [play(1, n(4, 0))]], [[...quarters(4, 5, 6), rest(4)], [play(1, n(4, 2))]]]] }));
    const edited = deleteBeat(song, at(0, 0));
    expect(layout(edited, 0, 1)).toEqual(['0:1:4/0']);
    expect(layout(edited, 1, 1)).toEqual(['0:1:4/2']);
    expect(layout(edited, 1, 0)).toEqual(['0:4:1/5', '960:4:1/6', '1920:4:r', '2880:4:r']);
    assertEditInvariants(edited);
  });
});

describe('a note typed into an empty voice where the voice has no room', () => {
  it('moves the voice’s later notes on into the next bar', () => {
    // Arrange: voice 2 is empty under voice 1's half note on beat 2, and plays a half note on beat 3
    const song = deepFreeze(
      buildSong({ tracks: [[[[play(4, n(1, 0)), play(2, n(1, 1)), play(4, n(1, 2))], [rest(2), play(2, n(4, 0))]], [[rest(1)], [rest(1)]]]] }),
    );

    // Act: a fret typed on voice 2 at beat 2 lasts a half note, as the beat does
    const edited = setNoteFret(song, { ...at(0, 1, 1), string: 4 }, 5);

    // Assert
    expect(layout(edited, 0, 1)).toEqual(['0:4:r', '960:2:4/5', '2880:4:4/0']);
    expect(layout(edited, 1, 1)).toEqual(['0:4:4/0~', '960:2.:r']);
    expect(layout(edited, 0, 0)).toEqual(['0:4:1/0', '960:2:1/1', '2880:4:1/2']);
    assertEditInvariants(edited);
  });
});
