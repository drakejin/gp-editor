import { describe, expect, it } from 'vitest';
import { BEND_PRESETS } from '../src/edit/effects';
import { DEFAULT_VELOCITY } from '../src/formats/common/velocity';
import { EMPTY_NOTE_EFFECT, NORMAL_TUPLET, isMeasureOverfull } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { buildSongFromTranscription } from '../src/transcription/build-song';
import { toTuplet } from '../src/transcription/durations';
import type { TranscribedBeat, TranscribedEffect, TranscriptionPage } from '../src/transcription/types';
import { assertEditInvariants, deepFreeze, voiceLayout } from './helpers/edit-songs';
import { BASS, GUITAR, bar, page, play, rest, run, tab, written } from './helpers/transcription-pages';

function build(...pages: TranscriptionPage[]) {
  const result = buildSongFromTranscription(deepFreeze(pages));
  assertEditInvariants(result.song);
  return result;
}

function layout(song: Song, measureIndex = 0, voiceIndex = 0, trackIndex = 0): string[] {
  return voiceLayout(song, trackIndex, measureIndex, voiceIndex);
}

function notesAt(song: Song, measureIndex: number, beatIndex = 0, voiceIndex = 0): readonly Note[] {
  return song.tracks[0]?.measures[measureIndex]?.beats[beatIndex]?.voices[voiceIndex]?.notes ?? [];
}

function triplet(fret: number): TranscribedBeat {
  return { duration: 'eighth', tuplet: 3, notes: [tab(1, fret)] };
}

describe('buildSongFromTranscription: tab notes', () => {
  it('lays a 4/4 bar of eighths out from the measure start, in the first voice', () => {
    // Act
    const { song, warnings } = build(page([bar(run('eighth', 8))]));

    // Assert
    expect(layout(song)).toEqual(['0:8:1/0', '480:8:1/1', '960:8:1/2', '1440:8:1/3', '1920:8:1/4', '2400:8:1/5', '2880:8:1/6', '3360:8:1/7']);
    expect(layout(song, 0, 1)).toEqual([]);
    expect(song.tracks[0]?.measures[0]?.beats.every((beat) => beat.voices.length === 2)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('keeps a chord on one beat, notes in string order at the default velocity', () => {
    // Act
    const { song } = build(page([bar([play('whole', tab(5, 3), tab(4, 2), tab(3, 0), tab(2, 1), tab(1, 0))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:1/0,2/1,3/0,4/2,5/3']);
    expect(notesAt(song, 0).every((note) => note.velocity === DEFAULT_VELOCITY && !note.isTied && note.effect === EMPTY_NOTE_EFFECT)).toBe(true);
  });

  it('clamps a tab string to the strings the track has', () => {
    // Act
    const { song } = build(page([bar([play('whole', tab(6, 3))])], { tracks: [BASS] }));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/3']);
  });

  it('keeps one note per string and counts the others as left out', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', tab(2, 3), tab(2, 5))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:2/3']);
    expect(warnings).toEqual(['Bar 1: 1 note left out (no free string)']);
  });
});

describe('buildSongFromTranscription: written pitches', () => {
  it('places a written E4 (sounding E3) on string 4 fret 2: the string whose open pitch is the highest at or below it', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', written('E4'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/2']);
    expect(warnings).toEqual([]);
  });

  it('plays a written C major chord in the open position', () => {
    // Act
    const { song } = build(page([bar([play('whole', written('C4'), written('E4'), written('G4'), written('C5'), written('E5'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:1/0,2/1,3/0,4/2,5/3']);
  });

  it('gives the higher of two notes that want the same string that string, and the lower one the next string down', () => {
    // Act
    const { song } = build(page([bar([play('whole', written('E4'), written('F4'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/3,5/7']);
  });

  it('moves a note below the lowest string up an octave, onto the string that holds it lowest, and says so', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', written('C3'))]), bar([play('whole', written('C3'), written('D3'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:5/3']);
    expect(warnings).toEqual(['Bar 1: 1 note moved an octave to fit the tuning', 'Bar 2: 2 notes moved an octave to fit the tuning']);
  });

  it('moves a note above the neck down an octave', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', written('F#7'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:1/14']);
    expect(warnings).toEqual(['Bar 1: 1 note moved an octave to fit the tuning']);
  });

  it('leaves out the notes no string is free for', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', ...['E3', 'A3', 'D4', 'G4', 'B4', 'E5', 'G5'].map((pitch) => written(pitch)))])]));

    // Assert
    expect(notesAt(song, 0)).toHaveLength(6);
    expect(warnings).toEqual(['Bar 1: 1 note left out (no free string)']);
  });

  it('leaves out a note whose pitch cannot be read (pages that did not go through parseTranscriptionPage)', () => {
    // Act
    const { song, warnings } = build(page([bar([play('whole', written('H4'), written('E4'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/2']);
    expect(warnings).toEqual(['Bar 1: 1 note left out (unreadable pitch)']);
  });

  it('counts frets from the capo', () => {
    // Act
    const { song } = build(page([bar([play('whole', written('E4'))])], { tracks: [{ ...GUITAR, capo: 2 }] }));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/0']);
    expect(song.tracks[0]?.offset).toBe(2);
  });

  it('plays written bass notes an octave lower too', () => {
    // Act
    const { song } = build(page([bar([play('quarter', written('E2')), play('quarter', written('A2')), play('quarter', written('C3')), play('quarter', written('G3'))])], { tracks: [BASS] }));

    // Assert
    expect(layout(song)).toEqual(['0:4:4/0', '960:4:3/0', '1920:4:3/3', '2880:4:1/0']);
  });

  it('places written notes on the strings tab notes of the same beat leave free', () => {
    // Act
    const { song } = build(page([bar([play('whole', tab(4, 2), written('E4'))])]));

    // Assert
    expect(layout(song)).toEqual(['0:1:4/2,5/7']);
  });

  it('places the notes of both voices of a beat together', () => {
    // Arrange
    const measure = { parts: [{ track: 0, beats: [play('whole', tab(4, 2))] }, { track: 0, beats: [play('whole', written('E4'))] }] };

    // Act
    const { song } = build(page([measure]));

    // Assert
    expect(layout(song, 0, 0)).toEqual(['0:1:4/2']);
    expect(layout(song, 0, 1)).toEqual(['0:1:5/7']);
  });
});

describe('buildSongFromTranscription: durations and voices', () => {
  it.each([
    [2, { enters: 2, times: 3 }],
    [3, { enters: 3, times: 2 }],
    [4, { enters: 4, times: 3 }],
    [5, { enters: 5, times: 4 }],
    [6, { enters: 6, times: 4 }],
    [7, { enters: 7, times: 4 }],
    [8, { enters: 8, times: 6 }],
    [9, { enters: 9, times: 8 }],
    [10, { enters: 10, times: 8 }],
    [11, { enters: 11, times: 8 }],
    [12, { enters: 12, times: 8 }],
  ])('plays tuplet %i as %o', (size, tuplet) => {
    // Act / Assert
    expect(toTuplet(size)).toEqual(tuplet);
  });

  it.each([undefined, 0, 1, 13])('plays tuplet %j as plain notes', (size) => {
    // Act / Assert
    expect(toTuplet(size)).toBe(NORMAL_TUPLET);
  });

  it('lays out triplets and dotted notes', () => {
    // Act
    const { song } = build(page([bar([triplet(0), triplet(1), triplet(2), { duration: 'quarter', dots: 1, notes: [tab(1, 3)] }, play('eighth', tab(1, 4)), play('quarter', tab(1, 5))])]));

    // Assert
    expect(layout(song)).toEqual(['0:8/3:2:1/0', '320:8/3:2:1/1', '640:8/3:2:1/2', '960:4.:1/3', '2400:8:1/4', '2880:4:1/5']);
  });

  it('lays out a double-dotted note', () => {
    // Act
    const { song } = build(page([bar([{ duration: 'half', dots: 2, notes: [tab(1, 0)] }, play('eighth', tab(1, 1))])]));

    // Assert
    expect(layout(song)).toEqual(['0:2..:1/0', '3360:8:1/1']);
  });

  it('pads a short part with rests to the end of the bar', () => {
    // Act
    const { song, warnings } = build(page([bar([play('quarter', tab(1, 0))])]));

    // Assert
    expect(layout(song)).toEqual(['0:4:1/0', '960:2.:r']);
    expect(warnings).toEqual([]);
  });

  it('pads with tuplet rests when plain ones cannot fill the time left', () => {
    // Act
    const { song } = build(page([bar([triplet(0), triplet(1)])]));

    // Assert
    expect(layout(song)).toEqual(['0:8/3:2:1/0', '320:8/3:2:1/1', '640:2.:r', '3520:8/3:2:r']);
  });

  it('leaves a voice short when no rests can write the time left (a lone septuplet note)', () => {
    // Act
    const { song } = build(page([bar([{ duration: '16th', tuplet: 7, notes: [tab(1, 0)] }])]));

    // Assert
    expect(layout(song)).toEqual(['0:16/7:4:1/0']);
  });

  it('keeps a part that runs past the end of its bar, and says so', () => {
    // Act
    const { song, warnings } = build(page([bar(run('quarter', 5)), bar(run('quarter', 4))]));

    // Assert
    expect(layout(song)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:1/3', '3840:4:1/4']);
    expect(isMeasureOverfull(song.tracks[0]!.measures[0]!, song.measureHeaders[0]!)).toBe(true);
    expect(song.measureHeaders[1]?.start).toBe(960 + 3840);
    expect(warnings).toEqual(['Bar 1: the beats run past the end of the bar']);
  });

  it('reads a beat without notes as a rest', () => {
    // Act
    const { song } = build(page([bar([play('half'), rest('half')])]));

    // Assert
    expect(layout(song)).toEqual(['0:2:r', '1920:2:r']);
  });

  it('fills the bar of a track without a part, or with an empty part, with rests', () => {
    // Arrange
    const threeFour = { timeSignature: { numerator: 3, denominator: 4 } };
    const measures = [bar([play('half', tab(1, 0)), play('quarter', tab(1, 0))], threeFour), { parts: [{ track: 0, beats: [] }] }];

    // Act
    const { song } = build(page(measures, { tracks: [GUITAR, BASS] }));

    // Assert
    expect(layout(song, 0, 0, 1)).toEqual(['0:2.:r']);
    expect(layout(song, 1, 0, 0)).toEqual(['0:2.:r']);
  });

  it('plays a second part for the same track as its second voice', () => {
    // Arrange
    const measure = { parts: [{ track: 0, beats: run('half', 2) }, { track: 0, beats: [play('whole', tab(6, 0))] }] };

    // Act
    const { song, warnings } = build(page([measure]));

    // Assert
    expect(layout(song, 0, 0)).toEqual(['0:2:1/0', '1920:2:1/1']);
    expect(layout(song, 0, 1)).toEqual(['0:1:6/0']);
    expect(warnings).toEqual([]);
  });

  it('leaves out a third part for one track, and says so', () => {
    // Arrange
    const parts = [6, 5, 4].map((string) => ({ track: 0, beats: [play('whole', tab(string, 0))] }));

    // Act
    const { song, warnings } = build(page([{ parts }]));

    // Assert
    expect(layout(song, 0, 0)).toEqual(['0:1:6/0']);
    expect(layout(song, 0, 1)).toEqual(['0:1:5/0']);
    expect(warnings).toEqual(['Bar 1: 1 part left out (a track holds two voices)']);
  });
});

describe('buildSongFromTranscription: ties', () => {
  it('ties a tab note across the bar line', () => {
    // Act
    const { song } = build(page([bar([play('half', tab(3, 5)), play('half', tab(3, 5))]), bar([play('whole', tab(3, 5, { tied: true }))])]));

    // Assert
    expect(notesAt(song, 1)).toEqual([expect.objectContaining({ string: 3, fret: 5, isTied: true })]);
  });

  it('unties a note with nothing on its string before it', () => {
    // Act
    const { song } = build(page([bar([play('half', tab(3, 5, { tied: true })), rest('quarter'), play('quarter', tab(3, 5, { tied: true }))])]));

    // Assert
    expect(notesAt(song, 0, 0)[0]?.isTied).toBe(false);
    expect(notesAt(song, 0, 2)[0]?.isTied).toBe(false);
  });

  it('unties a tab note whose string had another fret before it (a slur, not a tie), keeping its fret', () => {
    // Act
    const { song } = build(page([bar([play('half', tab(3, 5)), play('half', tab(3, 7, { tied: true }))])]));

    // Assert
    expect(notesAt(song, 0, 1)).toEqual([expect.objectContaining({ string: 3, fret: 7, isTied: false })]);
  });

  it('keeps a tied written note on the string and fret of the note it continues', () => {
    // Act
    const { song } = build(page([bar([play('whole', written('E4'), written('F4'))]), bar([play('whole', written('E4', { tied: true }))])]));

    // Assert
    expect(layout(song, 1)).toEqual(['0:1:5/7']);
    expect(notesAt(song, 1)[0]?.isTied).toBe(true);
  });

  it('places a tied written note afresh, untied, when the note before has another pitch', () => {
    // Act
    const { song } = build(page([bar([play('half', written('G4')), play('half', written('E4', { tied: true }))])]));

    // Assert
    expect(layout(song)).toEqual(['0:2:3/0', '1920:2:4/2']);
    expect(notesAt(song, 0, 1)[0]?.isTied).toBe(false);
  });

  it('ties a note to the previous event of its own voice only', () => {
    // Arrange
    const measure = { parts: [{ track: 0, beats: [play('whole', tab(2, 1))] }, { track: 0, beats: [play('half', tab(4, 2)), play('half', tab(2, 1, { tied: true }))] }] };

    // Act
    const { song } = build(page([measure]));

    // Assert
    expect(song.tracks[0]?.measures[0]?.beats[1]?.voices[1]?.notes[0]?.isTied).toBe(false);
  });
});

describe('buildSongFromTranscription: effects', () => {
  it('maps every effect onto the note', () => {
    // Arrange
    const effects: TranscribedEffect[] = ['hammer', 'slide', 'bend', 'vibrato', 'palmMute', 'letRing', 'ghostNote', 'accent', 'harmonic'];

    // Act
    const { song } = build(page([bar([play('whole', tab(2, 12, { effects }))])]));

    // Assert
    expect(notesAt(song, 0)[0]?.effect).toEqual({
      ...EMPTY_NOTE_EFFECT,
      hammer: true,
      slides: ['shift'],
      bend: BEND_PRESETS.half,
      vibrato: true,
      palmMute: true,
      letRing: true,
      ghostNote: true,
      accentuatedNote: true,
      harmonic: { type: 'natural', data: 0 },
    });
  });

  it('marks a dead note, which is never tied', () => {
    // Act
    const { song } = build(page([bar([play('half', tab(2, 5)), play('half', tab(2, 5, { tied: true, effects: ['deadNote'] }))])]));

    // Assert
    expect(notesAt(song, 0, 1)[0]).toEqual(expect.objectContaining({ isTied: false, effect: { ...EMPTY_NOTE_EFFECT, deadNote: true } }));
  });
});
