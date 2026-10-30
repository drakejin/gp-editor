import { describe, expect, it } from 'vitest';
import { applyComposedBars } from '../src/composition/apply-bars';
import type { ComposedBars } from '../src/composition/compose-types';
import { setTrackLyrics } from '../src/edit/lyrics';
import { addTrack } from '../src/edit/tracks';
import { GM_DRUM_KEYS } from '../src/formats/common/channels';
import { durationTicks, measureTicks } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import type { TranscribedBeat, TranscribedMeasure, TranscribedPart } from '../src/transcription/types';
import { assertEditInvariants, buildSong, deepFreeze, n, play, voiceLayout } from './helpers/edit-songs';
import { DRUMS, PIANO_LEFT, drum, play as beat, rest, tab, written } from './helpers/transcription-pages';

/** Two guitar tracks of four bars, each bar a whole note: track 1 on string 1, track 2 on string 2, fret = bar number. */
function twoTracks(): Song {
  const bars = (string: number) => [1, 2, 3, 4].map((fret) => [[play(1, n(string, fret))]]);
  return deepFreeze(buildSong({ tracks: [bars(1), bars(2)] }));
}

const part = (track: number, ...beats: TranscribedBeat[]): TranscribedPart => ({ track, beats });
const composedOf = (bars: readonly TranscribedMeasure[], extra: Partial<ComposedBars> = {}): ComposedBars => ({ bars, newTracks: [], warnings: [], ...extra });

/** Ticks a voice of a measure plays, rests included. */
function voiceTicks(song: Song, trackIndex: number, measureIndex: number, voiceIndex = 0): number {
  return (song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? []).reduce((ticks, item) => {
    const voice = item.voices[voiceIndex];
    return voice === undefined || voice.isEmpty ? ticks : ticks + durationTicks(voice.duration);
  }, 0);
}

describe('applyComposedBars', () => {
  it('writes the bars into the written track from the start bar, replacing them, and leaves everything else as it was', () => {
    // Arrange
    const song = twoTracks();
    const composed = composedOf([{ parts: [part(0, beat('whole', tab(1, 9)))] }, { parts: [part(0, beat('whole', tab(1, 10)))] }]);

    // Act
    const outcome = applyComposedBars(song, composed, 1);

    // Assert
    assertEditInvariants(outcome.song);
    expect([0, 1, 2, 3].map((index) => voiceLayout(outcome.song, 0, index, 0))).toEqual([['0:1:1/1'], ['0:1:1/9'], ['0:1:1/10'], ['0:1:1/4']]);
    expect(outcome.song.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
    expect(outcome.song.tracks[0]?.measures[3]).toBe(song.tracks[0]?.measures[3]);
    expect(outcome.song.tracks[1]).toBe(song.tracks[1]);
    expect(outcome.song.measureHeaders).toBe(song.measureHeaders);
    expect(outcome).toMatchObject({ barsWritten: 2, barsAdded: 0, tracksAdded: 0, notes: 2, writtenTracks: [0], warnings: [] });
  });

  it('rewrites a written track over every bar written: a bar without a part for it is a bar of rests', () => {
    // Arrange
    const song = twoTracks();
    const composed = composedOf([{ parts: [part(1, beat('whole', tab(2, 7)))] }, { parts: [] }]);

    // Act
    const outcome = applyComposedBars(song, composed, 0);

    // Assert
    expect(voiceLayout(outcome.song, 1, 0, 0)).toEqual(['0:1:2/7']);
    expect(voiceLayout(outcome.song, 1, 1, 0)).toEqual(['0:1:r']);
    expect(outcome.song.tracks[0]).toBe(song.tracks[0]);
    expect(outcome.writtenTracks).toEqual([1]);
  });

  it('fills a part that ends early with rests to the bar line, as the PDF import does', () => {
    // Act
    const outcome = applyComposedBars(twoTracks(), composedOf([{ parts: [part(0, beat('quarter', tab(1, 3)), beat('eighth', tab(1, 5)))] }]), 2);

    // Assert
    const layout = voiceLayout(outcome.song, 0, 2, 0);
    expect(layout.slice(0, 2)).toEqual(['0:4:1/3', '960:8:1/5']);
    expect(layout.slice(2).every((event) => event.endsWith(':r'))).toBe(true);
    expect(voiceTicks(outcome.song, 0, 2)).toBe(measureTicks(4, 4));
  });

  it('adds the bars that run past the song’s end to every track, in the last bar’s meter unless a bar sets one', () => {
    // Arrange
    const song = twoTracks();
    const bars: TranscribedMeasure[] = [
      { parts: [part(0, beat('whole', tab(1, 12)))] },
      { timeSignature: { numerator: 3, denominator: 4 }, tempo: 90, keySignature: -2, parts: [part(0, { duration: 'half', dots: 1, notes: [tab(1, 5)] })] },
      { parts: [] },
    ];

    // Act
    const outcome = applyComposedBars(song, composedOf(bars), 3);

    // Assert
    assertEditInvariants(outcome.song);
    const headers = outcome.song.measureHeaders;
    expect(headers).toHaveLength(6);
    expect(headers.map((header) => `${header.number} ${header.timeSignature.numerator}/${header.timeSignature.denominator} ${header.tempo}`)).toEqual([
      '1 4/4 120',
      '2 4/4 120',
      '3 4/4 120',
      '4 4/4 120',
      '5 3/4 90',
      '6 3/4 90',
    ]);
    expect(headers[4]?.start).toBe((headers[3]?.start ?? 0) + measureTicks(4, 4));
    expect(voiceLayout(outcome.song, 1, 4, 0)).toEqual(['0:2.:r']);
    expect(outcome.song.tracks.map((track) => track.measures[5]?.keySignature)).toEqual([-2, -2]);
    expect(outcome).toMatchObject({ barsWritten: 3, barsAdded: 2 });
  });

  it('starts after the last bar when the start is past the end', () => {
    // Act
    const outcome = applyComposedBars(twoTracks(), composedOf([{ parts: [part(0, beat('whole', tab(1, 1)))] }]), 99);

    // Assert
    expect(outcome.song.measureHeaders).toHaveLength(5);
    expect(voiceLayout(outcome.song, 0, 4, 0)).toEqual(['0:1:1/1']);
    expect(outcome.barsAdded).toBe(1);
  });

  it('keeps an existing bar’s meter, tempo and key, saying so when the answer set others', () => {
    // Act
    const outcome = applyComposedBars(twoTracks(), composedOf([{ timeSignature: { numerator: 3, denominator: 4 }, tempo: 140, parts: [part(0, beat('whole', tab(1, 1)))] }]), 1);

    // Assert
    expect(outcome.song.measureHeaders[1]).toMatchObject({ timeSignature: { numerator: 4, denominator: 4 }, tempo: 120 });
    expect(outcome.warnings).toEqual(['Bar 2: kept its meter, tempo and key (only added bars take new ones)']);
  });

  it('adds new tracks after the last one, resting where they do not play, and writes their parts', () => {
    // Arrange
    const song = twoTracks();
    const groove = part(2, beat('quarter', drum('Bass Drum 1'), drum('Closed Hi-Hat')), beat('quarter', drum('Acoustic Snare')), rest('half'));

    // Act
    const outcome = applyComposedBars(song, composedOf([{ parts: [groove] }], { newTracks: [DRUMS] }), 2);

    // Assert
    assertEditInvariants(outcome.song);
    const drums = outcome.song.tracks[2];
    expect(drums).toMatchObject({ name: 'Drums', isPercussion: true });
    expect(outcome.song.channels.find((channel) => channel.id === drums?.channelId)?.isPercussion).toBe(true);
    expect(voiceLayout(outcome.song, 2, 0, 0)).toEqual(['0:1:r']);
    expect(drums?.measures[2]?.beats[0]?.voices[0]?.notes.map((note) => note.fret).sort()).toEqual([GM_DRUM_KEYS.closedHiHat, GM_DRUM_KEYS.bassDrum].sort());
    expect(outcome).toMatchObject({ tracksAdded: 1, writtenTracks: [2], notes: 3 });
    expect(outcome.song.tracks[0]).toBe(song.tracks[0]);
  });

  it('writes a new keyboard part by its sounding pitches, on strings that hold them, in its clef', () => {
    // Act
    const outcome = applyComposedBars(twoTracks(), composedOf([{ parts: [part(2, beat('whole', written('C2'), written('G2')))] }], { newTracks: [PIANO_LEFT] }), 0);

    // Assert
    const left = outcome.song.tracks[2];
    const notes = left?.measures[0]?.beats[0]?.voices[0]?.notes ?? [];
    const pitches = notes.map((note) => (left?.strings[note.string - 1]?.tuning ?? 0) + note.fret).sort((a, b) => a - b);
    expect(pitches).toEqual([36, 43]);
    expect(left?.measures.map((measure) => measure.clef)).toEqual(['bass', 'bass', 'bass', 'bass']);
    expect(outcome.song.channels.find((channel) => channel.id === left?.channelId)?.program).toBe(0);
  });

  it('writes an existing drum track by drum names, and an existing guitar’s written pitches an octave above their sound', () => {
    // Arrange
    const withDrums = deepFreeze(addTrack(twoTracks(), { kind: 'drums' }));
    const bars = [{ parts: [part(2, beat('whole', drum('Crash Cymbal 1'))), part(0, beat('whole', written('E3')))] }];

    // Act
    const outcome = applyComposedBars(withDrums, composedOf(bars), 0);

    // Assert
    expect(outcome.song.tracks[2]?.measures[0]?.beats[0]?.voices[0]?.notes.map((note) => note.fret)).toEqual([GM_DRUM_KEYS.crash1]);
    expect(voiceLayout(outcome.song, 0, 0, 0)).toEqual(['0:1:6/0']);
  });

  it('unties a note after the written bars whose tie now has nothing to continue', () => {
    // Arrange
    const song = twoTracks();
    const tied = deepFreeze({
      ...song,
      tracks: song.tracks.map((track, index) =>
        index === 0 ? { ...track, measures: track.measures.map((measure, measureIndex) => (measureIndex === 2 ? tieFirstNote(measure) : measure)) } : track,
      ),
    });

    // Act
    const outcome = applyComposedBars(tied, composedOf([{ parts: [part(0, beat('whole', tab(3, 5)))] }]), 1);

    // Assert
    expect(outcome.song.tracks[0]?.measures[2]?.beats[0]?.voices[0]?.notes[0]?.isTied).toBe(false);
  });

  it('passes on the answer’s warnings, then what could not be placed, and says when a written track has lyrics', () => {
    // Arrange
    const song = deepFreeze(setTrackLyrics(twoTracks(), 0, { from: 1, text: 'la la la la' }));
    const crowded = beat('whole', tab(1, 1), tab(1, 2));

    // Act
    const outcome = applyComposedBars(song, composedOf([{ parts: [part(0, crowded)] }], { warnings: ['a calm answer'] }), 0);

    // Assert
    expect(outcome.warnings).toEqual([
      'a calm answer',
      'Bar 1, Track 1: 1 note left out (no free string)',
      'Track 1: its lyrics stay as they were; they follow its notes, so syllables from bar 1 on may sit on other notes',
    ]);
    expect(outcome.notes).toBe(1);
  });

  it('adds a new fretted track on the tuning and capo it names, standard tuning with a warning when it cannot read one', () => {
    // Arrange
    const dropBass = { name: 'Drop bass', instrument: 'bass' as const, tuning: ['D1', 'A1', 'D2', 'G2'], capo: 1 };
    const oddGuitar = { name: 'Odd guitar', instrument: 'guitar' as const, tuning: ['H2', 'A2'], capo: 0 };

    // Act
    const outcome = applyComposedBars(twoTracks(), composedOf([{ parts: [part(2, beat('whole', tab(4, 0)))] }], { newTracks: [dropBass, oddGuitar] }), 0);

    // Assert
    const [bass, guitar] = outcome.song.tracks.slice(2);
    expect(bass?.strings.map((string) => string.tuning)).toEqual([43, 38, 33, 26]);
    expect(bass?.offset).toBe(1);
    expect(guitar?.strings.map((string) => string.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(outcome.warnings).toEqual(['Odd guitar: tuning H2 A2 could not be read; standard tuning used']);
    expect(outcome.tracksAdded).toBe(2);
  });

  it('stops adding tracks at one that cannot be added, saying so, and writes no part for it', () => {
    // Arrange
    const empty: Song = { ...twoTracks(), tracks: [] };

    // Act
    const outcome = applyComposedBars(empty, composedOf([{ parts: [part(0, beat('whole', drum('Acoustic Snare')))] }], { newTracks: [DRUMS, DRUMS] }), 0);

    // Assert
    expect(outcome.song.tracks).toEqual([]);
    expect(outcome).toMatchObject({ tracksAdded: 0, writtenTracks: [], notes: 0 });
    expect(outcome.warnings).toEqual(['New track "Drums" could not be added: it and the tracks after it were left out']);
  });

  it('changes nothing when the answer has no bars', () => {
    const song = twoTracks();
    expect(applyComposedBars(song, composedOf([], { newTracks: [DRUMS] }), 0)).toMatchObject({ song, barsWritten: 0, barsAdded: 0, tracksAdded: 0, notes: 0, writtenTracks: [] });
  });
});


/** The measure with its first note tied to the note before it. */
function tieFirstNote(measure: Song['tracks'][number]['measures'][number]): Song['tracks'][number]['measures'][number] {
  return {
    ...measure,
    beats: measure.beats.map((item, beatIndex) =>
      beatIndex === 0 ? { ...item, voices: item.voices.map((voice, voiceIndex) => (voiceIndex === 0 ? { ...voice, notes: voice.notes.map((note) => ({ ...note, fret: 2, isTied: true })) } : voice)) } : item,
    ),
  };
}
