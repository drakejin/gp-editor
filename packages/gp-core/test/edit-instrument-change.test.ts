import { describe, expect, it } from 'vitest';
import { planInstrumentChange, programTrackKind, setTrackInstrument } from '../src/edit/instrument-change';
import { trackIconId } from '../src/edit/track-properties';
import { resolveInstrument } from '../src/edit/tuning-presets';
import { TRACK_ICON_IDS } from '../src/formats/common/track-icons';
import { DEFAULT_PERCUSSION_BANK, STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import type { Chord, Song } from '../src/model/song';
import { assertEditInvariants, buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';
import { beatPitches, songOnStrings } from './helpers/tuning-songs';

const DROP_D = [64, 59, 55, 50, 45, 38];
const UKULELE = [69, 64, 60, 67];

/**
 * A 6-string steel guitar (program 25) playing low E (string 6 open), high E (string 1 open), a B4 the bass's 24 frets
 * cannot reach (string 1, fret 7) and a six-string E chord, then a bar of rests.
 */
function guitarSong(tuning: readonly number[] = STANDARD_TUNING, program = 25): Song {
  const chord = [n(1, 0), n(2, 0), n(3, 1), n(4, 2), n(5, 2), n(6, 0)];
  return deepFreeze(songOnStrings(tuning, [[[play(4, n(6, 0)), play(4, n(1, 0)), play(4, n(1, 7)), play(4, ...chord)]], [[rest(1)]]], { program }));
}

const channelOf = (song: Song, trackIndex = 0) => song.channels.find((channel) => channel.id === song.tracks[trackIndex]?.channelId);
const noteCount = (song: Song, trackIndex = 0) => song.tracks[trackIndex]!.measures.flatMap((measure) => measure.beats.flatMap((beat) => beat.voices.flatMap((voice) => voice.notes))).length;

describe('programTrackKind', () => {
  it('reads the kind of track a General MIDI program is played on', () => {
    expect([33, 25, 30, 105, 0, 19, 40, 52].map(programTrackKind)).toEqual(['bass', 'guitar', 'guitar', 'banjo', 'keys', 'keys', 'other', 'other']);
    expect(programTrackKind('drums')).toBe('drums');
  });
});

describe('planInstrumentChange', () => {
  it('makes a guitar track a 4-string bass (E1 A1 D2 G2, bass clef) for a bass program', () => {
    expect(planInstrumentChange(guitarSong(), 0, 33)).toEqual({ from: 'guitar', to: 'bass', tuning: STANDARD_BASS_TUNING, clef: 'bass', notesLost: 0 });
  });

  it('keeps the strings of the same kind of instrument: another guitar, another bass, a guitar sound for a ukulele', () => {
    expect(planInstrumentChange(guitarSong(DROP_D), 0, 30)).toEqual({ from: 'guitar', to: 'guitar', notesLost: 0 });
    const fiveStringBass = songOnStrings([43, 38, 33, 28, 23], [[[rest(1)]]], { program: 33 });
    expect(planInstrumentChange(fiveStringBass, 0, 34)).toEqual({ from: 'bass', to: 'bass', notesLost: 0 });
    const ukulele = songOnStrings(UKULELE, [[[rest(1)]]], { program: 24 });
    expect(planInstrumentChange(ukulele, 0, 25)).toEqual({ from: 'ukulele', to: 'ukulele', notesLost: 0 });
  });

  it('keeps a track’s strings for keys and other instruments, whose strings only hold the notes', () => {
    expect(planInstrumentChange(guitarSong(), 0, 0)).toEqual({ from: 'guitar', to: 'keys', notesLost: 0 });
    expect(planInstrumentChange(guitarSong(), 0, 40)).toEqual({ from: 'guitar', to: 'other', notesLost: 0 });
  });

  it('counts the notes a change between drums and a pitched instrument cannot keep', () => {
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36), n(2, 42)), play(4, n(1, 38))]]], { isPercussion: true });
    expect(planInstrumentChange(guitarSong(), 0, 'drums')).toEqual({ from: 'guitar', to: 'drums', tuning: [0, 0, 0, 0, 0, 0], clef: 'neutral', notesLost: 9 });
    expect(planInstrumentChange(drums, 0, 0)).toEqual({ from: 'drums', to: 'keys', tuning: STANDARD_TUNING, clef: 'treble', notesLost: 3 });
  });

  it('plans nothing for a track without a channel, which no instrument can sound on', () => {
    const song = guitarSong();
    const unplayed: Song = { ...song, channels: [] };
    expect(planInstrumentChange(unplayed, 0, 33)).toBeUndefined();
    expect(setTrackInstrument(unplayed, 0, 33).song).toBe(unplayed);
    expect(setTrackInstrument(unplayed, 0, 'drums').song).toBe(unplayed);
  });

  it('plans nothing for a track the song does not have or a program outside 0–127', () => {
    expect(planInstrumentChange(guitarSong(), 3, 33)).toBeUndefined();
    expect(planInstrumentChange(guitarSong(), 0, 128)).toBeUndefined();
    expect(planInstrumentChange(guitarSong(), 0, 2.5)).toBeUndefined();
  });
});

describe('setTrackInstrument: another pitched instrument', () => {
  it('makes a 6-string guitar track a 4-string bass that keeps every pitch it can, counting the rest', () => {
    // Act
    const change = setTrackInstrument(guitarSong(), 0, 33);

    // Assert
    const track = change.song.tracks[0]!;
    expect(track.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_BASS_TUNING);
    expect(channelOf(change.song)?.program).toBe(33);
    expect(track.measures.map((measure) => measure.clef)).toEqual(['bass', 'bass']);
    expect(resolveInstrument(change.song, track)).toBe('bass');
    expect(beatPitches(change.song).slice(0, 2)).toEqual(['0:0:40', '0:1:64']);
    expect(change.octaveShifted).toBe(1);
    expect(change.removed).toBe(2);
    expect(change.notesRemoved).toBe(0);
    assertEditInvariants(change.song);
  });

  it('shows the new instrument’s icon, leaving the icon the track had for the old one', () => {
    // Arrange
    const song = guitarSong();
    const withIcon: Song = { ...song, tracks: [{ ...song.tracks[0]!, iconId: TRACK_ICON_IDS.electricGuitar }] };

    // Act
    const change = setTrackInstrument(withIcon, 0, 33);

    // Assert
    expect(change.song.tracks[0]?.iconId).toBeUndefined();
    expect(trackIconId(change.song, 0)).toBe(TRACK_ICON_IDS.bass);
  });

  it('keeps the user’s own tuning, clef and icon for an instrument of the same kind: only the sound changes', () => {
    // Arrange
    const song = guitarSong(DROP_D);
    const withIcon: Song = { ...song, tracks: [{ ...song.tracks[0]!, iconId: TRACK_ICON_IDS.electricGuitar }] };

    // Act
    const change = setTrackInstrument(withIcon, 0, 30);

    // Assert
    expect(change.song.tracks[0]).toBe(withIcon.tracks[0]);
    expect(channelOf(change.song)?.program).toBe(30);
  });

  it('changes only the sound when asked to keep the track as it is', () => {
    const change = setTrackInstrument(guitarSong(), 0, 33, { keepsTrack: true });
    expect(change.song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_TUNING);
    expect(channelOf(change.song)?.program).toBe(33);
  });

  it('makes a bass a 6-string guitar on the treble clef for a guitar program', () => {
    const bass = deepFreeze(songOnStrings(STANDARD_BASS_TUNING, [[[play(1, n(4, 0))]]], { program: 33 }));
    const change = setTrackInstrument(bass, 0, 25);
    expect(change.song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_TUNING);
    expect(change.song.tracks[0]?.measures[0]?.clef).toBe('treble');
    expect(change.octaveShifted).toBe(1);
  });
});

describe('setTrackInstrument: drums', () => {
  it('makes a pitched track a drum track on the drum channel, its notes taken out and the rhythm left as rests', () => {
    // Arrange
    const song = guitarSong();
    const chord: Chord = { name: 'E', firstFret: 1, frets: [0, 0, 1, 2, 2, 0] };
    const chorded: Song = { ...song, tracks: [{ ...song.tracks[0]!, offset: 2, measures: song.tracks[0]!.measures.map((measure, index) => (index === 0 ? { ...measure, beats: measure.beats.map((beat) => ({ ...beat, chord })) } : measure)) }] };

    // Act
    const change = setTrackInstrument(chorded, 0, 'drums');

    // Assert
    const track = change.song.tracks[0]!;
    expect(track).toMatchObject({ isPercussion: true, offset: 0 });
    expect(track.strings.map((guitarString) => guitarString.tuning)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(channelOf(change.song)).toMatchObject({ isPercussion: true, bank: DEFAULT_PERCUSSION_BANK, program: 0 });
    expect(track.measures.map((measure) => measure.clef)).toEqual(['neutral', 'neutral']);
    expect(noteCount(change.song)).toBe(0);
    expect(track.measures[0]?.beats).toHaveLength(4);
    expect(track.measures[0]?.beats.some((beat) => beat.chord !== undefined)).toBe(false);
    expect(change.notesRemoved).toBe(9);
    expect(trackIconId(change.song, 0)).toBe(TRACK_ICON_IDS.drums);
    assertEditInvariants(change.song);
  });

  it('makes a drum track a pitched one: the instrument’s strings, clef and channel, the drum notes taken out', () => {
    // Arrange
    const drums = deepFreeze(songOnStrings([0, 0, 0, 0, 0, 0], [[[play(4, n(1, 36), n(2, 42)), play(4, n(1, 38)), rest(2)]]], { isPercussion: true, program: 0 }));
    const kit = { ...drums, channels: drums.channels.map((channel) => ({ ...channel, isPercussion: true, bank: DEFAULT_PERCUSSION_BANK })) };

    // Act
    const change = setTrackInstrument(kit, 0, 33);

    // Assert
    const track = change.song.tracks[0]!;
    expect(track.isPercussion).toBe(false);
    expect(track.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_BASS_TUNING);
    expect(channelOf(change.song)).toMatchObject({ isPercussion: false, bank: 0, program: 33 });
    expect(track.measures[0]?.clef).toBe('bass');
    expect(change.notesRemoved).toBe(3);
    expect(noteCount(change.song)).toBe(0);
  });

  it('gives the track a channel of its own when another track shares its channel, which keeps its sound', () => {
    // Arrange: buildSong puts both tracks on channel 0.
    const song = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 3))]]], [[[play(1, n(2, 5))]]]] }));

    // Act
    const change = setTrackInstrument(song, 1, 'drums');

    // Assert
    expect(channelOf(change.song, 0)).toEqual(song.channels[0]);
    expect(channelOf(change.song, 1)).toMatchObject({ isPercussion: true, bank: DEFAULT_PERCUSSION_BANK });
    expect(change.song.tracks[1]?.channelId).not.toBe(song.tracks[0]?.channelId);
  });

  it('returns the same song for the drum kit on a drum track, a track it lacks or a program outside 0–127', () => {
    const drums = songOnStrings([0, 0, 0, 0, 0, 0], [[[rest(1)]]], { isPercussion: true });
    expect(setTrackInstrument(drums, 0, 'drums').song).toBe(drums);
    const song = guitarSong();
    expect(setTrackInstrument(song, 4, 33).song).toBe(song);
    expect(setTrackInstrument(song, 0, -1).song).toBe(song);
  });
});
