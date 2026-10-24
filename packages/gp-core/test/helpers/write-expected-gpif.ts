import { createChannelName } from '../../src/formats/common/channels';
import {
  DEFAULT_CHANNEL,
  DEFAULT_PERCUSSION_BANK,
  durationFromTicks,
  durationTicks,
  measureTicks,
  NO_STROKE,
  plainDuration,
  QUARTER,
  RED,
  STROKE_VALUES,
  roundTempo,
} from '../../src/model/defaults';
import {
  type Beat,
  type Bend,
  type BendPoint,
  type Channel,
  type Chord,
  type Duration,
  type Grace,
  type Harmonic,
  type Measure,
  type MeasureHeader,
  type Note,
  type NoteEffect,
  type NoteValue,
  type PedalMark,
  QUARTER_TIME,
  type SlideType,
  type Song,
  type SongInfo,
  type Stroke,
  type Track,
  type Tuplet,
  type Voice,
} from '../../src/model/song';
import { MUSICAL_DIRECTIONS } from '../../src/formats/common/directions';
import { normalizeBeamGrouping } from '../../src/model/beaming';
import { expectedCurve } from './write-expected-curves';

/*
 * The song a GP7 ('gp') round trip should return: the source song reduced to what a GPIF document (and our GPIF reader)
 * holds. Written independently of src/write as the test oracle; every rule is a documented loss. A song read from a
 * GP7/GP8 file needs none of them (see write-gpif-round-trip.test.ts).
 *
 * - text: carriage returns become line feeds, characters XML 1.0 cannot hold are dropped (lone surrogates: U+FFFD);
 *   track names lose line feeds and outer spaces, marker titles too (an empty one is no marker), beat texts outer
 *   spaces (an empty one is no text); chord names (attributes) get spaces for tabs and line feeds; a notice of one
 *   empty line is no notice;
 * - channels: one per MIDI channel the tracks play on, in the order tracks first use them, numbered from 1 and named
 *   from their program by the reader; no chorus, reverb, phaser or tremolo (GPIF has RSE effects instead); percussion
 *   channels all play on MIDI channel 10, so they read back as one (program 0, bank 128); channels no track uses are gone;
 * - tracks: solo wins over mute; lyrics only with some text; the key signature is the measure header's (the first
 *   pitched track's, 0 on percussion tracks);
 * - measure headers: marker colours are red (GPIF sections have none); tempos keep two decimals, at least 1;
 * - beats: four voices, empty ones the reader's placeholder (an empty quarter); beats without a voice are gone; voice
 *   directions (stem orientations) are not read; strokes at 4…128 (32 for a stroke without speed); measure 1, when its
 *   voices do not fill it, is laid out against its end (the reader's anacrusis);
 * - per voice (GPIF keeps them per beat): one dynamic (the first note's, on the eight dynamics), the whammy bar and
 *   tremolo picking of the first note that has one, slap / pop when any note has them, one fade (fade in, else fade
 *   out, else volume swell, when a note has it), one grace duration, dynamic and placement (the first grace's);
 * - marks: directions each once in GP5's order; sustain pedal marks inside their bar, a release before a press at the
 *   same place;
 * - effects: bend and whammy curves as the reader can read them back (write-expected-curves.ts); tremolo picking at
 *   8/16/32; trill speeds as plain durations; slides in flag order; artificial harmonics on the harmonic table's frets,
 *   tapped ones at or above the note, the others without data; a double-dotted dotted duration keeps its single dot;
 * - notes: no audio settings (play duration, start offset, velocity change: GPIF has no property for them).
 * - notation marks: no cautionary or forced accidental (accidentalDisplay); a bar's beam grouping only when it is not
 *   the time signature's own; a track's slash notation only when on.
 */

const CONTROL_CHARACTERS = /[\ud800-\udbff][\udc00-\udfff]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/g;

export function sanitized(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS, (match) => {
    if (match.length === 2) {
      return match;
    }
    return match.charCodeAt(0) >= 0xd800 && match.charCodeAt(0) <= 0xdfff ? '\ufffd' : '';
  });
}

/** Trill speeds are written in Guitar Pro's 480 ticks per quarter note and read back as plain durations. */
const TRILL_TICK = QUARTER_TIME / 480;
const EMPTY_VOICE: Voice = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' };
const MAX_VOICES = 4;
const MAX_KEY = 7;
const MELODIC_CHANNELS = 15;

function expectedInfo(info: SongInfo): SongInfo {
  const notices = sanitized(info.notice.join('\n')).split('\n');
  return {
    title: sanitized(info.title),
    subtitle: sanitized(info.subtitle),
    artist: sanitized(info.artist),
    album: sanitized(info.album),
    words: sanitized(info.words),
    music: sanitized(info.music),
    copyright: sanitized(info.copyright),
    transcriber: sanitized(info.transcriber),
    instructions: sanitized(info.instructions),
    notice: notices.length === 1 && notices[0] === '' ? [] : notices,
  };
}

interface ChannelPlan {
  readonly channels: readonly Channel[];
  /** Model channel id → channel id read back. */
  readonly ids: ReadonlyMap<number, number>;
}

/** The MIDI channel each model channel plays on: one for all percussion, else one each in order of first use (15 of them). */
function midiChannels(song: Song): ReadonlyMap<number, string> {
  const order = [...new Set(song.tracks.map((track) => track.channelId))];
  const isPercussion = (id: number): boolean => song.channels.find((channel) => channel.id === id)?.isPercussion ?? false;
  const melodic = order.filter((id) => !isPercussion(id));
  return new Map(order.map((id) => [id, isPercussion(id) ? 'percussion' : `melodic ${melodic.indexOf(id) % MELODIC_CHANNELS}`]));
}

function expectedChannels(song: Song): ChannelPlan {
  const midi = midiChannels(song);
  const byMidi = new Map<string, Channel>();
  const channels: Channel[] = [];
  const ids = new Map<number, number>();
  for (const track of song.tracks) {
    const midiChannel = midi.get(track.channelId) ?? '';
    const existing = byMidi.get(midiChannel);
    if (existing !== undefined) {
      ids.set(track.channelId, existing.id);
      continue;
    }
    const source = song.channels.find((channel) => channel.id === track.channelId) ?? { ...DEFAULT_CHANNEL, id: track.channelId };
    const isPercussion = source.isPercussion;
    const program = isPercussion ? 0 : Math.min(127, Math.max(0, source.program));
    const channel: Channel = {
      ...DEFAULT_CHANNEL,
      id: channels.length + 1,
      name: createChannelName(channels, program, isPercussion),
      program,
      bank: isPercussion ? DEFAULT_PERCUSSION_BANK : Math.max(0, source.bank),
      volume: Math.min(127, Math.max(0, Math.round(source.volume))),
      balance: Math.min(127, Math.max(0, Math.round(source.balance))),
      isPercussion,
    };
    byMidi.set(midiChannel, channel);
    channels.push(channel);
    ids.set(track.channelId, channel.id);
  }
  return { channels, ids };
}

function expectedHeader(header: MeasureHeader, start: number): MeasureHeader {
  const { marker, directions, beamGrouping: grouping, ...rest } = header;
  const title = marker === undefined ? '' : sanitized(marker.title).replaceAll('\n', '').trim();
  const sorted = MUSICAL_DIRECTIONS.filter((direction) => directions?.includes(direction) === true);
  const beamGrouping = normalizeBeamGrouping(grouping, header.timeSignature);
  return {
    ...rest,
    ...(sorted.length === 0 ? {} : { directions: sorted }),
    ...(beamGrouping === undefined ? {} : { beamGrouping }),
    start,
    tempo: Math.max(1, roundTempo(header.tempo)),
    repeatAlternative: header.repeatAlternative & 0x7fffffff,
    ...(title === '' ? {} : { marker: { title, color: RED } }),
  };
}

function expectedHeaders(song: Song): MeasureHeader[] {
  let start = QUARTER_TIME;
  return song.measureHeaders.map((header) => {
    const expected = expectedHeader(header, start);
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
    return expected;
  });
}

// ---------------------------------------------------------------- notes

const DYNAMIC_VELOCITIES = [15, 31, 47, 63, 79, 95, 111, 127];

/** The velocity of the nearest dynamic (the louder one half way). */
function dynamicVelocity(velocity: number): number {
  const index = Math.min(7, Math.max(0, Math.round((velocity - 15) / 16)));
  return DYNAMIC_VELOCITIES[index] ?? 95;
}

function nearest(candidates: readonly number[], value: number): number {
  const distance = (candidate: number): number => Math.abs(Math.log2(candidate) - Math.log2(Math.max(1, value)));
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

const SLIDE_ORDER: readonly SlideType[] = ['shift', 'legato', 'outDownwards', 'outUpwards', 'intoFromBelow', 'intoFromAbove'];
const HARMONIC_OFFSETS: ReadonlySet<number> = new Set([12, 28, 24, 19, 31]);

function expectedHarmonic(harmonic: Harmonic, fret: number): Harmonic {
  if (harmonic.type === 'artificial') {
    return { ...harmonic, data: HARMONIC_OFFSETS.has(harmonic.data) ? harmonic.data : 0 };
  }
  if (harmonic.type === 'tapped') {
    return { ...harmonic, data: harmonic.data !== 0 && harmonic.data >= fret ? harmonic.data : 0 };
  }
  return { ...harmonic, data: 0 };
}

function expectedGrace(grace: Grace, shared: Grace): Grace {
  return {
    ...grace,
    fret: Math.max(0, grace.fret),
    duration: [2, 3].includes(shared.duration) ? shared.duration : 1,
    velocity: dynamicVelocity(shared.velocity),
    onBeat: shared.onBeat,
  };
}

interface VoiceShared {
  readonly velocity: number;
  readonly tremoloBar: Bend | undefined;
  readonly tremoloPicking: Duration | undefined;
  readonly slapping: boolean;
  readonly popping: boolean;
  readonly fade: 'in' | 'out' | 'swell' | undefined;
  readonly grace: Grace | undefined;
}

function voiceFade(notes: readonly Note[]): VoiceShared['fade'] {
  if (notes.some((note) => note.effect.fadeIn)) {
    return 'in';
  }
  if (notes.some((note) => note.effect.fadeOut === true)) {
    return 'out';
  }
  return notes.some((note) => note.effect.volumeSwell === true) ? 'swell' : undefined;
}

function voiceShared(notes: readonly Note[]): VoiceShared {
  const picking = notes.find((note) => note.effect.tremoloPicking !== undefined)?.effect.tremoloPicking?.duration;
  return {
    velocity: dynamicVelocity(notes[0]?.velocity ?? 95),
    tremoloBar: notes.find((note) => note.effect.tremoloBar !== undefined)?.effect.tremoloBar,
    tremoloPicking: picking === undefined ? undefined : plainDuration(nearest([8, 16, 32], picking.value) as NoteValue),
    slapping: notes.some((note) => note.effect.slapping),
    popping: notes.some((note) => note.effect.popping),
    fade: voiceFade(notes),
    grace: notes.find((note) => note.effect.grace !== undefined)?.effect.grace,
  };
}

function expectedEffect(note: Note, shared: VoiceShared, tuning: number, capo: number): NoteEffect {
  const { bend, tremoloBar: _bar, tremoloPicking: _picking, harmonic, grace, trill, fadeOut: _out, volumeSwell: _swell, ...rest } = note.effect;
  const trillPitch = trill === undefined ? 0 : tuning + capo + note.fret + trill.fret - note.fret;
  const expectedBend = bend === undefined ? undefined : expectedCurve(bend, 'bend');
  const expectedBar = shared.tremoloBar === undefined ? undefined : expectedCurve(shared.tremoloBar, 'whammy');
  return {
    ...rest,
    ...(expectedBend === undefined ? {} : { bend: expectedBend }),
    ...(expectedBar === undefined ? {} : { tremoloBar: expectedBar }),
    ...(harmonic === undefined ? {} : { harmonic: expectedHarmonic(harmonic, note.fret) }),
    ...(grace === undefined || shared.grace === undefined ? {} : { grace: expectedGrace(grace, shared.grace) }),
    ...(trill === undefined || trillPitch <= 0
      ? {}
      : { trill: { fret: Math.max(0, trill.fret), duration: durationFromTicks(TRILL_TICK * Math.round(durationTicks(trill.duration) / TRILL_TICK)) } }),
    ...(shared.tremoloPicking === undefined ? {} : { tremoloPicking: { duration: shared.tremoloPicking } }),
    slides: SLIDE_ORDER.filter((slide) => rest.slides.includes(slide)),
    vibrato: rest.vibrato && !rest.wideVibrato,
    slapping: shared.slapping,
    popping: shared.popping,
    fadeIn: shared.fade === 'in',
    ...(shared.fade === 'out' ? { fadeOut: true } : {}),
    ...(shared.fade === 'swell' ? { volumeSwell: true } : {}),
  };
}

interface TrackRules {
  readonly track: Track;
  readonly isPercussion: boolean;
}

function expectedNote(note: Note, shared: VoiceShared, rules: TrackRules): Note {
  const tuning = rules.isPercussion ? 0 : (rules.track.strings.find((s) => s.number === note.string)?.tuning ?? 0);
  const capo = rules.isPercussion ? 0 : rules.track.offset;
  const { audio: _audio, accidentalDisplay: _dropped, ...kept } = note;
  return { ...kept, velocity: shared.velocity, effect: expectedEffect(note, shared, tuning, capo) };
}

function isNormal(tuplet: Tuplet): boolean {
  return tuplet.enters <= 0 || tuplet.times <= 0 || (tuplet.enters === 1 && tuplet.times === 1);
}

/** One dot when both are set; a 1:1 inner tuplet is none; an inner tuplet in no outer one is the tuplet. */
function expectedDuration(duration: Duration): Duration {
  const { innerTuplet, ...rest } = duration;
  const plain: Duration = rest.dotted && rest.doubleDotted ? { ...rest, doubleDotted: false } : rest;
  if (innerTuplet === undefined || isNormal(innerTuplet)) {
    return plain;
  }
  return isNormal(plain.tuplet) ? { ...plain, tuplet: innerTuplet } : { ...plain, innerTuplet };
}

function expectedVoice(voice: Voice | undefined, rules: TrackRules): Voice {
  if (voice === undefined || voice.isEmpty) {
    return EMPTY_VOICE;
  }
  const shared = voiceShared(voice.notes);
  return {
    duration: expectedDuration(voice.duration),
    notes: voice.notes.map((note) => expectedNote(note, shared, rules)),
    isEmpty: false,
    direction: 'none',
    ...(voice.isSlashed === true ? { isSlashed: true } : {}),
    ...(voice.beamToNext === undefined ? {} : { beamToNext: voice.beamToNext }),
  };
}

// ---------------------------------------------------------------- beats

function expectedStroke(stroke: Stroke): Stroke {
  if (stroke.direction === 'none') {
    return NO_STROKE;
  }
  return { ...stroke, value: stroke.value > 0 ? nearest(STROKE_VALUES, stroke.value) : 32 };
}

function expectedChord(chord: Chord, stringCount: number): Chord {
  const name = sanitized(chord.name).replace(/[\n\t]/g, ' ');
  const frets = chord.frets.map((fret) => (fret >= 0 ? fret : -1));
  const played = frets.filter((fret) => fret >= 0);
  if (played.length === 0) {
    return { name, firstFret: 1, frets: Array.from({ length: stringCount }, () => -1) };
  }
  return { name, firstFret: Math.max(0, Math.min(chord.firstFret - 1, ...played)) + 1, frets: frets.slice(0, 25) };
}

function expectedBeat(beat: Beat, rules: TrackRules): Beat {
  const { chord, text, ...rest } = beat;
  const trimmed = text === undefined ? '' : sanitized(text).trim();
  return {
    ...rest,
    voices: Array.from({ length: MAX_VOICES }, (_, index) => expectedVoice(beat.voices[index], rules)),
    stroke: expectedStroke(beat.stroke),
    ...(chord === undefined ? {} : { chord: expectedChord(chord, rules.track.strings.length) }),
    ...(trimmed === '' ? {} : { text: trimmed }),
  };
}

function hasVoice(beat: Beat): boolean {
  return beat.voices.slice(0, MAX_VOICES).some((voice) => !voice.isEmpty);
}

/** The reader lays an incomplete measure 1 out against its end; a written measure 1 starts at its first beat. */
function anacrusisStarts(beats: readonly Beat[], header: MeasureHeader): Beat[] {
  const voices = beats.flatMap((beat) => beat.voices.filter((voice) => !voice.isEmpty).map((voice) => ({ beat, voice })));
  if (voices.length === 0) {
    return [...beats];
  }
  const first = Math.min(...voices.map(({ beat }) => beat.start));
  const end = Math.max(...voices.map(({ beat, voice }) => beat.start + durationTicks(voice.duration)));
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const shift = header.start + Math.max(0, length - (end - first)) - first;
  return beats.map((beat) => ({ ...beat, start: beat.start + shift }));
}

/** Pedal marks inside the bar (the reader clamps the position), a release before a press at the same place. */
function expectedPedals(pedals: readonly PedalMark[] | undefined, header: MeasureHeader): readonly PedalMark[] | undefined {
  if (pedals === undefined || pedals.length === 0) {
    return undefined;
  }
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const inside = pedals.map((pedal) => ({ ...pedal, offset: Math.min(length, Math.max(0, pedal.offset)) }));
  return inside.sort((a, b) => a.offset - b.offset || (a.action === b.action ? 0 : a.action === 'up' ? -1 : 1));
}

function expectedMeasure(measure: Measure, header: MeasureHeader, rules: TrackRules, keySignature: number): Measure {
  const beats = measure.beats.filter(hasVoice).map((beat) => expectedBeat(beat, rules));
  const { pedals: _pedals, ...rest } = measure;
  const pedals = expectedPedals(measure.pedals, header);
  return {
    ...rest,
    ...(pedals === undefined ? {} : { pedals }),
    keySignature: rules.isPercussion ? 0 : keySignature,
    beats: header.number === 1 ? anacrusisStarts(beats, header) : beats,
  };
}

function expectedTrack(track: Track, song: Song, plan: ChannelPlan, keys: readonly number[], headers: readonly MeasureHeader[]): Track {
  const channelId = plan.ids.get(track.channelId) ?? track.channelId;
  const isPercussion = plan.channels.find((channel) => channel.id === channelId)?.isPercussion ?? false;
  const rules: TrackRules = { track, isPercussion };
  const { lyrics, hasSlashNotation, ...rest } = track;
  const lyricsText = lyrics === undefined ? '' : sanitized(lyrics.text);
  return {
    ...rest,
    ...(hasSlashNotation === true ? { hasSlashNotation } : {}),
    name: sanitized(track.name).replaceAll('\n', '').trim(),
    channelId,
    isPercussion,
    mute: track.mute && !track.solo,
    ...(lyrics !== undefined && lyricsText.trim() !== '' ? { lyrics: { ...lyrics, text: lyricsText } } : {}),
    measures: track.measures.map((measure, index) => {
      const header = headers[index] ?? song.measureHeaders[index];
      return header === undefined ? measure : expectedMeasure(measure, header, rules, keys[index] ?? 0);
    }),
  };
}

function keySignatures(song: Song): readonly number[] {
  const reference = song.tracks.find((track) => !track.isPercussion) ?? song.tracks[0];
  return song.measureHeaders.map((_, index) => {
    const key = reference?.measures[index]?.keySignature ?? 0;
    return Math.max(-MAX_KEY, Math.min(MAX_KEY, key));
  });
}

/** The song a 'gp' round trip of `song` should read back. */
export function expectedAfterGp(song: Song): Song {
  const plan = expectedChannels(song);
  const headers = expectedHeaders(song);
  const keys = keySignatures(song);
  return {
    ...song,
    info: expectedInfo(song.info),
    channels: plan.channels,
    measureHeaders: headers,
    tracks: song.tracks.map((track) => expectedTrack(track, song, plan, keys, headers)),
  };
}
