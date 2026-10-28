import { describe, expect, it } from 'vitest';
import { BEND_PRESETS, TREMOLO_BAR_PRESETS } from '../src/edit/effects';
import { buildBend } from '../src/edit/bend-shapes';
import { NORMAL_TUPLET, plainDuration } from '../src/model/defaults';
import type { Duration } from '../src/model/song';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import {
  attribute,
  child,
  childNames,
  childText,
  children,
  descendants,
  measuresOf,
  notesOn,
  parseWritten,
  technicalOf,
} from './helpers/musicxml-tree';
import { buildNote, buildSong, buildVoice, restVoice, songWithNotes } from './helpers/write-song-builder';

const EIGHTH: Duration = { value: 8, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
const EIGHTH_TRIPLET: Duration = { ...EIGHTH, tuplet: { enters: 3, times: 2 } };

function written(song: Parameters<typeof writeMusicXml>[0]) {
  return parseWritten(writeMusicXml(song));
}

describe('writeMusicXml document', () => {
  it('writes a score-partwise 4.0 document with one part per track and one measure per header', () => {
    // Arrange
    const song = buildSong({
      info: { title: 'Song & Dance', music: 'Composer', words: 'Lyricist', artist: 'Band', copyright: '(c) 2026' },
      tracks: [{ name: 'Lead', measures: [[{ voice: buildVoice([buildNote(1, 0)]) }], []] }, { name: 'Rhythm', measures: [] }],
    });

    // Act
    const root = written(song);

    // Assert
    expect(root.name).toBe('score-partwise');
    expect(attribute(root, 'version')).toBe('4.0');
    expect(childText(child(root, 'work'), 'work-title')).toBe('Song & Dance');
    const creators = children(child(root, 'identification'), 'creator').map((c) => [attribute(c, 'type'), c.text]);
    expect(creators).toEqual([['composer', 'Composer'], ['lyricist', 'Lyricist'], ['artist', 'Band']]);
    expect(childText(child(root, 'identification'), 'rights')).toBe('(c) 2026');
    expect(children(child(root, 'part-list'), 'score-part').map((part) => childText(part, 'part-name'))).toEqual(['Lead', 'Rhythm']);
    expect(children(root, 'part').map((part) => attribute(part, 'id'))).toEqual(['P1', 'P2']);
    expect(measuresOf(root, 1).map((measure) => attribute(measure, 'number'))).toEqual(['1', '2']);
  });

  it('starts with the XML declaration and the MusicXML 4.0 partwise doctype', () => {
    // Arrange / Act
    const xml = writeMusicXml(songWithNotes([buildNote(1, 0)]));

    // Assert
    expect(xml.split('\n').slice(0, 2)).toEqual([
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    ]);
  });

  it('writes the MIDI channel, program, volume and pan of each part', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[]], channel: { program: 30, volume: 127, balance: 0 } }] });

    // Act
    const midi = child(child(child(written(song), 'part-list'), 'score-part'), 'midi-instrument');

    // Assert
    expect(childNames(midi)).toEqual(['midi-channel', 'midi-program', 'volume', 'pan']);
    expect(childText(midi, 'midi-channel')).toBe('1');
    expect(childText(midi, 'midi-program')).toBe('31');
    expect(childText(midi, 'volume')).toBe('100');
    expect(childText(midi, 'pan')).toBe('-90');
  });

  it('escapes text from the song', () => {
    // Arrange
    const song = buildSong({ info: { title: '<A> "B" & \'C\'' }, tracks: [{ name: 'Gtr <1>', measures: [[]] }] });

    // Act
    const xml = writeMusicXml(song);

    // Assert
    expect(xml).toContain('<work-title>&lt;A&gt; &quot;B&quot; &amp; &apos;C&apos;</work-title>');
    expect(childText(child(child(parseWritten(xml), 'part-list'), 'score-part'), 'part-name')).toBe('Gtr <1>');
  });

  it('writes a track’s own short name as its part-abbreviation, and none for a track without one', () => {
    // Arrange
    const song = buildSong({ tracks: [{ name: 'Lead', measures: [[]] }, { name: 'Rhythm Guitar', measures: [[]] }] });
    const named = { ...song, tracks: song.tracks.map((track, index) => (index === 0 ? { ...track, shortName: 'L.Gt' } : track)) };

    // Act
    const parts = children(child(written(named), 'part-list'), 'score-part');

    // Assert
    expect(parts.map((part) => childText(part, 'part-abbreviation'))).toEqual(['L.Gt', undefined]);
    expect(childNames(parts[0]).slice(0, 2)).toEqual(['part-name', 'part-abbreviation']);
  });

  it('refuses a song without measures or tracks', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[]] }] });

    // Act / Assert
    expect(() => writeMusicXml({ ...song, tracks: [] })).toThrow(RangeError);
    expect(() => writeMusicXml({ ...song, measureHeaders: [] })).toThrow(RangeError);
  });
});

describe('writeMusicXml measure attributes', () => {
  it.each([
    ['a guitar', 25, [64, 59, 55, 50, 45, 40], '-1'],
    ['a bass', 33, [43, 38, 33, 28], '-1'],
    ['a piano', 0, [64, 59, 55, 50, 45, 40], undefined],
    ['a voice', 53, [64, 59, 55, 50, 45, 40], undefined],
    ['a ukulele', 24, [69, 64, 60, 67], undefined],
  ])('writes %s’s notation clef with the 8 below only when it sounds an octave lower than written', (_case, program, tuning, octaveChange) => {
    // Arrange
    const strings = tuning.map((open, index) => ({ number: index + 1, tuning: open }));
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]], strings, channel: { program } }] });

    // Act
    const [notation] = children(child(measuresOf(written(song))[0], 'attributes'), 'clef');

    // Assert
    expect(childText(notation, 'clef-octave-change')).toBe(octaveChange);
  });

  it('writes divisions (quarter notes only: 1), key, time, two staves, the clefs and the tab tuning in the first measure', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]], offset: 2, keySignatures: [-2] }] });

    // Act
    const attributes = child(measuresOf(written(song))[0], 'attributes');

    // Assert
    expect(childNames(attributes)).toEqual(['divisions', 'key', 'time', 'staves', 'part-symbol', 'clef', 'clef', 'staff-details']);
    expect(childText(attributes, 'divisions')).toBe('1');
    expect(childText(child(attributes, 'key'), 'fifths')).toBe('-2');
    expect(childText(child(attributes, 'time'), 'beats')).toBe('4');
    expect(childText(child(attributes, 'time'), 'beat-type')).toBe('4');
    expect(childText(attributes, 'staves')).toBe('2');
    const [notation, tab] = children(attributes, 'clef');
    expect([childText(notation, 'sign'), childText(notation, 'line'), childText(notation, 'clef-octave-change')]).toEqual(['G', '2', '-1']);
    expect([attribute(tab, 'number'), childText(tab, 'sign')]).toEqual(['2', 'TAB']);
    const details = child(attributes, 'staff-details');
    expect(attribute(details, 'number')).toBe('2');
    expect(childText(details, 'staff-lines')).toBe('6');
    const tuning = children(details, 'staff-tuning').map((t) => `${attribute(t, 'line')}:${childText(t, 'tuning-step')}${childText(t, 'tuning-octave')}`);
    expect(tuning).toEqual(['1:E2', '2:A2', '3:D3', '4:G3', '5:B3', '6:E4']);
    expect(childText(details, 'capo')).toBe('2');
  });

  it('writes attributes again only where the time signature, key or clef changes', () => {
    // Arrange
    const song = buildSong({
      headers: [{}, {}, { timeSignature: { numerator: 3, denominator: 8 } }],
      tracks: [{ measures: [], keySignatures: [0, 0, 0] }],
    });

    // Act
    const measures = measuresOf(written(song));

    // Assert
    expect(child(measures[1], 'attributes')).toBeUndefined();
    const time = child(child(measures[2], 'attributes'), 'time');
    expect([childText(time, 'beats'), childText(time, 'beat-type')]).toEqual(['3', '8']);
  });

  it('writes a percussion part on one staff with a percussion clef and unpitched notes', () => {
    // Arrange
    const song = buildSong({ tracks: [{ isPercussion: true, measures: [[{ voice: buildVoice([buildNote(1, 36)]) }]] }] });

    // Act
    const root = written(song);
    const measure = measuresOf(root)[0];

    // Assert
    const attributes = child(measure, 'attributes');
    expect(childText(attributes, 'staves')).toBeUndefined();
    expect(childText(child(attributes, 'clef'), 'sign')).toBe('percussion');
    const note = children(measure, 'note')[0];
    expect(childNames(child(note, 'unpitched'))).toEqual(['display-step', 'display-octave']);
    expect(attribute(child(note, 'instrument'), 'id')).toBe('P1-I37');
    const instruments = children(child(child(root, 'part-list'), 'score-part'), 'midi-instrument');
    expect(instruments.map((midi) => [attribute(midi, 'id'), childText(midi, 'midi-channel'), childText(midi, 'midi-unpitched')])).toEqual([['P1-I37', '10', '37']]);
  });
});

describe('writeMusicXml notes', () => {
  it('writes each note on the notation staff with its pitch and on the tab staff with its string and fret', () => {
    // Arrange
    const song = songWithNotes([buildNote(2, 1), buildNote(3, 2)]);

    // Act
    const measure = measuresOf(written(song))[0];

    // Assert
    const notation = notesOn(measure, 1);
    expect(notation.map((note) => `${childText(child(note, 'pitch'), 'step')}${childText(child(note, 'pitch'), 'octave')}`)).toEqual(['C4', 'A3']);
    expect(child(notation[0], 'chord')).toBeUndefined();
    expect(child(notation[1], 'chord')).toBeDefined();
    expect(notation.map((note) => childText(note, 'type'))).toEqual(['quarter', 'quarter']);
    expect(notation.map((note) => childText(note, 'duration'))).toEqual(['1', '1']);
    const tab = notesOn(measure, 2);
    expect(tab.map((note) => [childText(technicalOf(note), 'string'), childText(technicalOf(note), 'fret')])).toEqual([['2', '1'], ['3', '2']]);
    expect(tab.map((note) => childText(note, 'stem'))).toEqual(['none', 'none']);
    expect(tab.map((note) => childText(note, 'voice'))).toEqual(['5', '5']);
  });

  it('adds the capo to the written pitch', () => {
    // Arrange
    const song = { ...songWithNotes([buildNote(1, 0)]) };
    const capoed = { ...song, tracks: song.tracks.map((track) => ({ ...track, offset: 3 })) };

    // Act
    const pitch = child(notesOn(measuresOf(written(capoed))[0], 1)[0], 'pitch');

    // Assert
    expect([childText(pitch, 'step'), childText(pitch, 'octave')]).toEqual(['G', '4']);
  });

  it('writes rests, dots and tuplets with time-modification and tuplet brackets, in divisions every length divides', () => {
    // Arrange
    const dotted: Duration = { value: 4, dotted: true, doubleDotted: false, tuplet: NORMAL_TUPLET };
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: restVoice(dotted) },
              { voice: buildVoice([buildNote(1, 0)], EIGHTH_TRIPLET) },
              { voice: buildVoice([buildNote(1, 1)], EIGHTH_TRIPLET) },
              { voice: buildVoice([buildNote(1, 2)], EIGHTH_TRIPLET) },
              { voice: restVoice(EIGHTH) },
            ],
          ],
        },
      ],
    });

    // Act
    const measure = measuresOf(written(song))[0];
    const notes = notesOn(measure, 1);

    // Assert
    expect(childText(child(measure, 'attributes'), 'divisions')).toBe('6');
    expect(child(notes[0], 'rest')).toBeDefined();
    expect(childText(notes[0], 'duration')).toBe('9');
    expect(children(notes[0], 'dot')).toHaveLength(1);
    const modification = child(notes[1], 'time-modification');
    expect([childText(modification, 'actual-notes'), childText(modification, 'normal-notes')]).toEqual(['3', '2']);
    expect(childText(notes[1], 'duration')).toBe('2');
    const tuplets = notes.map((note) => attribute(child(child(note, 'notations'), 'tuplet'), 'type'));
    expect(tuplets).toEqual([undefined, 'start', undefined, 'stop', undefined]);
  });

  it('writes a tuplet inside a tuplet as their combined ratio, without a bracket', () => {
    // Arrange
    const nested: Duration = { ...EIGHTH, value: 16, tuplet: { enters: 3, times: 2 }, innerTuplet: { enters: 3, times: 2 } };
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)], nested) }, { voice: buildVoice([buildNote(1, 2)], nested) }]] }] });

    // Act
    const notes = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    const modification = child(notes[0], 'time-modification');
    expect([childText(modification, 'actual-notes'), childText(modification, 'normal-notes')]).toEqual(['9', '4']);
    expect(notes.map((note) => child(child(note, 'notations'), 'tuplet'))).toEqual([undefined, undefined]);
  });

  it('ties a note to the tied note that continues it, across the bar line', () => {
    // Arrange
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(3, 2)], { ...EIGHTH, value: 1 }) }], [{ voice: buildVoice([buildNote(3, 2, { isTied: true })]) }]] }],
    });

    // Act
    const [first, second] = measuresOf(written(song)).map((measure) => notesOn(measure, 1)[0]);

    // Assert
    expect(children(first, 'tie').map((tie) => attribute(tie, 'type'))).toEqual(['start']);
    expect(attribute(child(child(first, 'notations'), 'tied'), 'type')).toBe('start');
    expect(children(second, 'tie').map((tie) => attribute(tie, 'type'))).toEqual(['stop']);
    expect(attribute(child(child(second, 'notations'), 'tied'), 'type')).toBe('stop');
  });

  it('writes a hammer-on and a pull-off with slurs to the next note on the string', () => {
    // Arrange
    const song = songWithNotes([buildNote(2, 1, { effect: { hammer: true } })], [buildNote(2, 3, { effect: { hammer: true } })], [buildNote(2, 1)]);

    // Act
    const notes = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    const marks = notes.map((note) => {
      const technical = technicalOf(note);
      return [
        children(technical, 'hammer-on').map((h) => attribute(h, 'type')).join(','),
        children(technical, 'pull-off').map((p) => attribute(p, 'type')).join(','),
        children(child(note, 'notations'), 'slur').map((s) => attribute(s, 'type')).join(','),
      ];
    });
    expect(marks).toEqual([
      ['start', '', 'start'],
      ['stop', 'start', 'stop,start'],
      ['', 'stop', 'stop'],
    ]);
  });

  it('writes bends as bend-alter steps in semitones, with pre-bends and releases', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { bend: BEND_PRESETS.full } })],
      [buildNote(1, 5, { effect: { bend: buildBend('bendRelease', 2) } })],
      [buildNote(1, 5, { effect: { bend: buildBend('preBendRelease', 4) } })],
      [buildNote(1, 5, { effect: { bend: buildBend('release', 4) } })],
    );

    // Act
    const notes = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    const bends = notes.map((note) => children(technicalOf(note), 'bend').map((bend) => [childText(bend, 'bend-alter'), childNames(bend).slice(1).join()]));
    expect(bends).toEqual([
      [['2', '']],
      [['1', ''], ['-1', 'release']],
      [['2', 'pre-bend'], ['-2', 'release']],
      [['-2', 'release']],
    ]);
  });

  it('writes the tremolo bar as bends with the bar, and keeps a hammer-on or slide with no note after it', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { tremoloBar: TREMOLO_BAR_PRESETS.dip } })],
      [buildNote(1, 5, { effect: { hammer: true, slides: ['shift'] } })],
    );

    // Act
    const notes = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    const bar = children(technicalOf(notes[0]), 'bend').map((bend) => [childText(bend, 'bend-alter'), childNames(bend).slice(1).join()]);
    expect(bar).toEqual([['-2', 'with-bar'], ['2', 'with-bar']]);
    expect(attribute(child(technicalOf(notes[1]), 'hammer-on'), 'type')).toBe('start');
    expect(attribute(child(child(notes[1], 'notations'), 'slide'), 'type')).toBe('start');
    expect(child(child(notes[1], 'notations'), 'slur')).toBeUndefined();
  });

  it('writes a stroke as an arpeggio on every note of the beat (a down stroke plays upwards)', () => {
    // Arrange
    const base = songWithNotes([buildNote(1, 0), buildNote(2, 0)]);
    const track = base.tracks[0];
    const measure = track?.measures[0];
    if (track === undefined || measure === undefined) {
      throw new Error('test song has a track and a measure');
    }
    const beats = measure.beats.map((beat) => ({ ...beat, stroke: { direction: 'down' as const, value: 16 } }));
    const song = { ...base, tracks: [{ ...track, measures: [{ ...measure, beats }] }] };

    // Act
    const notes = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    expect(notes.map((note) => attribute(child(child(note, 'notations'), 'arpeggiate'), 'direction'))).toEqual(['up', 'up']);
  });

  it('writes slides, harmonics, vibrato, let ring, palm mute and articulations', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 3, { effect: { slides: ['shift'], palmMute: true, staccato: true } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'natural', data: 0 }, letRing: true, accentuatedNote: true } })],
      [buildNote(1, 7, { effect: { wideVibrato: true, slides: ['outDownwards'], heavyAccentuatedNote: true } })],
      [buildNote(1, 7, { effect: { vibrato: true, deadNote: true, ghostNote: false } })],
    );

    // Act
    const measure = measuresOf(written(song))[0];
    const notes = notesOn(measure, 1);

    // Assert
    const notations = notes.map((note) => child(note, 'notations'));
    expect(children(notations[0], 'slide').map((s) => attribute(s, 'type'))).toEqual(['start']);
    expect(children(notations[1], 'slide').map((s) => attribute(s, 'type'))).toEqual(['stop']);
    expect(childNames(child(notations[0], 'articulations'))).toEqual(['staccato']);
    expect(childText(child(notes[0], 'play'), 'mute')).toBe('palm');
    expect(descendants(measure, 'words').map((words) => words.text)).toEqual(['P.M.']);
    expect(childNames(child(technicalOf(notes[1]), 'harmonic'))).toEqual(['natural']);
    expect(attribute(child(notations[1], 'tied'), 'type')).toBe('let-ring');
    expect(childNames(child(notations[1], 'articulations'))).toEqual(['accent']);
    expect(childNames(child(notations[2], 'articulations'))).toEqual(['strong-accent', 'falloff']);
    const wavy = children(child(notations[2], 'ornaments'), 'wavy-line');
    expect(wavy.map((w) => [attribute(w, 'type'), attribute(w, 'smufl')])).toEqual([['start', 'wiggleVibratoWide'], ['stop', undefined]]);
    expect(attribute(child(child(notations[3], 'ornaments'), 'wavy-line'), 'smufl')).toBe('wiggleVibrato');
    expect(childText(notes[3], 'notehead')).toBe('x');
  });

  it('marks dynamics where they change and keeps each velocity on its note', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)], [buildNote(1, 0, { velocity: 63 })], [buildNote(1, 0, { velocity: 63 })], [buildNote(1, 0, { velocity: 127 })]);

    // Act
    const measure = measuresOf(written(song))[0];

    // Assert
    const marks = descendants(measure, 'dynamics').map((dynamics) => childNames(dynamics).join());
    expect(marks).toEqual(['mp', 'fff']);
    expect(notesOn(measure, 1).map((note) => attribute(note, 'dynamics'))).toEqual(['100', '66.32', '66.32', '133.68']);
  });

  it('writes grace notes before their note on the same string', () => {
    // Arrange
    const grace = { fret: 3, duration: 2, velocity: 95, transition: 'hammer' as const, onBeat: false, isDead: false };
    const song = songWithNotes([buildNote(2, 5, { effect: { grace } })]);

    // Act
    const [graceNote, main] = notesOn(measuresOf(written(song))[0], 1);

    // Assert
    expect(attribute(child(graceNote, 'grace'), 'slash')).toBe('yes');
    expect(childText(graceNote, 'duration')).toBeUndefined();
    expect(childText(graceNote, 'type')).toBe('32nd');
    expect(childText(child(graceNote, 'pitch'), 'step')).toBe('D');
    expect(attribute(child(child(graceNote, 'notations'), 'slur'), 'type')).toBe('start');
    expect(attribute(child(child(main, 'notations'), 'slur'), 'type')).toBe('stop');
  });

  it('writes the beat text, lyrics with syllabic and pick strokes', () => {
    // Arrange
    const base = songWithNotes([buildNote(1, 0)], [buildNote(1, 2)], [buildNote(1, 4)]);
    const track = base.tracks[0];
    const measure = track?.measures[0];
    if (track === undefined || measure === undefined) {
      throw new Error('test song has a track and a measure');
    }
    const beats = measure.beats.map((beat, index) => (index === 0 ? { ...beat, text: 'Intro', pickStroke: 'down' as const } : beat));
    const song = { ...base, tracks: [{ ...track, lyrics: { from: 1, text: 'Hel- lo world' }, measures: [{ ...measure, beats }] }] };

    // Act
    const written1 = measuresOf(written(song))[0];

    // Assert
    expect(descendants(written1, 'words').map((words) => words.text)).toEqual(['Intro']);
    const lyrics = notesOn(written1, 1).map((note) => child(note, 'lyric'));
    expect(lyrics.map((lyric) => [childText(lyric, 'syllabic'), childText(lyric, 'text')])).toEqual([
      ['begin', 'Hel'],
      ['end', 'lo'],
      ['single', 'world'],
    ]);
    expect(child(technicalOf(notesOn(written1, 1)[0]), 'down-bow')).toBeDefined();
  });
});

describe('writeMusicXml octave signs', () => {
  /** Four quarters: an 8va over the second and third (the second in the next bar's run too), then a 15mb into bar 2. */
  function signedSong() {
    const quarterNote = (fret: number) => buildVoice([buildNote(1, fret)]);
    return buildSong({
      tracks: [
        {
          measures: [
            [{ voice: quarterNote(0) }, { voice: quarterNote(1), ottava: '8va' }, { voice: quarterNote(2), ottava: '8va' }, { voice: quarterNote(3), ottava: '15mb' }],
            [{ voice: quarterNote(4), ottava: '15mb' }, { voice: restVoice(plainDuration(2)) }, { voice: quarterNote(5) }],
          ],
        },
      ],
    });
  }

  /** Each octave-shift of a measure as type/size, in document order. */
  const shifts = (measure: ReturnType<typeof measuresOf>[number] | undefined) =>
    descendants(measure, 'octave-shift').map((shift) => `${attribute(shift, 'type')}/${attribute(shift, 'size')}`);

  it('starts an octave shift before a run’s first note and stops it after its last, across the bar line', () => {
    // Act
    const [first, second] = measuresOf(written(signedSong()));

    // Assert
    expect(shifts(first)).toEqual(['down/8', 'stop/8', 'up/15']);
    expect(shifts(second)).toEqual(['stop/15']);
  });

  it('writes the shifts on the notation staff only, before and after the notes they belong to', () => {
    // Act
    const [first] = measuresOf(written(signedSong()));
    const names = (first?.children ?? []).filter((node) => node.name === 'note' || descendants(node, 'octave-shift').length > 0);
    const order = names.map((node) => (node.name === 'note' ? `note:${childText(node, 'staff')}` : `shift:${childText(node, 'staff')}`));

    // Assert
    expect(order.slice(0, 8)).toEqual(['note:1', 'shift:1', 'note:1', 'note:1', 'shift:1', 'shift:1', 'note:1', 'note:2']);
  });
});

describe('writeMusicXml measure headers', () => {
  it('writes tempo marks with sound tempo, markers as rehearsal marks, repeats and endings', () => {
    // Arrange
    const song = buildSong({
      headers: [
        { repeatOpen: true, marker: { title: 'Verse', color: { r: 0, g: 0, b: 0 } } },
        { repeatClose: 1, repeatAlternative: 0b01, tempo: 90 },
        { repeatAlternative: 0b10 },
      ],
      tracks: [{ measures: [] }],
    });

    // Act
    const [first, second, third] = measuresOf(written(song));

    // Assert
    const direction = child(first, 'direction');
    expect(childNames(direction)).toEqual(['direction-type', 'direction-type', 'sound']);
    expect(childText(child(child(direction, 'direction-type'), 'metronome'), 'per-minute')).toBe('120');
    expect(attribute(child(direction, 'sound'), 'tempo')).toBe('120');
    expect(descendants(first, 'rehearsal').map((mark) => mark.text)).toEqual(['Verse']);
    const firstBarlines = children(first, 'barline');
    expect(firstBarlines.map((barline) => [attribute(barline, 'location'), attribute(child(barline, 'repeat'), 'direction')])).toEqual([['left', 'forward']]);
    expect(attribute(child(child(second, 'direction'), 'sound'), 'tempo')).toBe('90');
    const secondBarlines = children(second, 'barline');
    expect(secondBarlines.map((barline) => [attribute(barline, 'location'), attribute(child(barline, 'ending'), 'type')])).toEqual([['left', 'start'], ['right', 'stop']]);
    expect(attribute(child(secondBarlines[1], 'repeat'), 'times')).toBe('2');
    expect(children(third, 'barline').map((barline) => attribute(child(barline, 'ending'), 'type'))).toEqual(['start', 'discontinue']);
    expect(attribute(child(children(third, 'barline')[0], 'ending'), 'number')).toBe('2');
  });

  it('fills a measure without notes with a whole-measure rest on both staves', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[]] }] });

    // Act
    const notes = children(measuresOf(written(song))[0], 'note');

    // Assert
    expect(notes.map((note) => [attribute(child(note, 'rest'), 'measure'), childText(note, 'duration'), childText(note, 'staff')])).toEqual([
      ['yes', '4', '1'],
      ['yes', '4', '2'],
    ]);
  });
});
