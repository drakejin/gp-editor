import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { joinVoices, normalizeSong } from '../src/formats/gtp/normalize';
import {
  type Beat,
  type Bend,
  type Channel,
  DEFAULT_CHANNEL,
  type Duration,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  type Measure,
  type MeasureHeader,
  NO_STROKE,
  NORMAL_TUPLET,
  type Note,
  QUARTER,
  readSong,
  type Song,
  type Track,
  type Voice,
} from '../src/index';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function duration(value: Duration['value']): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

function note(fret: number, string: number): Note {
  return { fret, string, velocity: 95, isTied: false, effect: EMPTY_NOTE_EFFECT };
}

const EMPTY_VOICE: Voice = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' };

function voice(value: Duration['value'], notes: readonly Note[]): Voice {
  return { duration: duration(value), notes, isEmpty: false, direction: 'none' };
}

function beat(start: number, voices: readonly Voice[]): Beat {
  return { start, voices, stroke: NO_STROKE, pickStroke: 'none' };
}

const HEADER: MeasureHeader = {
  number: 1,
  start: 960,
  timeSignature: { numerator: 4, denominator: 4 },
  tempo: 120,
  repeatOpen: false,
  repeatClose: 0,
  repeatAlternative: 0,
  tripletFeel: 'none',
};

function measure(beats: readonly Beat[], keySignature = 0): Measure {
  return { headerIndex: 0, clef: 'treble', keySignature, beats };
}

function channel(id: number, overrides: Partial<Channel> = {}): Channel {
  return { ...DEFAULT_CHANNEL, id, name: `Channel ${id}`, ...overrides };
}

function track(number: number, channelId: number, measures: readonly Measure[]): Track {
  return {
    number,
    name: `Track ${number}`,
    channelId,
    strings: [{ number: 1, tuning: 64 }],
    color: { r: 255, g: 0, b: 0 },
    offset: 0,
    isPercussion: false,
    solo: false,
    mute: false,
    measures,
  };
}

function song(channels: readonly Channel[], tracks: readonly Track[]): Song {
  return {
    source: { format: 'gp3', version: 'test' },
    info: EMPTY_SONG_INFO,
    channels,
    measureHeaders: [HEADER],
    tracks,
  };
}

describe('normalizeSong', () => {
  it('gives percussion channels program 0 and marks their tracks as percussion', () => {
    // Arrange
    const input = deepFreeze(
      song(
        [channel(1), channel(2, { bank: 128, program: 30, isPercussion: true })],
        [track(1, 1, [measure([], 3)]), track(2, 2, [measure([], 3)])],
      ),
    );

    // Act
    const result = normalizeSong(input);

    // Assert
    expect(result.channels[0]).toEqual(input.channels[0]);
    expect(result.channels[1]).toMatchObject({ bank: 128, program: 0, isPercussion: true });
    expect(result.tracks[0]).toMatchObject({ isPercussion: false, measures: [{ keySignature: 3 }] });
    expect(result.tracks[1]).toMatchObject({ isPercussion: true, measures: [{ keySignature: 0 }] });
    expect(result).not.toBe(input);
  });

  it('treats a channel with bank 128 as percussion even when the flag is unset', () => {
    const result = normalizeSong(song([channel(1, { bank: 128, program: 5 })], [track(1, 1, [measure([])])]));

    expect(result.channels[0]).toMatchObject({ bank: 128, program: 0, isPercussion: true });
    expect(result.tracks[0]?.isPercussion).toBe(true);
  });

  it('moves channels routed to GM channel 9 onto the percussion bank', () => {
    // Arrange
    const input = song([channel(1), channel(2)], [track(1, 1, [measure([])]), track(2, 2, [measure([])])]);
    const gmChannels = new Map([
      [1, 0],
      [2, 9],
    ]);

    // Act
    const result = normalizeSong(input, gmChannels);

    // Assert
    expect(result.channels[0]).toMatchObject({ bank: 0, program: 25, isPercussion: false });
    expect(result.channels[1]).toMatchObject({ bank: 128, program: 0, isPercussion: true });
    expect(result.tracks.map((candidate) => candidate.isPercussion)).toEqual([false, true]);
  });

  it('is idempotent', () => {
    const input = song([channel(1, { bank: 128 })], [track(1, 1, [measure([], 2)])]);

    const once = normalizeSong(input);

    expect(normalizeSong(once)).toEqual(once);
  });
});

describe('joinVoices', () => {
  it('merges the notes of every voice into the first voice', () => {
    // Arrange
    const input = deepFreeze(
      measure([beat(960, [voice(1, [note(1, 1)]), voice(1, [note(2, 2)])])]),
    );

    // Act
    const result = joinVoices(input, HEADER);

    // Assert
    expect(result.beats).toHaveLength(1);
    expect(result.beats[0]?.voices[0]?.notes.map((candidate) => candidate.fret)).toEqual([1, 2]);
    expect(result.beats[0]?.voices[0]?.duration.value).toBe(1);
  });

  it('orders beats by start', () => {
    const input = measure([beat(2880, [voice(2, [note(2, 1)]), EMPTY_VOICE]), beat(960, [voice(2, [note(1, 1)]), EMPTY_VOICE])]);

    const result = joinVoices(input, HEADER);

    expect(result.beats.map((candidate) => candidate.start)).toEqual([960, 2880]);
  });

  it('shortens a beat that overlaps the next one', () => {
    // Arrange: a whole note at 960, then a half note one quarter later
    const input = measure([
      beat(960, [voice(1, [note(1, 1)]), EMPTY_VOICE]),
      beat(1920, [voice(2, [note(2, 1)]), EMPTY_VOICE]),
    ]);

    // Act
    const result = joinVoices(input, HEADER);

    // Assert
    expect(result.beats.map((candidate) => candidate.voices[0]?.duration.value)).toEqual([4, 2]);
  });

  it('prefers the longest voice duration that ends before the next beat', () => {
    // Arrange: voice 2 holds a dotted quarter that ends exactly where the next beat starts
    const dottedQuarter: Voice = { ...voice(4, [note(5, 2)]), duration: { ...duration(4), dotted: true } };
    const input = measure([
      beat(960, [voice(1, [note(1, 1)]), dottedQuarter]),
      beat(2400, [EMPTY_VOICE, voice(8, [note(2, 2)])]),
    ]);

    // Act
    const result = joinVoices(input, HEADER);

    // Assert
    expect(result.beats[0]?.voices[0]?.duration).toMatchObject({ value: 4, dotted: true });
    expect(result.beats[0]?.voices[0]?.notes.map((candidate) => candidate.fret)).toEqual([1, 5]);
    expect(result.beats[1]?.voices[0]?.notes.map((candidate) => candidate.fret)).toEqual([2]);
  });

  it('drops beats whose first voice stays empty and rests that would overlap', () => {
    const input = measure([
      beat(960, [voice(2, [note(1, 1)]), EMPTY_VOICE]),
      beat(1440, [EMPTY_VOICE, EMPTY_VOICE]),
      beat(1920, [voice(4, []), EMPTY_VOICE]),
      beat(2880, [voice(2, [note(3, 1)]), EMPTY_VOICE]),
    ]);

    const result = joinVoices(input, HEADER);

    expect(result.beats.map((candidate) => candidate.start)).toEqual([960, 2880]);
  });

  it('cuts the last beat at the end of the measure', () => {
    const input = measure([beat(2880, [voice(1, [note(1, 1)]), EMPTY_VOICE])]);

    const result = joinVoices(input, HEADER);

    expect(result.beats[0]?.voices[0]?.duration.value).toBe(2);
  });

  it('falls back to the shortest duration for gaps shorter than a 64th', () => {
    const input = measure([beat(4790, [voice(4, [note(1, 1)]), EMPTY_VOICE])]);

    const result = joinVoices(input, HEADER);

    expect(result.beats[0]?.voices[0]?.duration).toEqual({
      value: 64,
      dotted: false,
      doubleDotted: false,
      tuplet: { enters: 7, times: 4 },
    });
  });
});

// ---------------------------------------------------------------- TuxGuitar golden output
// TuxGuitar's GTPInputStream.read() is readSong() followed by GTPSongNormalizer. The hashes below are of
// a text dump of TuxGuitar's result (GP3/4/5InputStream, charset Cp1252, beats sorted by start as
// TuxGuitar sorts them before use): one line per channel, header, track, measure and beat, with every
// note and effect. dumpLikeTuxGuitar prints our song in that format, converted back to TuxGuitar's
// encodings. Channel names are left out (TuxGuitar takes them from its translated message bundle).

const TUXGUITAR_DUMP_SHA256: ReadonlyMap<string, string> = new Map([
  ['accentuations.gp3', '6e1e5db7f76209d2'],
  ['accentuations.gp4', '104bfa7fc90ae768'],
  ['accentuations.gp5', 'c5fdb8b138edb766'],
  ['alternate-endings-section-error.gp5', 'd93802193ea4f394'],
  ['bank.gp5', 'a15fc2324a2f846f'],
  ['bass-tuning.gp5', 'd659b81cc509b8de'],
  ['beaming-mode.gp5', '270694265a464fac'],
  ['beat-harmonics.gp3', 'e3b7374675402ee6'],
  ['beat-text-lyrics.gp5', '0a2ee6ba238e67e2'],
  ['bends.gp3', 'e6062e1a75a4db91'],
  ['bends.gp4', 'e6062e1a75a4db91'],
  ['bends.gp5', 'e6062e1a75a4db91'],
  ['canon.gp5', '18d0bd310b3e9209'],
  ['chord-name-overflow.gp5', '4dcc45a5c6a70687'],
  ['chords.gp5', '7aac1acf138d92b7'],
  ['colors.gp4', '6b322a1db8365ad1'],
  ['colors.gp5', '60debe6eee92f667'],
  ['dead.gp3', 'c1e7a87ea53ace02'],
  ['dead.gp4', 'c1e7a87ea53ace02'],
  ['dead.gp5', 'c1e7a87ea53ace02'],
  ['directions.gp5', 'faae25ae97e026a1'],
  ['effects.gp3', '16d9162d492d1ad0'],
  ['effects.gp4', '5adc50d712b1734c'],
  ['effects.gp5', 'c0e85c9b8c5f039e'],
  ['fade-to-black.gp4', '97a4c4d2b9e87ecd'],
  ['fingering.gp4', '1ca4ed524f75ade0'],
  ['fingering.gp5', '1ca4ed524f75ade0'],
  ['grace.gp3', 'ee6accd751a803d7'],
  ['grace.gp4', 'ee6accd751a803d7'],
  ['grace.gp5', 'ee6accd751a803d7'],
  ['hammer.gp3', '1ed68e8ea57ca574'],
  ['hammer.gp4', '1ed68e8ea57ca574'],
  ['hammer.gp5', '1ed68e8ea57ca574'],
  ['harmonic-types.gp4', 'e33e014021759c5a'],
  ['harmonic-types.gp5', '89a69bfea3fe3033'],
  ['harmonics.gp3', 'bd841672dbeabac6'],
  ['harmonics.gp4', 'dc81301a09870534'],
  ['harmonics.gp5', 'a8b896a5385cfb19'],
  ['header-footer.gp5', 'ed6e4218217385da'],
  ['hide-diagrams.gp5', 'fc17f9d9dd4d3037'],
  ['hide-tuning.gp5', '73f1e88958a6b58e'],
  ['key-signatures.gp5', '5b2424cb43ff6ad6'],
  ['layout-configuration-multi-track-1-3.gp5', 'f78a416ff31189a1'],
  ['layout-configuration-multi-track-1.gp5', 'f78a416ff31189a1'],
  ['layout-configuration-multi-track-2.gp5', 'f78a416ff31189a1'],
  ['layout-configuration-multi-track-all.gp5', 'f78a416ff31189a1'],
  ['nightwish.gp5', '5b55715090b9d741'],
  ['notes.gp3', '0233a6a62f6bcfdd'],
  ['notes.gp4', '0233a6a62f6bcfdd'],
  ['notes.gp5', '0233a6a62f6bcfdd'],
  ['other-effects.gp3', '77d6077d06f56976'],
  ['other-effects.gp4', '28819f26741bf402'],
  ['other-effects.gp5', '5595a587929d600c'],
  ['ottavia.gp5', '66edc2076aaafa8a'],
  ['percussion-all.gp5', '33e9d913ff9fa32d'],
  ['ranges.gp3', 'e93036d3b37efdd2'],
  ['ranges.gp4', '9ab2fc42708c994a'],
  ['ranges.gp5', '9ab2fc42708c994a'],
  ['repeat-close-alternate-endings.gp5', 'c1d7e98f9d3e4328'],
  ['repeat-close-multi.gp5', '1a77da1ec40f23b5'],
  ['repeat-close-without-start-at-beginning.gp5', '36db2999866a67ad'],
  ['repeat-close.gp5', 'a445cf8cdab2bd6a'],
  ['score-info.gp3', 'b50ce5d2978e5971'],
  ['score-info.gp4', 'ea9aee0db1a86a79'],
  ['score-info.gp5', 'ea39ead21071ff8d'],
  ['serenade.gp5', 'cd58dd195cb8b3f1'],
  ['slides.gp3', 'b42ff5e5afda3249'],
  ['slides.gp4', 'ceb01d6f892a1ca0'],
  ['slides.gp5', 'ceb01d6f892a1ca0'],
  ['staves.gp5', 'edd54cc04586fdb2'],
  ['strings.gp3', 'b23e327cbbab80a6'],
  ['strings.gp4', 'b8600b93ecf18541'],
  ['strings.gp5', 'b8600b93ecf18541'],
  ['strokes.gp3', '7fd7cdb857f47e83'],
  ['strokes.gp4', '7e4e6f3ba2eef152'],
  ['strokes.gp5', '7e4e6f3ba2eef152'],
  ['time-signatures.gp3', 'f22b4606839274dc'],
  ['time-signatures.gp4', 'f22b4606839274dc'],
  ['time-signatures.gp5', '0461c5a5e9553fe2'],
  ['tremolo.gp4', '483909c7009bce83'],
  ['tremolo.gp5', '483909c7009bce83'],
  ['trills.gp4', '39fd83fc505b0350'],
  ['trills.gp5', '39fd83fc505b0350'],
  ['tuplets.gp3', '00eba85be38de711'],
  ['tuplets.gp4', '00eba85be38de711'],
  ['tuplets.gp5', '00eba85be38de711'],
  ['vibrato.gp3', '7f4761f426af670d'],
  ['vibrato.gp4', '7f4761f426af670d'],
  ['vibrato.gp5', '7f4761f426af670d'],
  ['wah-wah.gp5', 'e879fbb50320f1b6'],
]);

const HARMONIC_TYPE = { natural: 1, artificial: 2, tapped: 3, pinch: 4, semi: 5 } as const;
const GRACE_TRANSITION = { none: 0, slide: 1, bend: 2, hammer: 3 } as const;
const TRIPLET_FEEL = { none: 1, eighth: 2, sixteenth: 3 } as const;
/** TGEffectHarmonic.NATURAL_FREQUENCIES */
const NATURAL_FREQUENCIES: readonly (readonly [number, number])[] = [
  [12, 12],
  [9, 28],
  [5, 24],
  [7, 19],
  [4, 28],
  [3, 31],
];

function strokeDirection(value: string): number {
  if (value === 'up') {
    return 1;
  }
  return value === 'down' ? -1 : 0;
}

/** TuxGuitar keeps an index into NATURAL_FREQUENCIES; we keep semitones (artificial) or the tap fret. */
function harmonicIndex(note: Note, isGp5: boolean): number {
  const harmonic = note.effect.harmonic;
  if (harmonic?.type === 'artificial') {
    return NATURAL_FREQUENCIES.findIndex(([, semitones]) => semitones === harmonic.data);
  }
  if (harmonic?.type === 'tapped' && isGp5) {
    return Math.max(0, NATURAL_FREQUENCIES.findIndex(([fret]) => harmonic.data - note.fret === fret));
  }
  return 0;
}

function effectFlags(note: Note): string {
  const e = note.effect;
  const flags: readonly (readonly [boolean, string])[] = [
    [e.deadNote, 'dead'],
    [e.vibrato, 'vib'],
    [e.hammer, 'ham'],
    [e.slides.length > 0, 'slide'],
    [e.ghostNote, 'ghost'],
    [e.accentuatedNote, 'acc'],
    [e.heavyAccentuatedNote, 'heavy'],
    [e.palmMute, 'pm'],
    [e.staccato, 'stac'],
    [e.letRing, 'ring'],
    [e.tapping, 'tap'],
    [e.slapping, 'slap'],
    [e.popping, 'pop'],
    [e.fadeIn, 'fade'],
  ];
  return flags
    .filter(([isSet]) => isSet)
    .map(([, name]) => `,${name}`)
    .join('');
}

function points(bend: Bend, scale: number): string {
  return bend.points.map((point) => `${point.position}/${point.value / scale};`).join('');
}

function noteEffects(note: Note, isGp5: boolean): string {
  const { harmonic, bend, tremoloBar, grace, trill, tremoloPicking } = note.effect;
  const graceText = grace
    ? `${grace.fret}/${grace.duration}/${grace.velocity}/${GRACE_TRANSITION[grace.transition]}/${grace.onBeat}/${grace.isDead}`
    : '';
  return [
    effectFlags(note),
    harmonic ? `,harm${HARMONIC_TYPE[harmonic.type]}/${harmonicIndex(note, isGp5)}` : '',
    bend ? `,bend${points(bend, 1)}` : '',
    tremoloBar ? `,tbar${points(tremoloBar, 2)}` : '', // TuxGuitar: semitones, ours: quarter tones
    grace ? `,grace${graceText}` : '',
    trill ? `,trill${trill.fret}/${trill.duration.value}` : '',
    tremoloPicking ? `,tp${tremoloPicking.duration.value}` : '',
  ].join('');
}

function dumpVoice(voice: Voice, index: number, isGp5: boolean): string {
  const { value, dotted, tuplet } = voice.duration;
  const notes = voice.notes.map(
    (note) => ` [${note.string},${note.fret},${note.velocity}${note.isTied ? ',tied' : ''}${noteEffects(note, isGp5)}]`,
  );
  return ` | v${index}${voice.isEmpty ? ' empty ' : ' '}${value}${dotted ? '.' : ''} ${tuplet.enters}:${tuplet.times}${notes.join('')}`;
}

function dumpBeat(beat: Beat, isGp5: boolean): string {
  const voices = beat.voices.map((voice, index) => dumpVoice(voice, index, isGp5)).join('');
  const strokes = ` stroke ${strokeDirection(beat.stroke.direction)}:${beat.stroke.value} pick ${strokeDirection(beat.pickStroke)}`;
  // TuxGuitar drops chords without a played string
  const chord = beat.chord?.frets.some((fret) => fret >= 0)
    ? ` chord ${beat.chord.name} ${beat.chord.firstFret} [${beat.chord.frets.join(', ')}]`
    : '';
  const text = beat.text === undefined ? '' : ` text ${beat.text}`;
  return `  beat ${beat.start}${voices}${strokes}${chord}${text}`;
}

function dumpHeader(h: MeasureHeader): string {
  const marker = h.marker ? ` marker ${h.marker.title} ${h.marker.color.r},${h.marker.color.g},${h.marker.color.b}` : '';
  const { numerator, denominator } = h.timeSignature;
  const repeats = `${h.repeatOpen} ${h.repeatClose} ${h.repeatAlternative}`;
  return `header ${h.number} ${h.start} ${numerator}/${denominator} ${h.tempo} ${repeats} ${TRIPLET_FEEL[h.tripletFeel]}${marker}`;
}

function dumpTrack(t: Track, isGp5: boolean): string[] {
  const color = `${t.color.r},${t.color.g},${t.color.b}`;
  const strings = t.strings.map((s) => ` ${s.number}:${s.tuning}`).join('');
  const lyrics = `${t.lyrics?.from ?? 1}:${t.lyrics?.text ?? ''}`;
  return [
    `track ${t.number} ${t.name} ${t.channelId} ${t.offset} ${t.isPercussion} ${color} lyrics ${lyrics} strings${strings}`,
    ...t.measures.flatMap((m, index) => [
      // TuxGuitar encodes flat key signatures as 8 … 14
      ` measure ${index + 1} ${m.clef === 'bass' ? 2 : 1} ${m.keySignature < 0 ? 7 - m.keySignature : m.keySignature}`,
      ...m.beats.map((beat) => dumpBeat(beat, isGp5)),
    ]),
  ];
}

function dumpLikeTuxGuitar(song: Song): string {
  const isGp5 = song.source.format === 'gp5';
  const channels = song.channels.map(
    (c) => `channel ${c.id} - ${c.program} ${c.bank} ${c.volume} ${c.balance} ${c.chorus} ${c.reverb} ${c.phaser} ${c.tremolo}`,
  );
  const lines = [...channels, ...song.measureHeaders.map(dumpHeader), ...song.tracks.flatMap((t) => dumpTrack(t, isGp5))];
  return `${lines.join('\n')}\n`;
}

describe('GP3-5 readers against TuxGuitar', () => {
  const folders: readonly FixtureFolder[] = ['guitarpro3', 'guitarpro4', 'guitarpro5'];
  const fixtures = folders.flatMap((folder) => listFixtures(folder).map((name) => [folder, name] as const));

  it('has a TuxGuitar dump for every GP3-5 fixture', () => {
    expect(fixtures.map(([, name]) => name).sort()).toEqual([...TUXGUITAR_DUMP_SHA256.keys()].sort());
  });

  it.each(fixtures)('%s/%s reads exactly as TuxGuitar reads it', (folder, name) => {
    // Arrange
    const bytes = loadFixture(folder, name);

    // Act
    const dump = dumpLikeTuxGuitar(readSong(bytes, { charset: 'windows-1252' }));

    // Assert
    const hash = createHash('sha256').update(dump, 'utf8').digest('hex').slice(0, 16);
    expect(hash).toBe(TUXGUITAR_DUMP_SHA256.get(name));
  });
});
