import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type XmlElement, child, childList, parseXml } from '../src/formats/gpif/xml';
import { decodeUtf8Lenient } from '../src/io/text';
import { plainDuration } from '../src/model/defaults';
import type { Duration, Note, NoteEffect, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { assertSongInvariants } from './helpers/invariants';
import { fromTux } from './helpers/ticks';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp } from './helpers/write-expected-gpif';
import { buildNote, buildSong, buildVoice, restVoice, songWithNotes } from './helpers/write-song-builder';

function roundTrip(song: Song): Song {
  const again = readSong(writeSong(song, 'gp'));
  assertSongInvariants(again);
  return again;
}

function scoreXml(song: Song): XmlElement {
  const entry = unzipSync(writeSong(song, 'gp'))['Content/score.gpif'];
  return parseXml(decodeUtf8Lenient(entry ?? new Uint8Array()));
}

function notesOf(song: Song, measure = 0, voice = 0): readonly Note[] {
  return song.tracks[0]?.measures[measure]?.beats.flatMap((beat) => beat.voices[voice]?.notes ?? []) ?? [];
}

const TRIPLET_EIGHTH: Duration = { value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } };

describe('writeSong gp: note effects', () => {
  it.each<[string, Partial<NoteEffect>]>([
    ['a bend', { bend: { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }, { position: 12, value: 4 }] } }],
    ['a natural harmonic', { harmonic: { type: 'natural', data: 0 } }],
    ['an artificial harmonic', { harmonic: { type: 'artificial', data: 19 } }],
    ['a tapped harmonic', { harmonic: { type: 'tapped', data: 17 } }],
    ['a pinch harmonic', { harmonic: { type: 'pinch', data: 0 } }],
    ['a semi harmonic', { harmonic: { type: 'semi', data: 0 } }],
    ['a grace note', { grace: { fret: 3, duration: 3, velocity: 95, transition: 'none', onBeat: false, isDead: false } }],
    ['an on-beat dead grace note with a slide', { grace: { fret: 2, duration: 2, velocity: 79, transition: 'slide', onBeat: true, isDead: true } }],
    ['a bent grace note', { grace: { fret: 4, duration: 1, velocity: 111, transition: 'bend', onBeat: false, isDead: false } }],
    ['a hammered grace note', { grace: { fret: 4, duration: 3, velocity: 95, transition: 'hammer', onBeat: false, isDead: false } }],
    ['a trill', { trill: { fret: 7, duration: plainDuration(16) } }],
    ['tremolo picking', { tremoloPicking: { duration: plainDuration(32) } }],
    ['slides in and out', { slides: ['shift', 'outUpwards', 'intoFromBelow'] }],
    ['a legato slide', { slides: ['legato'] }],
    ['slight vibrato', { vibrato: true }],
    ['wide vibrato', { wideVibrato: true }],
    ['a dead note', { deadNote: true }],
    ['a hammer-on', { hammer: true }],
    ['a ghost note', { ghostNote: true }],
    ['accents and staccato', { accentuatedNote: true, heavyAccentuatedNote: true, staccato: true }],
    ['palm mute and let ring', { palmMute: true, letRing: true }],
    ['tapping', { tapping: true }],
    ['slap and pop', { slapping: true, popping: true }],
    ['a fade in', { fadeIn: true }],
  ])('keeps %s', (_name, effect) => {
    // Arrange
    const song = songWithNotes([buildNote(2, 5, { effect })], [buildNote(2, 7)]);

    // Act
    const again = roundTrip(song);

    // Assert
    const read = notesOf(again)[0]?.effect;
    expect(read).toMatchObject(effect);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('keeps a whammy bar as Guitar Pro 7 writes it', () => {
    // Arrange
    const tremoloBar = {
      points: [
        { position: 0, value: 0 },
        { position: 0, value: 0 },
        { position: 6, value: -8 },
        { position: 12, value: 0 },
      ],
    };
    const song = songWithNotes([buildNote(1, 0, { effect: { tremoloBar } }), buildNote(2, 0, { effect: { tremoloBar } })]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => note.effect.tremoloBar)).toEqual([tremoloBar, tremoloBar]);
  });

  it('keeps ties and velocities', () => {
    // Arrange
    const song = songWithNotes([buildNote(3, 5, { velocity: 47 })], [buildNote(3, 5, { velocity: 47, isTied: true })]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => [note.isTied, note.velocity])).toEqual([
      [false, 47],
      [true, 47],
    ]);
  });

  it('marks the note a tie starts from and the note a hammer-on leads to, as Guitar Pro does', () => {
    // Arrange
    const song = songWithNotes([buildNote(3, 5, { effect: { hammer: true } })], [buildNote(3, 7)], [buildNote(3, 7, { isTied: true })]);

    // Act
    const notes = childList(scoreXml(song), 'Notes', 'Note');

    // Assert
    const properties = (note: XmlElement | undefined): string[] =>
      childList(note, 'Properties', 'Property').map((p) => p.attributes.get('name') ?? '');
    expect(properties(notes[0])).toContain('HopoOrigin');
    expect(properties(notes[1])).toContain('HopoDestination');
    expect(child(notes[1], 'Tie')?.attributes.get('origin')).toBe('true');
    expect(child(notes[2], 'Tie')?.attributes.get('destination')).toBe('true');
  });

  it('keeps one dynamic per voice, the first note’s, on the eight dynamics', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0, { velocity: 100 }), buildNote(2, 0, { velocity: 30 })]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => note.velocity)).toEqual([95, 95]);
  });

  it('writes equal notes once and shares them by id', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 3)], [buildNote(1, 3)], [buildNote(1, 3)], [buildNote(1, 5)]);

    // Act
    const xml = scoreXml(song);

    // Assert
    expect(childList(xml, 'Notes', 'Note')).toHaveLength(2);
    expect(childList(xml, 'Beats', 'Beat')).toHaveLength(2);
    expect(child(childList(xml, 'Voices', 'Voice')[0], 'Beats')?.text).toBe('0 0 0 1');
  });
});

describe('writeSong gp: beats and voices', () => {
  it('keeps strokes, pick strokes, texts and chords', () => {
    // Arrange
    const chord = { name: 'Am7', firstFret: 1, frets: [0, 1, 0, 2, 0, -1] };
    const nameOnly = { name: 'C/G', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] };
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: buildVoice([buildNote(1, 0)]), stroke: { direction: 'down', value: 16 }, chord },
              { voice: buildVoice([buildNote(1, 0)]), stroke: { direction: 'up', value: 64 }, pickStroke: 'up', text: 'A & <B>' },
              { voice: buildVoice([buildNote(1, 0)]), chord: nameOnly, pickStroke: 'down' },
              { voice: restVoice(), chord },
            ],
          ],
        },
      ],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    const beats = again.tracks[0]?.measures[0]?.beats ?? [];
    expect(beats.map((beat) => [beat.stroke, beat.pickStroke, beat.text, beat.chord])).toEqual([
      [{ direction: 'down', value: 16 }, 'none', undefined, chord],
      [{ direction: 'up', value: 64 }, 'up', 'A & <B>', undefined],
      [{ direction: 'none', value: 0 }, 'down', undefined, nameOnly],
      [{ direction: 'none', value: 0 }, 'none', undefined, chord],
    ]);
  });

  it('keeps a chord diagram played above its first fret, and one with open strings from fret 1', () => {
    // Arrange
    const barre = { name: 'Dm', firstFret: 5, frets: [5, 6, 7, 7, 5, -1] };
    const open = { name: 'E/G#', firstFret: 3, frets: [0, 0, 1, 2, 2, 4] };
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 5)]), chord: barre }, { voice: buildVoice([buildNote(1, 0)]), chord: open }]] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks[0]?.measures[0]?.beats.map((beat) => beat.chord)).toEqual([barre, { ...open, firstFret: 1 }]);
  });

  it('keeps four voices, tuplets and dots', () => {
    // Arrange
    const voices = [
      buildVoice([buildNote(1, 0)], { value: 2, dotted: false, doubleDotted: true, tuplet: { enters: 1, times: 1 } }),
      buildVoice([buildNote(2, 1)], { value: 4, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 } }),
      buildVoice([buildNote(3, 2)], TRIPLET_EIGHTH),
      buildVoice([buildNote(4, 3)], { value: 1, dotted: true, doubleDotted: false, tuplet: { enters: 1, times: 1 } }),
    ];
    const base = buildSong({ tracks: [{ measures: [[{ voice: restVoice() }]] }] });
    const song: Song = {
      ...base,
      measureHeaders: base.measureHeaders.map((header) => ({ ...header, timeSignature: { numerator: 6, denominator: 4 } })),
      tracks: base.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({ ...measure, beats: [{ start: fromTux(960), voices, stroke: { direction: 'none', value: 0 }, pickStroke: 'none' }] })),
      })),
    };

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks[0]?.measures[0]?.beats[0]?.voices.map((voice) => voice.duration)).toEqual(voices.map((voice) => voice.duration));
  });

  it('keeps a tuplet inside a tuplet as the primary and secondary tuplet of its rhythm', () => {
    // Arrange: a triplet inside a quintuplet, and a septuplet
    const nested: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 }, innerTuplet: { enters: 3, times: 2 } };
    const septuplet: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } };
    const song = songWithNotes([buildNote(1, 0)], [buildNote(1, 2)]);
    const withDurations: Song = {
      ...song,
      tracks: song.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({
          ...measure,
          beats: measure.beats.map((beat, index) => ({
            ...beat,
            voices: beat.voices.map((voice, v) => (v === 0 ? { ...voice, duration: index === 0 ? nested : septuplet } : voice)),
          })),
        })),
      })),
    };

    // Act
    const again = roundTrip(withDurations);
    const rhythm = childList(scoreXml(withDurations), 'Rhythms', 'Rhythm')[0];

    // Assert
    const played = again.tracks[0]?.measures[0]?.beats.filter((beat) => (beat.voices[0]?.notes.length ?? 0) > 0) ?? [];
    expect(played.map((beat) => beat.voices[0]?.duration)).toEqual([nested, septuplet]);
    expect(rhythm?.children.map((c) => [c.name, c.attributes.get('num'), c.attributes.get('den')])).toEqual([
      ['NoteValue', undefined, undefined],
      ['PrimaryTuplet', '5', '4'],
      ['SecondaryTuplet', '3', '2'],
    ]);
  });

  it('fills a gap in a voice with rests so that the beats keep their places', () => {
    // Arrange: a quarter, a gap of a dotted quarter, a dotted quarter to the bar line
    const dottedQuarter: Duration = { value: 4, dotted: true, doubleDotted: false, tuplet: { enters: 1, times: 1 } };
    const base = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }, { voice: buildVoice([buildNote(1, 2)], dottedQuarter) }]] }],
    });
    const song: Song = {
      ...base,
      tracks: base.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({
          ...measure,
          beats: measure.beats.map((beat, index) => (index === 1 ? { ...beat, start: beat.start + fromTux(1440) } : beat)),
        })),
      })),
    };

    // Act
    const again = roundTrip(song);

    // Assert
    const beats = again.tracks[0]?.measures[0]?.beats ?? [];
    expect(beats.map((beat) => [beat.start, beat.voices[0]?.notes.length, beat.voices[0]?.duration])).toEqual([
      [fromTux(960), 1, plainDuration(4)],
      [fromTux(1920), 0, dottedQuarter],
      [fromTux(3360), 1, dottedQuarter],
    ]);
  });

  it('writes an incomplete first measure as an anacrusis, laid out against its end', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(child(child(scoreXml(song), 'MasterTrack'), 'Anacrusis')).toBeDefined();
    expect(again.tracks[0]?.measures[0]?.beats[0]?.start).toBe(fromTux(960 + 3 * 960));
  });

  it('drops voice directions, which the reader does not read, but writes them for Guitar Pro', () => {
    // Arrange
    const base = songWithNotes([buildNote(1, 0)]);
    const song: Song = {
      ...base,
      tracks: base.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({
          ...measure,
          beats: measure.beats.map((beat) => ({ ...beat, voices: beat.voices.map((voice, i) => (i === 0 ? { ...voice, direction: 'down' as const } : voice)) })),
        })),
      })),
    };

    // Act
    const beat = childList(scoreXml(song), 'Beats', 'Beat')[0];

    // Assert
    expect(child(beat, 'UserTransposedPitchStemOrientation')?.text).toBe('Downward');
    expect(songDifference(expectedAfterGp(song), roundTrip(song))).toBeUndefined();
  });
});

describe('writeSong gp: tracks, channels and measure headers', () => {
  it('keeps measure headers: time signatures, tempos, markers, repeats, endings, triplet feel, keys', () => {
    // Arrange
    const song = buildSong({
      headers: [
        { timeSignature: { numerator: 3, denominator: 4 }, tempo: 90, repeatOpen: true, marker: { title: 'Intro', color: { r: 255, g: 0, b: 0 } } },
        { timeSignature: { numerator: 7, denominator: 8 }, tempo: 90, repeatClose: 2, repeatAlternative: 0b101, tripletFeel: 'eighth' },
        { tempo: 140, tripletFeel: 'sixteenth' },
      ],
      tracks: [{ keySignatures: [-3, 2, 7], clef: 'bass', measures: [[{ voice: buildVoice([buildNote(1, 0)], plainDuration(2)) }, { voice: restVoice() }]] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
    expect(again.measureHeaders.map((header) => [header.tempo, header.repeatClose, header.repeatAlternative, header.tripletFeel])).toEqual([
      [90, 0, 0, 'none'],
      [90, 2, 5, 'eighth'],
      [140, 0, 0, 'sixteenth'],
    ]);
    expect(again.tracks[0]?.measures.map((measure) => [measure.keySignature, measure.clef])).toEqual([
      [-3, 'bass'],
      [2, 'bass'],
      [7, 'bass'],
    ]);
  });

  it('drops a note’s audio settings (GPIF has no property for them)', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 1, { audio: { durationPercent: 60, offsetPercent: 10, velocityOffset: 5 } })]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again)[0]).not.toHaveProperty('audio');
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('keeps decimal tempos (GPIF tempo automations hold numbers with a fraction)', () => {
    // Arrange
    const song = buildSong({ headers: [{ tempo: 92.5 }, { tempo: 92.5 }, { tempo: 100.25 }], tracks: [{ measures: [] }] });

    // Act
    const again = roundTrip(song);
    const automations = childList(child(scoreXml(song), 'MasterTrack'), 'Automations', 'Automation');

    // Assert
    expect(again.measureHeaders.map((header) => header.tempo)).toEqual([92.5, 92.5, 100.25]);
    expect(automations.map((automation) => child(automation, 'Value')?.text)).toEqual(['92.5 2', '100.25 2']);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('keeps tracks: names, colours, tunings, capo, lyrics, solo and mute, channels', () => {
    // Arrange
    const song = buildSong({
      tracks: [
        {
          name: 'Lead "1" & <2>',
          color: { r: 1, g: 2, b: 3 },
          offset: 2,
          solo: true,
          lyrics: { from: 2, text: 'la la\nlo' },
          channel: { program: 30, volume: 100, balance: 20, bank: 3 },
          measures: [[{ voice: buildVoice([buildNote(1, 0, { effect: { trill: { fret: 2, duration: plainDuration(32) } } })]) }]],
        },
        {
          name: 'Bass',
          strings: [43, 38, 33, 28, 23].map((tuning, i) => ({ number: i + 1, tuning })),
          mute: true,
          channel: { program: 33 },
          measures: [[{ voice: buildVoice([buildNote(5, 0)]) }]],
        },
      ],
    });

    const banked: Song = { ...song, channels: song.channels.map((channel) => (channel.id === 1 ? { ...channel, bank: 3 } : channel)) };

    // Act
    const again = roundTrip(banked);

    // Assert
    expect(songDifference(expectedAfterGp(banked), again)).toBeUndefined();
    expect(again.channels.map((channel) => [channel.program, channel.volume, channel.balance, channel.bank])).toEqual([
      [30, 100, 20, 3],
      [33, 127, 63, 0],
    ]);
    expect(again.tracks[0]?.lyrics).toEqual({ from: 2, text: 'la la\nlo' });
  });

  it('keeps a drum track and its notes, also those the drum kit lacks', () => {
    // Arrange
    const song = buildSong({
      tracks: [
        { measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]] },
        {
          isPercussion: true,
          strings: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, tuning: 0 })),
          measures: [[{ voice: buildVoice([buildNote(1, 36), buildNote(2, 38), buildNote(3, 27)]) }]],
        },
      ],
    });

    // Act
    const again = roundTrip(song);
    const xml = scoreXml(song);

    // Assert
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
    expect(again.tracks[1]?.isPercussion).toBe(true);
    const drums = childList(xml, 'Tracks', 'Track')[1];
    expect(child(child(drums, 'MidiConnection'), 'PrimaryChannel')?.text).toBe('9');
    expect(child(child(drums, 'InstrumentSet'), 'Type')?.text).toBe('drumKit');
    const articulations = childList(child(drums, 'InstrumentSet'), 'Elements', 'Element').flatMap((e) => childList(e, 'Articulations', 'Articulation'));
    const inputs = articulations.map((a) => child(a, 'InputMidiNumbers')?.text);
    const used = childList(xml, 'Notes', 'Note').slice(1).map((note) => Number(child(note, 'InstrumentArticulation')?.text));
    expect(used.map((index) => inputs[index])).toEqual(['36', '38', '27']);
  });

  it('gives each pitched channel its own MIDI channels, pairs while there are enough', () => {
    // Arrange
    const song = buildSong({ tracks: Array.from({ length: 8 }, () => ({ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]] })) });

    // Act
    const tracks = childList(scoreXml(song), 'Tracks', 'Track');
    const again = roundTrip(song);

    // Assert
    const primaries = tracks.map((track) => child(child(track, 'MidiConnection'), 'PrimaryChannel')?.text);
    expect(primaries).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    expect(again.channels).toHaveLength(8);
  });

  it('wraps pitched channels past fifteen round to the first MIDI channels, which the reader merges', () => {
    // Arrange
    const song = buildSong({
      tracks: Array.from({ length: 17 }, (_, i) => ({ channel: { program: i }, measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]] })),
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.channels).toHaveLength(15);
    expect(again.tracks.map((track) => track.channelId).slice(14)).toEqual([15, 1, 2]);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('writes an empty bar for a track that has fewer measures than the song', () => {
    // Arrange
    const base = buildSong({ headers: [{}, {}], tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)], plainDuration(1)) }]] }] });
    const song: Song = { ...base, tracks: base.tracks.map((track) => ({ ...track, measures: track.measures.slice(0, 1) })) };

    // Act
    const again = readSong(writeSong(song, 'gp'));

    // Assert
    expect(again.tracks[0]?.measures.map((measure) => measure.beats.length)).toEqual([1, 0]);
  });

  it('keeps the song information, dropping what XML cannot hold', () => {
    // Arrange
    const song = buildSong({
      info: { title: 'T]]>x', artist: 'A\u0001B', words: 'W', music: 'M', notice: ['one', 'two'], instructions: 'a\r\nb' },
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.info).toMatchObject({ title: 'T]]>x', artist: 'AB', words: 'W', music: 'M', notice: ['one', 'two'], instructions: 'a\nb' });
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('refuses a song without measures or tracks', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)]);

    // Act / Assert
    expect(() => writeSong({ ...song, tracks: [] }, 'gp')).toThrow(RangeError);
  });
});

