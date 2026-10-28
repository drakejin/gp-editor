import { describe, expect, it } from 'vitest';
import { DEFAULT_PERCUSSION_BANK, STANDARD_TUNING, TRACK_ICON_IDS, type Song, type TranscriptionPage, readSong, trackIconId, writeSong, writtenTransposition } from '../src/index';
import { buildSongFromTranscription } from '../src/transcription/build-song';
import { parseTranscriptionPage } from '../src/transcription/parse-page';
import type { TranscribedTrack } from '../src/transcription/types';
import { assertEditInvariants, deepFreeze } from './helpers/edit-songs';
import { assertSongInvariants } from './helpers/invariants';
import { BASS, DRUMS, GUITAR, PIANO_LEFT, PIANO_RIGHT, VOCALS, bar, drum, page, play, rest, tab, written } from './helpers/transcription-pages';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';

function build(pages: readonly TranscriptionPage[]) {
  const result = buildSongFromTranscription(deepFreeze(pages));
  assertEditInvariants(result.song);
  return result;
}

function channelOf(song: Song, trackIndex: number) {
  return song.channels.find((channel) => channel.id === song.tracks[trackIndex]?.channelId);
}

/** Each beat's notes of one voice as [string, fret] pairs. */
function notesOf(song: Song, trackIndex: number, measureIndex = 0, voiceIndex = 0): number[][][] {
  const beats = song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  return beats.map((beat) => (beat.voices[voiceIndex]?.notes ?? []).map((note) => [note.string, note.fret]));
}

/** Each beat's sounding MIDI pitches of one voice (open string + capo + fret), low to high. */
function pitchesOf(song: Song, trackIndex: number, measureIndex = 0, voiceIndex = 0): number[][] {
  const track = song.tracks[trackIndex];
  const beats = track?.measures[measureIndex]?.beats ?? [];
  return beats.map((beat) =>
    (beat.voices[voiceIndex]?.notes ?? []).map((note) => (track?.strings[note.string - 1]?.tuning ?? 0) + (track?.offset ?? 0) + note.fret).sort((a, b) => a - b),
  );
}

function soloPage(track: TranscribedTrack, beats: Parameters<typeof bar>[0], extra: Omit<TranscriptionPage, 'measures' | 'tracks'> = {}): TranscriptionPage {
  return page([bar(beats)], { ...extra, tracks: [track] });
}

describe('buildSongFromTranscription: drums', () => {
  it('builds a drum track on the percussion bank, six strings tuned 0 and a neutral clef', () => {
    // Act
    const { song, warnings } = build([soloPage({ ...DRUMS, tuning: ['E2'], capo: 3 }, [rest('whole')])]);

    // Assert
    const track = song.tracks[0];
    expect(track).toEqual(expect.objectContaining({ name: 'Drums', isPercussion: true, offset: 0 }));
    expect(track?.strings).toEqual([1, 2, 3, 4, 5, 6].map((number) => ({ number, tuning: 0 })));
    expect(track?.measures[0]?.clef).toBe('neutral');
    expect(channelOf(song, 0)).toEqual(expect.objectContaining({ isPercussion: true, bank: DEFAULT_PERCUSSION_BANK, program: 0, name: 'DrumKit 1' }));
    expect(trackIconId(song, 0)).toBe(TRACK_ICON_IDS.drums);
    expect(warnings).toEqual([]);
  });

  it('gives every drum note its General MIDI key as its fret, on the string TuxGuitar’s drum map gives it', () => {
    // Act
    const { song } = build([
      soloPage(DRUMS, [
        play('quarter', drum('Bass Drum 1'), drum('Closed Hi-Hat')),
        play('quarter', drum('Acoustic Snare'), drum('Closed Hi-Hat')),
        play('quarter', drum('Crash Cymbal 1'), drum('Bass Drum 1')),
        play('quarter', drum('High Tom'), drum('Low Floor Tom'), drum('Pedal Hi-Hat')),
      ]),
    ]);

    // Assert
    expect(notesOf(song, 0)).toEqual([
      [[2, 42], [6, 36]],
      [[2, 42], [4, 38]],
      [[1, 49], [6, 36]],
      [[2, 44], [3, 50], [5, 41]],
    ]);
  });

  it('keeps accents and ghost notes on drums', () => {
    // Act
    const { song } = build([soloPage(DRUMS, [play('half', drum('Acoustic Snare', { effects: ['ghostNote'] })), play('half', drum('Crash Cymbal 1', { effects: ['accent'] }))])]);

    // Assert
    const beats = song.tracks[0]?.measures[0]?.beats ?? [];
    expect(beats[0]?.voices[0]?.notes[0]?.effect.ghostNote).toBe(true);
    expect(beats[1]?.voices[0]?.notes[0]?.effect.accentuatedNote).toBe(true);
  });

  it('plays the hands and the feet as two voices without giving two drums one string', () => {
    // Arrange
    const hands = { track: 0, beats: [play('half', drum('Closed Hi-Hat'), drum('Acoustic Snare')), play('half', drum('Closed Hi-Hat'))] };
    const feet = { track: 0, beats: [play('half', drum('Bass Drum 1')), play('half', drum('Pedal Hi-Hat'))] };

    // Act
    const { song, warnings } = build([page([{ parts: [hands, feet] }], { tracks: [DRUMS] })]);

    // Assert
    expect(notesOf(song, 0, 0, 0)).toEqual([[[2, 42], [4, 38]], [[2, 42]]]);
    // The pedal hi-hat's string 2 is the hand's: the nearest free one, the later of two as near (TGDrumMap's <=).
    expect(notesOf(song, 0, 0, 1)).toEqual([[[6, 36]], [[3, 44]]]);
    expect(warnings).toEqual([]);
  });

  it('leaves out drums beyond the six a beat holds, and notes that name no drum, and says so', () => {
    // Arrange
    const seven = ['Bass Drum 1', 'Acoustic Snare', 'Closed Hi-Hat', 'Crash Cymbal 1', 'Ride Cymbal 1', 'High Tom', 'Low Floor Tom'].map((name) => drum(name));

    // Act
    const { song, warnings } = build([soloPage(DRUMS, [play('half', ...seven), play('half', written('C5'))])]);

    // Assert
    expect(notesOf(song, 0)[0]).toHaveLength(6);
    expect(notesOf(song, 0)[1]).toEqual([]);
    expect(warnings).toEqual(['Bar 1: 1 note left out (more than 6 drums at once)', 'Bar 1: 1 note left out (no drum named)']);
  });

  it('reads back from GP5 as the same drum track', () => {
    // Arrange
    const { song } = build([soloPage(DRUMS, [play('quarter', drum('Bass Drum 1'), drum('Closed Hi-Hat')), play('quarter', drum('Acoustic Snare')), rest('half')])]);

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    expect(again.tracks[0]?.isPercussion).toBe(true);
    expect(channelOf(again, 0)?.isPercussion).toBe(true);
    expect(notesOf(again, 0)).toEqual(notesOf(song, 0));
  });
});

describe('buildSongFromTranscription: vocals', () => {
  it('builds a voice on General MIDI 53 (Guitar Pro’s Voice set and icon), sounding as written', () => {
    // Act
    const { song, warnings } = build([soloPage(VOCALS, [play('quarter', written('G4')), play('quarter', written('C5')), play('quarter', written('E5')), play('quarter', written('A3'))])]);

    // Assert
    expect(channelOf(song, 0)?.program).toBe(53);
    expect(trackIconId(song, 0)).toBe(TRACK_ICON_IDS.voice);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('treble');
    expect(pitchesOf(song, 0)).toEqual([[67], [72], [76], [57]]);
    expect(warnings).toEqual([]);
  });

  it('takes the program and the bass clef the page gives a voice', () => {
    // Act
    const { song } = build([soloPage({ ...VOCALS, name: 'Choir', program: 52, clef: 'bass' }, [play('whole', written('C3'))])]);

    // Assert
    expect(channelOf(song, 0)?.program).toBe(52);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('bass');
    expect(pitchesOf(song, 0)).toEqual([[48]]);
  });

  it('sings the lyrics on the first vocal track when no page names the lyrics track', () => {
    // Arrange
    const measure = { parts: [{ track: 0, beats: [play('whole', tab(6, 0))] }, { track: 1, beats: [play('half', written('E4')), play('half', written('G4'))] }], lyrics: ['Hel-', 'lo'] };

    // Act
    const { song } = build([page([measure], { tracks: [GUITAR, VOCALS] })]);

    // Assert
    expect(song.tracks[0]?.lyrics).toBeUndefined();
    expect(song.tracks[1]?.lyrics).toEqual({ from: 1, text: 'Hel- lo' });
  });
});

describe('buildSongFromTranscription: piano and other instruments', () => {
  it('builds a grand staff as two tracks, the right hand on the treble clef and the left hand on the bass clef', () => {
    // Arrange
    const measure = {
      parts: [
        { track: 0, beats: [play('half', written('C5'), written('E5'), written('G5')), play('half', written('B4'), written('D5'), written('F5'), written('G5'))] },
        { track: 1, beats: [play('half', written('C2'), written('C3')), play('half', written('G1'), written('G2'), written('D3'))] },
      ],
    };

    // Act
    const { song, warnings } = build([page([measure], { tracks: [PIANO_RIGHT, PIANO_LEFT] })]);

    // Assert
    expect(song.tracks.map((track) => track.measures[0]?.clef)).toEqual(['treble', 'bass']);
    expect([channelOf(song, 0)?.program, channelOf(song, 1)?.program]).toEqual([0, 0]);
    expect(song.tracks[0]?.channelId).not.toBe(song.tracks[1]?.channelId);
    expect(trackIconId(song, 0)).toBe(TRACK_ICON_IDS.keyboard);
    expect(pitchesOf(song, 0)).toEqual([[72, 76, 79], [71, 74, 77, 79]]);
    expect(pitchesOf(song, 1)).toEqual([[36, 48], [31, 43, 50]]);
    expect(warnings).toEqual([]);
  });

  it('gives a keyboard part strings that hold all its notes, high and low, without moving any', () => {
    // Act
    const { song, warnings } = build([soloPage(PIANO_RIGHT, [play('half', written('C7'), written('G6')), play('half', written('C4'), written('E4'), written('G4'), written('C5'))])]);

    // Assert
    expect(pitchesOf(song, 0)).toEqual([[91, 96], [60, 64, 67, 72]]);
    expect(song.tracks[0]?.offset).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('spreads seven strings over a part wider than six strings reach, from its lowest note', () => {
    // Act
    const { song, warnings } = build([soloPage(PIANO_LEFT, [play('half', written('A0'), written('C8')), play('half', written('C4'), written('E4'), written('G4'))])]);

    // Assert
    expect(song.tracks[0]?.strings).toHaveLength(7);
    expect(pitchesOf(song, 0)).toEqual([[21, 108], [60, 64, 67]]);
    expect(warnings).toEqual([]);
  });

  it('never tunes a string below MIDI 0 for a part at the bottom of the range', () => {
    // Act
    const { song, warnings } = build([soloPage(PIANO_LEFT, [play('whole', written('C0'), written('E0'))])]);

    // Assert
    expect(Math.min(...(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning) ?? []))).toBe(0);
    expect(pitchesOf(song, 0)).toEqual([[12, 16]]);
    expect(warnings).toEqual([]);
  });

  it('plays another instrument on the General MIDI program the page gives, as written', () => {
    // Act
    const { song } = build([soloPage({ name: 'Violin', instrument: 'other', tuning: [], capo: 0, program: 40 }, [play('whole', written('A5'))])]);

    // Assert
    expect(channelOf(song, 0)?.program).toBe(40);
    expect(trackIconId(song, 0)).toBe(TRACK_ICON_IDS.strings);
    expect(pitchesOf(song, 0)).toEqual([[81]]);
  });

  it('plays a contrabass at the pitch it sounds, as the page’s pitches give it, and writes it an octave above that', () => {
    // Act
    const { song } = build([soloPage({ name: 'Contrabass', instrument: 'other', tuning: [], capo: 0, program: 43, clef: 'bass' }, [play('whole', written('E2'))])]);

    // Assert
    expect(pitchesOf(song, 0)).toEqual([[40]]);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('bass');
    expect(writtenTransposition(43, false, song.tracks[0]?.strings.map((guitarString) => guitarString.tuning) ?? [])).toBe(12);
  });

  it('keeps every open string within MIDI for a part from the very bottom of the range to the top', () => {
    // Act
    const { song, warnings } = build([soloPage({ name: 'X', instrument: 'other', tuning: [], capo: 0, program: 43 }, [play('quarter', written('C-1')), play('quarter', written('C7')), rest('half')])]);

    // Assert
    const tuning = song.tracks[0]?.strings.map((guitarString) => guitarString.tuning) ?? [];
    expect(tuning.every((open) => open >= 0 && open <= 127)).toBe(true);
    expect(pitchesOf(song, 0)).toEqual([[0], [96], []]);
    expect(warnings).toEqual([]);
  });

  it('plays an instrument the page gives no program on the string ensemble, and a keyboard on the piano', () => {
    // Act
    const { song } = build([page([bar([])], { tracks: [{ name: 'Strings', instrument: 'other', tuning: [], capo: 0 }, { name: 'Keys', instrument: 'keys', tuning: [], capo: 0 }] })]);

    // Assert
    expect([channelOf(song, 0)?.program, channelOf(song, 1)?.program]).toEqual([48, 0]);
  });
});

describe('buildSongFromTranscription: ukulele and banjo', () => {
  it('plays a ukulele read from notation as written: ukulele music sounds where it is written', () => {
    // Act
    const { song, warnings } = build([
      soloPage({ name: 'Ukulele', instrument: 'ukulele', tuning: [], capo: 0 }, [play('quarter', written('A4')), play('quarter', written('C5')), play('quarter', written('E5')), play('quarter', written('G4'))]),
    ]);

    // Assert
    expect(pitchesOf(song, 0)).toEqual([[69], [72], [76], [67]]);
    expect(warnings).toEqual([]);
  });

  it('builds a ukulele in its re-entrant standard tuning on the nylon guitar’s sound', () => {
    // Act
    const { song } = build([soloPage({ name: 'Ukulele', instrument: 'ukulele', tuning: [], capo: 0 }, [play('whole', tab(4, 0), tab(3, 0), tab(2, 0), tab(1, 3))])]);

    // Assert
    expect(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([69, 64, 60, 67]);
    expect(channelOf(song, 0)?.program).toBe(24);
    expect(notesOf(song, 0)).toEqual([[[1, 3], [2, 0], [3, 0], [4, 0]]]);
  });

  it('reads a banjo’s re-entrant tuning listed from the bottom tab line up, the short fifth string first', () => {
    // Act
    const { song } = build([soloPage({ name: 'Banjo', instrument: 'banjo', tuning: ['G4', 'D3', 'G3', 'B3', 'D4'], capo: 0 }, [rest('whole')])]);

    // Assert
    expect(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([62, 59, 55, 50, 67]);
  });

  it('reads a ukulele’s re-entrant tuning listed from the bottom tab line up', () => {
    // Act
    const { song } = build([soloPage({ name: 'Ukulele', instrument: 'ukulele', tuning: ['G4', 'C4', 'E4', 'A4'], capo: 0 }, [rest('whole')])]);

    // Assert
    expect(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([69, 64, 60, 67]);
  });

  it('builds a five-string banjo in open G, its short fifth string’s frets read as banjo tab writes them', () => {
    // Act
    const { song, warnings } = build([
      soloPage({ name: 'Banjo', instrument: 'banjo', tuning: [], capo: 0 }, [play('half', tab(5, 0), tab(1, 0)), play('quarter', tab(5, 7)), play('quarter', tab(5, 3))]),
    ]);

    // Assert
    expect(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([62, 59, 55, 50, 67]);
    expect(channelOf(song, 0)?.program).toBe(105);
    expect(notesOf(song, 0)).toEqual([[[1, 0], [5, 0]], [[5, 2]], []]);
    expect(warnings).toEqual(['Bar 1: 1 note left out (unreadable pitch)']);
  });
});

describe('buildSongFromTranscription: a full band', () => {
  const BAND = [DRUMS, GUITAR, { ...GUITAR, name: 'Lead Guitar' }, BASS, VOCALS, PIANO_RIGHT, PIANO_LEFT];
  const bandBar = (lyrics: readonly string[] | undefined) => ({
    ...(lyrics === undefined ? {} : { lyrics }),
    parts: [
      { track: 0, beats: [play('quarter', drum('Bass Drum 1'), drum('Closed Hi-Hat')), play('quarter', drum('Acoustic Snare'), drum('Closed Hi-Hat')), play('half', drum('Crash Cymbal 1'), drum('Bass Drum 1'))] },
      { track: 1, beats: [play('half', tab(6, 3), tab(5, 2), tab(4, 0)), play('half', tab(6, 3), tab(5, 2), tab(4, 0))] },
      { track: 2, beats: [play('quarter', tab(2, 8)), play('quarter', tab(1, 7)), rest('half')] },
      { track: 3, beats: [play('half', written('G2')), play('half', written('D3'))] },
      { track: 4, beats: [play('quarter', written('B4')), play('quarter', written('D5')), play('half', written('G4'))] },
      { track: 5, beats: [play('whole', written('G4'), written('B4'), written('D5'))] },
      { track: 6, beats: [play('whole', written('G2'), written('G3'))] },
    ],
  });
  /** Page 1 lists the band; page 2 lists no tracks, its parts index into page 1's. */
  const PAGES: readonly TranscriptionPage[] = [
    page([bandBar(['Sing', 'a', 'song']), bandBar(['of', 'six', 'pence'])], { song: { title: 'Band', tempo: 110 }, tracks: BAND }),
    page([bandBar(['a', 'pock-', 'et']), bandBar(undefined)], {}),
  ];

  it('builds every staff of the page, in order, page 2 on page 1’s tracks', () => {
    // Act
    const { song, warnings } = build(PAGES);

    // Assert
    assertSongInvariants(song);
    expect(song.tracks.map((track) => track.name)).toEqual(['Drums', 'Guitar', 'Lead Guitar', 'Bass', 'Vocals', 'Piano (right hand)', 'Piano (left hand)']);
    expect(song.tracks.map((track) => track.isPercussion)).toEqual([true, false, false, false, false, false, false]);
    expect(song.tracks.map((_, index) => channelOf(song, index)?.program)).toEqual([0, 25, 25, 33, 53, 0, 0]);
    expect(song.tracks.map((track) => track.measures[0]?.clef)).toEqual(['neutral', 'treble', 'treble', 'bass', 'treble', 'treble', 'bass']);
    expect(song.tracks.every((track) => track.measures.length === 4)).toBe(true);
    expect(notesOf(song, 0, 3)).toEqual(notesOf(song, 0, 0));
    expect(pitchesOf(song, 4, 2)).toEqual([[71], [74], [67]]);
    expect(song.tracks[4]?.lyrics).toEqual({ from: 1, text: 'Sing a song of six pence a pock- et' });
    expect(song.tracks[1]?.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_TUNING);
    expect(warnings).toEqual([]);
  });

  it('reads back from GP5 with everything it holds: drums on the percussion channel, clefs, programs and lyrics', () => {
    // Arrange
    const { song } = build(PAGES);

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    assertSongInvariants(again);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('builds the same song from pages read with parseTranscriptionPage', () => {
    // Act
    const parsed = PAGES.map((current) => parseTranscriptionPage(JSON.parse(JSON.stringify(current))));

    // Assert
    expect(buildSongFromTranscription(parsed)).toEqual(buildSongFromTranscription(PAGES));
  });
});
