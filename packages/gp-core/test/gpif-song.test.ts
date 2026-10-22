/**
 * GPIF → Song on small hand-written documents, for the cases the alphaTab fixtures do not reach.
 */
import { describe, expect, it } from 'vitest';
import { readGpifDocument } from '../src/formats/gpif/gpif-reader';
import { gpifToSong } from '../src/formats/gpif/gpif-to-song';
import type { GpifVersion } from '../src/formats/gpif/gpif-document';
import type { Beat, Song } from '../src/model/song';
import { assertSongInvariants } from './helpers/invariants';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} (length ${items.length})`);
  }
  return item;
}

interface Parts {
  readonly head?: string;
  readonly tracks?: string;
  readonly masterBars?: string;
  readonly bars?: string;
  readonly voices?: string;
  readonly beats?: string;
  readonly notes?: string;
  readonly rhythms?: string;
}

const TRACK = '<Track id="0"><Name>Guitar</Name><Color>1 2 3</Color>'
  + '<GeneralMidi><Program>30</Program><PrimaryChannel>0</PrimaryChannel><SecondaryChannel>1</SecondaryChannel></GeneralMidi>'
  + '<Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property></Properties></Track>';

const QUARTER = '<Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>';

function masterBar(bars: string, extra = ''): string {
  return `<MasterBar><Time>4/4</Time><Bars>${bars}</Bars>${extra}</MasterBar>`;
}

function note(id: number, string: number, fret: number, extra = ''): string {
  return `<Note id="${id}">${extra}<Properties><Property name="String"><String>${string}</String></Property>`
    + `<Property name="Fret"><Fret>${fret}</Fret></Property></Properties></Note>`;
}

function gpif(parts: Parts): string {
  return `<GPIF>${parts.head ?? ''}<Tracks>${parts.tracks ?? TRACK}</Tracks>`
    + `<MasterBars>${parts.masterBars ?? masterBar('0')}</MasterBars>`
    + `<Bars>${parts.bars ?? '<Bar id="0"><Voices>0 -1 -1 -1</Voices></Bar>'}</Bars>`
    + `<Voices>${parts.voices ?? '<Voice id="0"><Beats>0</Beats></Voice>'}</Voices>`
    + `<Beats>${parts.beats ?? '<Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>'}</Beats>`
    + `<Notes>${parts.notes ?? note(0, 0, 3)}</Notes>`
    + `<Rhythms>${parts.rhythms ?? QUARTER}</Rhythms></GPIF>`;
}

function toSong(parts: Parts, version: GpifVersion = 6): Song {
  const song = gpifToSong(readGpifDocument(gpif(parts), version), { format: 'gpx', version: 'test' });
  assertSongInvariants(song);
  return song;
}

function firstBeat(song: Song, measure = 0, track = 0): Beat {
  return at(at(at(song.tracks, track).measures, measure).beats, 0);
}

describe('gpifToSong: tracks and channels', () => {
  it('maps GP6 GeneralMidi channels, program, color and tuning', () => {
    // Act
    const song = toSong({});

    // Assert
    expect(song.channels).toEqual([
      { id: 1, name: 'Distortion Electric Guitar 1', program: 30, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false },
    ]);
    const track = at(song.tracks, 0);
    expect(track).toMatchObject({ number: 1, name: 'Guitar', channelId: 1, color: { r: 1, g: 2, b: 3 }, offset: 0, solo: false, mute: false });
    expect(track.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(at(firstBeat(song).voices, 0).notes.map((n) => [n.string, n.fret, n.velocity])).toEqual([[6, 3, 95]]);
  });

  it('shares one channel between tracks using the same primary MIDI channel', () => {
    const tracks = TRACK + TRACK.replace('id="0"', 'id="1"').replace('Guitar', 'Second');
    const song = toSong({ tracks, masterBars: masterBar('0 0') });
    expect(song.channels).toHaveLength(1);
    expect(song.tracks.map((t) => t.channelId)).toEqual([1, 1]);
  });

  it('gives GP6 tracks without MIDI channels the first free channels, skipping the percussion channel', () => {
    // Arrange
    const used = (id: number, primary: number) => `<Track id="${id}"><Name>T${id}</Name><GeneralMidi><Program>1</Program>`
      + `<PrimaryChannel>${primary}</PrimaryChannel><SecondaryChannel>${primary + 1}</SecondaryChannel></GeneralMidi></Track>`;
    const free = '<Track id="9"><Name>Free</Name><GeneralMidi><Program>2</Program></GeneralMidi></Track>';

    // Act
    const song = toSong({ tracks: used(0, 1) + used(1, 3) + used(2, 5) + used(3, 7) + free, masterBars: masterBar('0') });

    // Assert
    expect(song.channels).toHaveLength(5);
    expect(at(song.channels, 4).program).toBe(2);
    expect(at(song.tracks, 4).isPercussion).toBe(false);
  });

  it('detects GP6 percussion from MIDI channel 9: drum bank, program 0, six zero-tuned strings', () => {
    // Arrange
    const tracks = '<Track id="0"><Name>Drums</Name><GeneralMidi table="Percussion"><Program>5</Program>'
      + '<PrimaryChannel>9</PrimaryChannel><SecondaryChannel>9</SecondaryChannel></GeneralMidi></Track>';
    const notes = '<Note id="0"><Properties><Property name="Element"><Element>1</Element></Property>'
      + '<Property name="Variation"><Variation>0</Variation></Property></Properties></Note>';

    // Act
    const song = toSong({ tracks, notes });

    // Assert
    expect(at(song.channels, 0)).toMatchObject({ bank: 128, program: 0, isPercussion: true });
    const track = at(song.tracks, 0);
    expect(track.isPercussion).toBe(true);
    expect(track.strings.map((s) => s.tuning)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(at(firstBeat(song).voices, 0).notes.map((n) => [n.fret, n.string])).toEqual([[38, 1]]);
  });

  it('places percussion notes whose GPIF string is out of range by their fret (the MIDI pitch)', () => {
    // Arrange
    const tracks = '<Track id="0"><Name>Drums</Name><GeneralMidi><PrimaryChannel>9</PrimaryChannel><SecondaryChannel>9</SecondaryChannel></GeneralMidi></Track>';
    const notes = note(0, 6, 38) + note(1, -2, 36) + note(2, 0, 42);
    const beats = '<Beat id="0"><Rhythm ref="0"/><Notes>2 0 1</Notes></Beat>';

    // Act
    const song = toSong({ tracks, notes, beats });

    // Assert
    expect(at(firstBeat(song).voices, 0).notes.map((n) => [n.fret, n.string])).toEqual([[42, 6], [38, 1], [36, 2]]);
  });

  it('uses standard tuning when a melodic track has no tuning property', () => {
    const tracks = '<Track id="0"><Name>X</Name><GeneralMidi><PrimaryChannel>0</PrimaryChannel><SecondaryChannel>1</SecondaryChannel></GeneralMidi></Track>';
    const song = toSong({ tracks });
    expect(at(song.tracks, 0).strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(at(song.tracks, 0).color).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('reads capo, playback state, volume/pan and the first non-empty lyrics line', () => {
    // Arrange
    const tracks = TRACK.replace('</Properties>', '<Property name="CapoFret"><Fret>2</Fret></Property></Properties>')
      .replace('<Color>', '<PlaybackState>Solo</PlaybackState><RSE><ChannelStrip><Parameters>0 0 0 0 0 0 0 0 0 0 0 0.25 0.5 0</Parameters></ChannelStrip></RSE>'
        + '<Lyrics><Line><Text><![CDATA[]]></Text><Offset>0</Offset></Line><Line><Text><![CDATA[la la]]></Text><Offset>2</Offset></Line></Lyrics><Color>');

    // Act
    const song = toSong({ tracks });

    // Assert
    const track = at(song.tracks, 0);
    expect(track.offset).toBe(2);
    expect(track.solo).toBe(true);
    expect(track.mute).toBe(false);
    expect(track.lyrics).toEqual({ from: 3, text: 'la la' });
    expect(at(song.channels, 0)).toMatchObject({ volume: 64, balance: 32 });
  });

  it('GP7: guesses a drum track without MIDI channels from its instrument set', () => {
    // Arrange
    const tracks = '<Track id="0"><Name>D</Name><InstrumentSet><Name>Drums</Name><Type>drumKit</Type></InstrumentSet>'
      + '<Sounds><Sound><MIDI><Program>0</Program></MIDI></Sound></Sounds><PlaybackState>Mute</PlaybackState></Track>'
      + '<Track id="1"><Name>G</Name><Sounds><Sound><MIDI><LSB>3</LSB><MSB>1</MSB><Program>27</Program></MIDI></Sound>'
      + '<Sound><MIDI><Program>99</Program></MIDI></Sound></Sounds>'
      + '<Staves><Staff><Properties><Property name="Tuning"><Pitches>40 45 50 55</Pitches></Property></Properties></Staff></Staves></Track>';

    // Act
    const song = toSong({ tracks, masterBars: masterBar('0 0') }, 7);

    // Assert
    expect(song.tracks.map((t) => [t.isPercussion, t.mute])).toEqual([[true, true], [false, false]]);
    expect(at(song.channels, 1)).toMatchObject({ program: 27, bank: 131, isPercussion: false });
    expect(at(song.tracks, 1).strings.map((s) => s.tuning)).toEqual([55, 50, 45, 40]);
  });
});

describe('gpifToSong: master bars', () => {
  it('converts tempo references and carries the last tempo of a bar into the next bars', () => {
    // Arrange
    const automation = (bar: number, position: number, value: string) =>
      `<Automation><Type>Tempo</Type><Bar>${bar}</Bar><Position>${position}</Position><Value>${value}</Value></Automation>`;
    const head = '<MasterTrack><Automations>'
      + automation(0, 0, '100 1') + automation(1, 0, '100 3') + automation(2, 0, '100 4') + automation(3, 0, '100 5')
      + automation(4, 0, '90 2') + automation(4, 0.5, '140 2') + automation(6, 0, '77') + '</Automations></MasterTrack>';
    const bars = Array.from({ length: 7 }, () => masterBar('0')).join('');

    // Act
    const song = toSong({ head, masterBars: bars });

    // Assert
    expect(song.measureHeaders.map((h) => h.tempo)).toEqual([50, 150, 200, 300, 90, 140, 140]);
  });

  it('defaults to 120 bpm, keeps triplet feel, markers, clefs and ignores out-of-range key signatures', () => {
    // Arrange
    const bars = masterBar('0', '<TripletFeel>Triplet8th</TripletFeel><Key><AccidentalCount>-9</AccidentalCount></Key>'
      + '<Section><Letter>A</Letter><Text>\n Verse \n</Text></Section>')
      + masterBar('1', '<TripletFeel>Triplet16th</TripletFeel><Key><AccidentalCount>3</AccidentalCount></Key>')
      + masterBar('2', '<TripletFeel>Dotted8th</TripletFeel><Section><Text></Text></Section>')
      + masterBar('3') + masterBar('4');
    const clefs = ['F4', 'C3', 'C4', 'Neutral', 'G2'];
    const barXml = clefs.map((clef, i) => `<Bar id="${i}"><Clef>${clef}</Clef><Voices>-1 -1 -1 -1</Voices></Bar>`).join('');

    // Act
    const song = toSong({ masterBars: bars, bars: barXml });

    // Assert
    expect(song.measureHeaders.map((h) => [h.tempo, h.tripletFeel])).toEqual([
      [120, 'eighth'],
      [120, 'sixteenth'],
      [120, 'none'],
      [120, 'none'],
      [120, 'none'],
    ]);
    expect(at(song.measureHeaders, 0).marker).toEqual({ title: 'Verse', color: { r: 255, g: 0, b: 0 } });
    expect(at(song.measureHeaders, 2).marker).toBeUndefined();
    const measures = at(song.tracks, 0).measures;
    expect(measures.map((m) => m.clef)).toEqual(['bass', 'alto', 'tenor', 'neutral', 'treble']);
    expect(measures.map((m) => m.keySignature)).toEqual([0, 3, 0, 0, 0]);
  });

  it('falls back to 4/4 for invalid time signatures and ignores invalid alternate endings', () => {
    const bars = '<MasterBar><Time>3/5</Time><Bars>0</Bars><AlternateEndings>0 2</AlternateEndings></MasterBar>';
    const header = at(toSong({ masterBars: bars }).measureHeaders, 0);
    expect(header.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(header.repeatAlternative).toBe(0b10);
  });

  it('leaves a measure empty when its bar or voices are missing', () => {
    const song = toSong({ masterBars: masterBar('7'), voices: '<Voice id="5"><Beats>0</Beats></Voice>' });
    expect(at(at(song.tracks, 0).measures, 0).beats).toEqual([]);
  });

  it('stops following simile marks that point before the first bar', () => {
    const bars = '<Bar id="0"><SimileMark>Simple</SimileMark><Voices>0 -1 -1 -1</Voices></Bar>';
    const song = toSong({ bars });
    expect(at(at(song.tracks, 0).measures, 0).beats).toEqual([]);
  });
});

describe('gpifToSong: beats and notes', () => {
  it('maps dynamics to TuxGuitar velocities', () => {
    // Arrange
    const dynamics = ['PPP', 'PP', 'P', 'MP', 'MF', 'F', 'FF', 'FFF', 'XX'];
    const beats = dynamics.map((d, i) => `<Beat id="${i}"><Dynamic>${d}</Dynamic><Rhythm ref="0"/><Notes>0</Notes></Beat>`).join('');
    const voices = `<Voice id="0"><Beats>${dynamics.map((_, i) => i).join(' ')}</Beats></Voice>`;

    // Act
    const song = toSong({ beats, voices });

    // Assert
    const velocities = at(at(song.tracks, 0).measures, 0).beats.map((b) => b.voices[0]?.notes[0]?.velocity);
    expect(velocities).toEqual([15, 31, 47, 63, 79, 95, 111, 127, 95]);
  });

  it('ignores names from the file that match built-in object properties', () => {
    // Arrange: names such as "constructor" must fall back to the defaults, not hit Object.prototype
    const rhythms = '<Rhythm id="0"><NoteValue>constructor</NoteValue></Rhythm>';
    const bars = '<Bar id="0"><Clef>toString</Clef><SimileMark>constructor</SimileMark><Voices>0 -1 -1 -1</Voices></Bar>';
    const beats = '<Beat id="0"><Dynamic>constructor</Dynamic><Rhythm ref="0"/><Notes>0</Notes></Beat>';
    const notes = '<Note id="0"><Properties><Property name="String"><String>0</String></Property>'
      + '<Property name="Fret"><Fret>3</Fret></Property>'
      + '<Property name="HarmonicType"><HType>__proto__</HType></Property></Properties></Note>';

    // Act
    const song = toSong({ rhythms, bars, beats, notes });

    // Assert
    const measure = at(at(song.tracks, 0).measures, 0);
    const voice = at(measure.beats, 0).voices[0];
    expect(voice?.duration.value).toBe(4);
    expect(voice?.notes[0]?.velocity).toBe(95);
    expect(voice?.notes[0]?.effect.harmonic?.type).toBe('natural'); // unknown harmonic names are natural, as in TuxGuitar
    expect(measure.clef).toBe('treble');
  });

  it('reads note values, dots, tuplets and keeps four voice slots', () => {
    // Arrange
    const rhythms = '<Rhythm id="0"><NoteValue>Eighth</NoteValue><AugmentationDot count="2"/></Rhythm>'
      + '<Rhythm id="1"><NoteValue>16th</NoteValue><PrimaryTuplet num="5" den="4"/></Rhythm>'
      + '<Rhythm id="2"><NoteValue>Long</NoteValue></Rhythm>';
    const beats = '<Beat id="0"><Rhythm ref="0"/></Beat><Beat id="1"><Rhythm ref="1"/></Beat>'
      + '<Beat id="2"><Rhythm ref="2"/></Beat><Beat id="3"><Rhythm ref="42"/></Beat>';
    const voices = '<Voice id="0"><Beats>0 1</Beats></Voice><Voice id="1"><Beats>2 3</Beats></Voice>';
    const bars = '<Bar id="0"><Voices>-1 0 -1 1 0</Voices></Bar>';

    // Act
    const song = toSong({ rhythms, beats, voices, bars });

    // Assert
    const measure = at(at(song.tracks, 0).measures, 0);
    expect(measure.beats.map((b) => b.start)).toEqual([960, 960 + 840, 960 + 3840]);
    const first = at(measure.beats, 0);
    expect(first.voices.map((v) => v.isEmpty)).toEqual([true, false, true, false]);
    expect(at(first.voices, 1).duration).toEqual({ value: 8, dotted: false, doubleDotted: true, tuplet: { enters: 1, times: 1 } });
    expect(at(first.voices, 3).duration.value).toBe(1);
    expect(at(measure.beats, 1).voices.map((v) => v.isEmpty)).toEqual([true, false, true, true]);
    expect(at(at(measure.beats, 1).voices, 1).duration.tuplet).toEqual({ enters: 5, times: 4 });
    expect(at(measure.beats, 2).voices.map((v) => v.isEmpty)).toEqual([true, true, true, false]);
    expect(at(at(measure.beats, 2).voices, 3).duration.value).toBe(4);
  });

  it('places notes without string/fret on the first free string able to play the MIDI pitch', () => {
    // Arrange
    const notes = '<Note id="0"><Properties><Property name="Midi"><Number>67</Number></Property></Properties></Note>'
      + '<Note id="1"><Properties><Property name="Tone"><Step>7</Step></Property><Property name="Octave"><Number>6</Number></Property></Properties></Note>'
      + '<Note id="2"><Properties><Property name="Midi"><Number>10</Number></Property></Properties></Note>';
    const beats = '<Beat id="0"><Rhythm ref="0"/><Notes>0 1 2 9</Notes></Beat>';

    // Act
    const song = toSong({ notes, beats });

    // Assert
    expect(at(firstBeat(song).voices, 0).notes.map((n) => [n.string, n.fret])).toEqual([[1, 3], [2, 8]]);
  });

  it('applies the last of several grace beats to the matching string of the next beat', () => {
    // Arrange
    const notes = note(0, 0, 5) + note(1, 0, 7) + note(2, 0, 9)
      + '<Note id="3"><Properties><Property name="String"><String>1</String></Property><Property name="Fret"><Fret>1</Fret></Property>'
      + '<Property name="Slide"><Flags>2</Flags></Property><Property name="Muted"><Enable/></Property></Properties></Note>';
    const rhythms = QUARTER + '<Rhythm id="1"><NoteValue>32nd</NoteValue></Rhythm><Rhythm id="2"><NoteValue>16th</NoteValue></Rhythm>';
    const beats = '<Beat id="0"><GraceNotes>BeforeBeat</GraceNotes><Rhythm ref="1"/><Notes>0</Notes></Beat>'
      + '<Beat id="1"><GraceNotes>OnBeat</GraceNotes><Dynamic>PP</Dynamic><Rhythm ref="2"/><Notes>1 3</Notes></Beat>'
      + '<Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>'
      + '<Beat id="3"><GraceNotes>OnBeat</GraceNotes><Rhythm ref="1"/><Notes>3</Notes></Beat>'
      + '<Beat id="4"><Rhythm ref="0"/><Notes>2</Notes></Beat>'
      + '<Beat id="5"><GraceNotes>OnBeat</GraceNotes><Rhythm ref="1"/><Notes>3</Notes></Beat>';
    const voices = '<Voice id="0"><Beats>0 1 2 3 4 5</Beats></Voice>';

    // Act
    const song = toSong({ notes, rhythms, beats, voices });

    // Assert
    const measure = at(at(song.tracks, 0).measures, 0);
    // Two quarter notes in a 4/4 first bar: right-aligned like an anacrusis.
    expect(measure.beats.map((b) => b.start)).toEqual([2880, 3840]);
    expect(at(at(at(measure.beats, 0).voices, 0).notes, 0).effect.grace).toEqual({
      fret: 7, duration: 3, velocity: 31, transition: 'none', onBeat: true, isDead: false,
    });
    expect(at(at(at(measure.beats, 1).voices, 0).notes, 0).effect.grace).toBeUndefined();
  });

  it('derives grace transitions and dead grace notes', () => {
    // Arrange
    const props = (extra: string) => `<Properties><Property name="String"><String>0</String></Property><Property name="Fret"><Fret>2</Fret></Property>${extra}</Properties>`;
    const notes = `<Note id="0">${props('<Property name="Bended"><Enable/></Property>')}</Note>`
      + `<Note id="1">${props('<Property name="Slide"><Flags>1</Flags></Property><Property name="Muted"><Enable/></Property>')}</Note>`
      + `<Note id="2">${props('<Property name="HopoOrigin"><Enable/></Property>')}</Note>`
      + note(3, 0, 4);
    const rhythms = QUARTER + '<Rhythm id="1"><NoteValue>64th</NoteValue></Rhythm>';
    const beats = [0, 1, 2].map((n) => `<Beat id="${n * 2}"><GraceNotes>BeforeBeat</GraceNotes><Rhythm ref="1"/><Notes>${n}</Notes></Beat>`
      + `<Beat id="${n * 2 + 1}"><Rhythm ref="0"/><Notes>3</Notes></Beat>`).join('');
    const voices = '<Voice id="0"><Beats>0 1 2 3 4 5</Beats></Voice>';

    // Act
    const song = toSong({ notes, rhythms, beats, voices });

    // Assert
    const graces = at(at(song.tracks, 0).measures, 0).beats.map((b) => b.voices[0]?.notes[0]?.effect.grace);
    expect(graces.map((g) => [g?.transition, g?.isDead, g?.duration])).toEqual([
      ['bend', false, 1],
      ['slide', true, 1],
      ['hammer', false, 1],
    ]);
  });

  it('reads accent bitmasks, ghost notes, ties, let ring, tapping and fade in', () => {
    // Arrange
    const notes = '<Note id="0"><Accent>13</Accent><AntiAccent>Normal</AntiAccent><Tie origin="false" destination="true"/><LetRing/>'
      + '<Properties><Property name="String"><String>0</String></Property><Property name="Fret"><Fret>0</Fret></Property>'
      + '<Property name="Tapped"><Enable/></Property></Properties></Note>';
    const beats = '<Beat id="0"><Fadding>FadeIn</Fadding><Rhythm ref="0"/><Notes>0</Notes><FreeText>  hi  </FreeText></Beat>';

    // Act
    const song = toSong({ notes, beats });

    // Assert
    const beat = firstBeat(song);
    expect(beat.text).toBe('hi');
    const n = at(at(beat.voices, 0).notes, 0);
    expect(n.isTied).toBe(true);
    expect(n.effect).toMatchObject({
      staccato: true,
      heavyAccentuatedNote: true,
      accentuatedNote: true,
      ghostNote: true,
      letRing: true,
      tapping: true,
      fadeIn: true,
    });
  });

  it('reads vibrato strengths: Wide is wide vibrato, any other strength slight, the wider of note and whammy bar wins', () => {
    // Arrange
    const whammy = (strength: string) => `<Properties><Property name="VibratoWTremBar">${strength}</Property></Properties>`;
    const beats = [
      `<Beat id="0"><Rhythm ref="0"/><Notes>0 1</Notes></Beat>`,
      `<Beat id="1"><Rhythm ref="0"/><Notes>2</Notes>${whammy('<Strength> wide </Strength>')}</Beat>`,
      `<Beat id="2"><Rhythm ref="0"/><Notes>3</Notes>${whammy('')}</Beat>`,
      `<Beat id="3"><Rhythm ref="0"/><Notes>4</Notes>${whammy('<Strength>Slight</Strength>')}</Beat>`,
    ].join('');
    const notes = [
      note(0, 0, 3, '<Vibrato>Wide</Vibrato>'),
      note(1, 1, 3, '<Vibrato>Slight</Vibrato>'),
      note(2, 0, 3, '<Vibrato>Slight</Vibrato>'),
      note(3, 0, 3),
      note(4, 0, 3, '<Vibrato/>'),
    ].join('');
    const voices = '<Voice id="0"><Beats>0 1 2 3</Beats></Voice>';

    // Act
    const song = toSong({ beats, notes, voices });

    // Assert
    const measure = at(at(song.tracks, 0).measures, 0);
    const kinds = measure.beats.flatMap((beat) => at(beat.voices, 0).notes.map((n) => [n.effect.vibrato, n.effect.wideVibrato]));
    expect(kinds).toEqual([
      [false, true],
      [true, false],
      [false, true],
      [true, false],
      [true, false],
    ]);
  });

  it('maps brush durations to stroke values and keeps the first voice stroke', () => {
    // Arrange
    const brush = (dir: string, ticks?: number) => `<Properties><Property name="Brush"><Direction>${dir}</Direction></Property></Properties>`
      + (ticks === undefined ? '' : `<XProperties><XProperty id="687935489"><Int>${ticks}</Int></XProperty></XProperties>`);
    const beats = `<Beat id="0"><Rhythm ref="0"/>${brush('Down', 480)}</Beat><Beat id="1"><Rhythm ref="0"/>${brush('Up')}</Beat>`
      + `<Beat id="2"><Rhythm ref="0"/>${brush('Up', 5)}</Beat><Beat id="3"><Rhythm ref="0"/></Beat>`;
    const voices = '<Voice id="0"><Beats>0 1 2</Beats></Voice><Voice id="1"><Beats>3</Beats></Voice>';
    const bars = '<Bar id="0"><Voices>0 1 -1 -1</Voices></Bar>';

    // Act
    const beatsOut = at(at(toSong({ beats, voices, bars }).tracks, 0).measures, 0).beats;

    // Assert
    expect(beatsOut.map((b) => b.stroke)).toEqual([
      { direction: 'down', value: 4 },
      { direction: 'up', value: 32 },
      { direction: 'up', value: 128 },
    ]);
  });

  it('builds trills from the MIDI pitch and the trill speed in GP ticks', () => {
    // Arrange
    const notes = '<Note id="0"><Trill>66</Trill><Properties><Property name="String"><String>0</String></Property>'
      + '<Property name="Fret"><Fret>2</Fret></Property><Property name="Midi"><Number>42</Number></Property></Properties>'
      + '<XProperties><XProperty id="688062467"><Int>180</Int></XProperty></XProperties></Note>'
      + '<Note id="1"><Trill>47</Trill><Properties><Property name="String"><String>0</String></Property>'
      + '<Property name="Fret"><Fret>2</Fret></Property></Properties></Note>';
    const beats = '<Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat><Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>';
    const voices = '<Voice id="0"><Beats>0 1</Beats></Voice>';

    // Act
    const trills = at(at(toSong({ notes, beats, voices }).tracks, 0).measures, 0).beats.map((b) => b.voices[0]?.notes[0]?.effect.trill);

    // Assert
    expect(at(trills, 0)).toEqual({ fret: 26, duration: { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } } });
    expect(at(trills, 1)?.fret).toBe(7);
    expect(at(trills, 1)?.duration).toEqual({ value: 64, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } });
  });

  it('reads chords from the diagram collection, falling back to the chord collection', () => {
    // Arrange
    const tracks = TRACK.replace('</Properties>', '<Property name="DiagramCollection"><Items><Item id="1" name="E">'
      + '<Diagram stringCount="6" baseFret="0"><Fret string="0" fret="0"/><Fret string="1" fret="2"/><Fret string="9" fret="2"/></Diagram></Item></Items></Property>'
      + '<Property name="ChordCollection"><Items><Item id="2" name="Am"><Chord/></Item><Item id="1" name="ignored"/></Items></Property></Properties>');
    const beats = '<Beat id="0"><Chord>1</Chord><Rhythm ref="0"/></Beat><Beat id="1"><Chord>2</Chord><Rhythm ref="0"/></Beat>'
      + '<Beat id="2"><Chord>3</Chord><Rhythm ref="0"/></Beat>';
    const voices = '<Voice id="0"><Beats>0 1 2</Beats></Voice>';

    // Act
    const beatsOut = at(at(toSong({ tracks, beats, voices }).tracks, 0).measures, 0).beats;

    // Assert
    expect(beatsOut.map((b) => b.chord)).toEqual([
      { name: 'E', firstFret: 1, frets: [-1, -1, -1, -1, 2, 0] },
      { name: 'Am', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] },
      undefined,
    ]);
  });

  it('bounds a corrupt diagram stringCount instead of allocating it', () => {
    // Arrange
    const tracks = TRACK.replace('</Properties>', '<Property name="DiagramCollection"><Items><Item id="1" name="X">'
      + '<Diagram stringCount="2000000000" baseFret="0"><Fret string="0" fret="3"/></Diagram></Item></Items></Property></Properties>');
    const beats = '<Beat id="0"><Chord>1</Chord><Rhythm ref="0"/></Beat>';

    // Act
    const chord = at(at(at(toSong({ tracks, beats }).tracks, 0).measures, 0).beats, 0).chord;

    // Assert
    expect(chord?.frets.length).toBeLessThanOrEqual(25);
    expect(chord?.frets[chord.frets.length - 1]).toBe(3);
  });

  it('clamps whammy values to two octaves and drops notes on strings the track does not have', () => {
    // Arrange
    const beats = '<Beat id="0"><Rhythm ref="0"/><Notes>0 1</Notes><Properties><Property name="WhammyBar"><Enable/></Property>'
      + '<Property name="WhammyBarOriginValue"><Float>-900</Float></Property>'
      + '<Property name="WhammyBarDestinationValue"><Float>900</Float></Property>'
      + '<Property name="WhammyBarOriginOffset"><Float>10</Float></Property>'
      + '<Property name="WhammyBarDestinationOffset"><Float>80</Float></Property></Properties></Beat>';
    const notes = note(0, 0, 1) + note(1, 7, 1);

    // Act
    const notesOut = at(firstBeat(toSong({ beats, notes })).voices, 0).notes;

    // Assert
    expect(notesOut).toHaveLength(1);
    expect(at(notesOut, 0).effect.tremoloBar?.points).toEqual([
      { position: 0, value: -24 },
      { position: 1, value: -24 },
      { position: 10, value: 24 },
      { position: 12, value: 24 },
    ]);
  });

  it('applies the bend middle point rules of TuxGuitar', () => {
    // Arrange
    const bend = (name: string, value: number) => `<Property name="${name}"><Float>${value}</Float></Property>`;
    const notes = '<Note id="0"><Properties><Property name="String"><String>0</String></Property><Property name="Fret"><Fret>1</Fret></Property>'
      + '<Property name="Bended"><Enable/></Property>' + bend('BendOriginValue', 0) + bend('BendMiddleValue', 100)
      + bend('BendDestinationValue', 50) + bend('BendMiddleOffset1', 12) + bend('BendMiddleOffset2', 40)
      + bend('BendDestinationOffset', 90) + '</Properties></Note>'
      + '<Note id="1"><Properties><Property name="String"><String>1</String></Property><Property name="Fret"><Fret>1</Fret></Property>'
      + '<Property name="Bended"><Enable/></Property>' + bend('BendOriginValue', 0) + '</Properties></Note>';
    const beats = '<Beat id="0"><Rhythm ref="0"/><Notes>0 1</Notes></Beat>';

    // Act
    const notesOut = at(firstBeat(toSong({ notes, beats })).voices, 0).notes;

    // Assert
    expect(at(notesOut, 0).effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 5, value: 4 },
      { position: 11, value: 2 },
      { position: 12, value: 2 },
    ]);
    expect(at(notesOut, 1).effect.bend).toBeUndefined();
  });
});
