import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import { durationTicks } from '../src/model/defaults';
import { readSong } from '../src/read-song';
import { fromTux, toTux } from './helpers/ticks';
import { assertSongInvariants } from './helpers/invariants';
import {
  DIVISIONS_1,
  beatsOf,
  firstTrack,
  measureXml,
  onePart,
  pitchOf,
  pitchedNote,
  quarter,
  readXml,
  scoreXml,
  tabQuarter,
  voiceNotes,
} from './helpers/musicxml-snippets';

describe('readMusicXml basics', () => {
  it('reads a one-part score into a track with standard tuning, notes on the strings that hold them lowest', () => {
    // Arrange
    const xml = scoreXml([
      {
        name: 'Melody',
        measures: [
          '<attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>' +
            pitchedNote('E4', '<duration>2</duration><voice>1</voice><type>quarter</type>') +
            pitchedNote('F#4', '<duration>3</duration><voice>1</voice><type>quarter</type><dot/>') +
            '<note><rest/><duration>1</duration><voice>1</voice><type>eighth</type></note>',
        ],
      },
    ]);

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    expect(song.source).toEqual({ format: 'musicxml', version: '4.0' });
    expect(song.measureHeaders).toHaveLength(1);
    expect(song.measureHeaders[0]?.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(song.measureHeaders[0]?.tempo).toBe(120);
    const track = firstTrack(song);
    expect(track.name).toBe('Melody');
    expect(track.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(track.measures[0]?.keySignature).toBe(1);
    const beats = beatsOf(song);
    expect(beats.map((beat) => toTux(beat.start))).toEqual([960, 1920, 3360]);
    expect(beats.map((beat) => beat.voices[0]?.duration)).toEqual([
      { value: 4, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
      { value: 4, dotted: true, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
      { value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
    ]);
    expect(voiceNotes(song).map((notes) => notes.map((note) => [note.string, note.fret]))).toEqual([[[1, 0]], [[1, 2]], []]);
  });

  it('reads chords and a second voice after a backup, keeping every pitch on its own string', () => {
    // Arrange
    const xml = onePart(
      DIVISIONS_1 +
        pitchedNote('C5', '<duration>2</duration><voice>1</voice><type>half</type>') +
        pitchedNote('E5', '<chord/><duration>2</duration><voice>1</voice><type>half</type>') +
        pitchedNote('D5', '<duration>2</duration><voice>1</voice><type>half</type>') +
        '<backup><duration>4</duration></backup>' +
        pitchedNote('E3', '<duration>4</duration><voice>2</voice><type>whole</type>'),
    );

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    const track = firstTrack(song);
    const [first, second] = beatsOf(song);
    expect(first?.voices[0]?.notes.map((note) => pitchOf(track, note)).sort()).toEqual([72, 76]);
    expect(first?.voices[1]?.notes.map((note) => pitchOf(track, note))).toEqual([52]);
    expect(new Set(first?.voices.flatMap((voice) => voice.notes.map((note) => note.string))).size).toBe(3);
    expect(second?.voices[0]?.notes.map((note) => pitchOf(track, note))).toEqual([74]);
    expect(second?.voices[1]?.isEmpty).toBe(true);
  });

  it('reads tuplets from time-modification and fills a voice that starts late with rests', () => {
    // Arrange
    const xml = onePart(
      '<attributes><divisions>3</divisions></attributes>' +
        '<forward><duration>6</duration><voice>1</voice></forward>' +
        ['C4', 'D4', 'E4']
          .map((pitch) => pitchedNote(pitch, '<duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'))
          .join('') +
        pitchedNote('F4', '<duration>3</duration><voice>1</voice><type>quarter</type>'),
    );

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    const beats = beatsOf(song);
    expect(beats.map((beat) => toTux(beat.start) - 960)).toEqual([0, 1920, 2240, 2560, 2880]);
    expect(beats[0]?.voices[0]?.notes).toEqual([]);
    expect(durationTicks(beats[0]?.voices[0]?.duration ?? { value: 1, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } })).toBe(fromTux(1920));
    expect(beats[1]?.voices[0]?.duration.tuplet).toEqual({ enters: 3, times: 2 });
  });

  it('reads a combined time-modification as a tuplet inside a tuplet, the smaller one outside', () => {
    // Arrange
    const modified = (actual: number, normal: number) =>
      pitchedNote('E4', `<duration>1</duration><voice>1</voice><type>16th</type><time-modification><actual-notes>${actual}</actual-notes><normal-notes>${normal}</normal-notes></time-modification>`);
    const xml = onePart('<attributes><divisions>60</divisions></attributes>' + modified(15, 8) + modified(9, 4));

    // Act
    const durations = beatsOf(readXml(xml)).map((beat) => beat.voices[0]?.duration);

    // Assert
    expect(durations.map((duration) => [duration?.tuplet, duration?.innerTuplet])).toEqual([
      [{ enters: 3, times: 2 }, { enters: 5, times: 4 }],
      [{ enters: 3, times: 2 }, { enters: 3, times: 2 }],
    ]);
  });

  it('turns a sounding pitch written with a transposition into the sounding pitch', () => {
    // Arrange
    const xml = onePart(
      '<attributes><divisions>1</divisions><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>' +
        quarter('E3'),
    );

    // Act
    const song = readXml(xml);

    // Assert
    expect(voiceNotes(song)[0]?.map((note) => [note.string, note.fret])).toEqual([[6, 0]]);
  });

  it('reads the song information and each part as a track with its MIDI program, volume and pan', () => {
    // Arrange
    const header =
      '<work><work-title>Title &amp; More</work-title></work><identification><creator type="composer">Composer</creator>' +
      '<creator type="lyricist">Lyricist</creator><creator type="artist">Artist</creator><rights>Rights</rights>' +
      '<encoding><encoder>Encoder</encoder></encoding></identification>';
    const scorePart =
      '<score-instrument id="P1-I1"><instrument-name>Guitar</instrument-name></score-instrument>' +
      '<midi-instrument id="P1-I1"><midi-channel>3</midi-channel><midi-program>31</midi-program><volume>50</volume><pan>45</pan></midi-instrument>';
    const xml = scoreXml([{ name: 'Lead &#233;', scorePart, measures: [DIVISIONS_1 + quarter('E4')] }], header);

    // Act
    const song = readXml(xml);

    // Assert
    expect(song.info).toMatchObject({ title: 'Title & More', music: 'Composer', words: 'Lyricist', artist: 'Artist', copyright: 'Rights', transcriber: 'Encoder' });
    const track = firstTrack(song);
    expect(track.name).toBe('Lead é');
    const channel = song.channels.find((candidate) => candidate.id === track.channelId);
    expect(channel).toMatchObject({ program: 30, volume: 64, balance: 96, isPercussion: false });
  });

  it('reads a part on MIDI channel 10 as percussion, unpitched notes playing their instrument key', () => {
    // Arrange
    const scorePart =
      '<score-instrument id="P1-I36"><instrument-name>Kick</instrument-name></score-instrument>' +
      '<midi-instrument id="P1-I36"><midi-channel>10</midi-channel><midi-unpitched>36</midi-unpitched></midi-instrument>';
    const note = '<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><instrument id="P1-I36"/><voice>1</voice><type>quarter</type></note>';
    const xml = scoreXml([{ name: 'Drums', scorePart, measures: [DIVISIONS_1 + '<attributes><clef><sign>percussion</sign></clef></attributes>' + note] }]);

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    const track = firstTrack(song);
    expect(track.isPercussion).toBe(true);
    expect(song.channels.find((channel) => channel.id === track.channelId)?.isPercussion).toBe(true);
    expect(voiceNotes(song)[0]?.map((n) => n.fret)).toEqual([35]);
  });

  it('converts a score-timewise document to the same song as its partwise form', () => {
    // Arrange
    const content = DIVISIONS_1 + quarter('E4') + quarter('G4');
    const partwise = onePart(content);
    const timewise =
      '<score-timewise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
      `<measure number="1"><part id="P1">${content}</part></measure></score-timewise>`;

    // Act
    const fromTimewise = readXml(timewise);

    // Assert
    expect({ ...fromTimewise, source: undefined }).toEqual({ ...readXml(partwise), source: undefined });
  });
});

describe('readMusicXml tab staves', () => {
  it('takes the tuning and capo from staff-details and the string and fret from each note', () => {
    // Arrange
    const details =
      '<attributes><divisions>1</divisions><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>' +
      ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
        .map((p, i) => `<staff-tuning line="${i + 1}"><tuning-step>${p[0]}</tuning-step><tuning-octave>${p[1]}</tuning-octave></staff-tuning>`)
        .join('') +
      '<capo>2</capo></staff-details></attributes>';
    const xml = onePart(details + tabQuarter('A3', 4, 5) + tabQuarter('E2', 6, 0));

    // Act
    const song = readXml(xml);

    // Assert
    const track = firstTrack(song);
    expect(track.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 38]);
    expect(track.offset).toBe(2);
    expect(voiceNotes(song).map((notes) => notes.map((note) => [note.string, note.fret]))).toEqual([[[4, 5]], [[6, 0]]]);
  });

  it('pairs a notation staff with a tab staff: notes once, strings and frets from the tab staff', () => {
    // Arrange
    const attributes =
      '<attributes><divisions>1</divisions><staves>2</staves><clef number="1"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>' +
      '<clef number="2"><sign>TAB</sign></clef></attributes>';
    const notation = pitchedNote('A3', '<duration>4</duration><tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations>');
    const tab = pitchedNote('A3', '<duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff><notations><technical><string>4</string><fret>7</fret></technical></notations>');
    const notation2 = pitchedNote('A3', '<duration>4</duration><tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff>');
    const tab2 = pitchedNote('A3', '<duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff><notations><technical><string>4</string><fret>7</fret></technical></notations>');
    const xml = onePart(attributes + notation + '<backup><duration>4</duration></backup>' + tab, notation2 + '<backup><duration>4</duration></backup>' + tab2);

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    expect(beatsOf(song)).toHaveLength(1);
    expect(voiceNotes(song, 0)[0]?.map((note) => [note.string, note.fret, note.isTied])).toEqual([[4, 7, false]]);
    expect(voiceNotes(song, 1)[0]?.map((note) => [note.string, note.fret, note.isTied])).toEqual([[4, 7, true]]);
  });

  it('ties a written note to the same string and fret as the note it continues', () => {
    // Arrange
    const xml = onePart(
      DIVISIONS_1 + pitchedNote('G3', '<duration>4</duration><tie type="start"/><voice>1</voice><type>whole</type>'),
      pitchedNote('G3', '<duration>4</duration><tie type="stop"/><voice>1</voice><type>whole</type>'),
    );

    // Act
    const song = readXml(xml);

    // Assert
    const [first] = voiceNotes(song, 0)[0] ?? [];
    const [second] = voiceNotes(song, 1)[0] ?? [];
    expect(second).toMatchObject({ string: first?.string, fret: first?.fret, isTied: true });
  });
});

describe('readMusicXml measure headers', () => {
  it('reads repeats, endings, rehearsal marks and tempos', () => {
    // Arrange
    const xml = onePart(
      measureXml(
        DIVISIONS_1 +
          '<barline location="left"><repeat direction="forward"/></barline>' +
          '<direction><direction-type><rehearsal>A</rehearsal></direction-type><sound tempo="90"/></direction>' +
          quarter('E4'),
        1,
      ),
      measureXml(
        '<barline location="left"><ending number="1" type="start"/></barline>' +
          quarter('E4') +
          '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="3"/></barline>',
        2,
      ),
      measureXml(
        '<barline location="left"><ending number="2, 3" type="start"/></barline>' +
          '<direction><direction-type><metronome><beat-unit>eighth</beat-unit><per-minute>200</per-minute></metronome></direction-type></direction>' +
          quarter('E4') +
          '<barline location="right"><ending number="2, 3" type="discontinue"/></barline>',
        3,
      ),
      measureXml('<attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>' + quarter('E4'), 4),
    );

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    const headers = song.measureHeaders.map(({ repeatOpen, repeatClose, repeatAlternative, tempo, marker, timeSignature }) => ({
      repeatOpen,
      repeatClose,
      repeatAlternative,
      tempo,
      marker: marker?.title,
      time: `${timeSignature.numerator}/${timeSignature.denominator}`,
    }));
    expect(headers).toEqual([
      { repeatOpen: true, repeatClose: 0, repeatAlternative: 0, tempo: 90, marker: 'A', time: '4/4' },
      { repeatOpen: false, repeatClose: 2, repeatAlternative: 0b1, tempo: 90, marker: undefined, time: '4/4' },
      { repeatOpen: false, repeatClose: 0, repeatAlternative: 0b110, tempo: 100, marker: undefined, time: '4/4' },
      { repeatOpen: false, repeatClose: 0, repeatAlternative: 0, tempo: 100, marker: undefined, time: '6/8' },
    ]);
  });

  it('gives every track a measure for each measure of the longest part, a missing one a whole-measure rest', () => {
    // Arrange
    const xml = scoreXml([
      { name: 'A', measures: [DIVISIONS_1 + quarter('E4'), quarter('E4')] },
      { name: 'B', measures: [DIVISIONS_1 + quarter('E4')] },
    ]);

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    expect(song.tracks.map((track) => track.measures.length)).toEqual([2, 2]);
    const missing = beatsOf(song, 1, 1);
    expect(missing.map((beat) => [beat.voices[0]?.duration.value, beat.voices[0]?.notes.length, beat.voices[0]?.isEmpty])).toEqual([[1, 0, false]]);
  });
});

describe('readMusicXml input checks', () => {
  it('refuses malformed XML', () => {
    // Arrange
    const xml = onePart(DIVISIONS_1 + quarter('E4')).replace('</part>', '');

    // Act / Assert
    expect(() => readXml(xml)).toThrow(GpFormatError);
  });

  it('refuses a document type with an internal subset (entity declarations) but accepts the public MusicXML one', () => {
    // Arrange
    const body = onePart(DIVISIONS_1 + quarter('E4')).replace('<?xml version="1.0" encoding="UTF-8"?>\n', '');
    const external = `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"\n  "http://www.musicxml.org/dtds/partwise.dtd">${body}`;
    const internal = `<!DOCTYPE score-partwise [<!ENTITY boom "lol">]>${body.replace('Guitar', '&boom;')}`;

    // Act / Assert
    expect(firstTrack(readXml(external)).name).toBe('Guitar');
    expect(() => readXml(internal)).toThrow(/internal DTD subset/);
  });

  it('refuses a score without parts', () => {
    // Arrange
    const xml = '<score-partwise version="4.0"><part-list/></score-partwise>';

    // Act / Assert
    expect(() => readXml(xml)).toThrow(/no parts/);
  });

  it('refuses a part with more measures than the reader takes', () => {
    // Arrange
    const xml = onePart(...Array.from({ length: 5000 }, () => '<note><rest/><duration>1</duration></note>'));

    // Act / Assert
    expect(() => readXml(xml)).toThrow(/measures/);
  });

  it('ignores elements it does not know and keeps durations from a bad divisions value sane', () => {
    // Arrange
    const xml = onePart('<attributes><divisions>-3</divisions></attributes><print new-page="yes"/><mystery><x/></mystery>' + quarter('E4'));

    // Act
    const song = readXml(xml);

    // Assert
    assertSongInvariants(song);
    expect(voiceNotes(song)[0]?.map((note) => note.fret)).toEqual([0]);
  });

  it('reads UTF-16 documents with a byte order mark', () => {
    // Arrange
    const text = onePart(DIVISIONS_1 + quarter('E4')).replace('Guitar', 'Gitarre ä');
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes[2 + i * 2] = code & 0xff;
      bytes[3 + i * 2] = code >> 8;
    }

    // Act
    const song = readSong(bytes);

    // Assert
    expect(firstTrack(song).name).toBe('Gitarre ä');
  });
});
