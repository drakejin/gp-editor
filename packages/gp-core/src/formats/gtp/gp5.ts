// Port of TuxGuitar app.tuxguitar.io.gtp.GP5InputStream (LGPL-2.1).
import { ByteReader } from '../../io/byte-reader';
import { DEFAULT_NOTE_AUDIO, durationTicks, EMPTY_NOTE_EFFECT, NO_STROKE, toNoteAudio, toNoteValue } from '../../model/defaults';
import type {
  BeamLink,
  Beat,
  Chord,
  Clef,
  Grace,
  Harmonic,
  Note,
  NoteAudio,
  NoteEffect,
  SlideType,
  Song,
  TimeSignature,
  TripletFeel,
  Voice,
} from '../../model/song';
import { bendValueFromGp } from '../common/bend-units';
import { artificialHarmonicOffset } from '../common/harmonics';
import { DEFAULT_RASGUEADO } from '../common/rasgueado';
import { DEFAULT_VELOCITY, velocityFromGp } from '../common/velocity';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { readBeatEffectsGp45 } from './gp4';
import { GP5_BEAM_GROUPS, GP5_BREAK_SECONDARY_BEAMS, beamGroupingFromGp5, beamLinkFromGp5 } from './gp5-beams';
import { readDirectionsGp5, withDirections } from './gp5-directions';
import {
  type BeatEffects,
  type HeaderDraft,
  buildChord,
  type ChannelSlot,
  EMPTY_VOICE,
  findTiedFret,
  GRACE_TRANSITIONS,
  type HeaderRead,
  type MeasureBeats,
  type MeasureJob,
  type NoteContext,
  readBendPoints,
  readChannelSlots,
  readColor,
  readDuration,
  readFingers,
  readInts,
  readKeySignature,
  readLyrics,
  readMarker,
  readMeasureHeaders,
  readMixTableValues,
  readSongInfo,
  readSongMeasures,
  readStringNotes,
  readStrings,
  readTrackChannel,
  readTrackList,
  readTremoloPicking,
  readTrill,
  resolveFret,
  skipMixTransitions,
  skipVersion,
  type TrackDraft,
  type TrackStep,
  withBend,
  withHarmonic,
  withTremoloPicking,
  withTrill,
} from './shared';

/** TuxGuitar's version code 0; "v5.10" (code 1) adds RSE data in several places. */
const VERSION_500 = 'FICHIER GUITAR PRO v5.00';
/** Track clef value GP5 uses for bass-clef tunings. */
const GP5_BASS_CLEF = 12;
const VOICE_COUNT = 2;

/*
 * Byte alignment: TuxGuitar skips one byte before every measure header but the first, one more at
 * the first track (and at every track in v5.00), and one after the tracks and after every measure.
 * We read the same bytes, grouped as alphaTab does: a trailing byte after each header, 36 trailing
 * bytes (not 35) after each v5.00 track, and a leading byte before each measure. TuxGuitar's very
 * last skip, past the final measure, is not done (Java's stream returns -1 there; ours would throw).
 */
export function readGp5(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  const reader = new ByteReader(bytes, options.charset);
  const isV510 = detected.version !== VERSION_500;
  skipVersion(reader);
  const info = readSongInfo(reader, true);
  const lyricTrack = reader.readInt();
  const lyrics = readLyrics(reader);
  readPageSetup(reader, isV510);
  const tempo = reader.readInt();
  if (isV510) {
    reader.skip(1); // hide tempo
  }
  const keySignature = readKeySignature(reader);
  reader.skip(3);
  reader.readByte(); // octave
  const slots = readChannelSlots(reader);
  const directions = readDirectionsGp5(reader);
  reader.skip(4); // master reverb
  const measureCount = reader.readInt();
  const trackCount = reader.readInt();
  const headers = readMeasureHeaders(measureCount, keySignature, (number, previous, timeSignature) =>
    withDirections(readHeaderGp5(reader, number, timeSignature, previous.at(-1)), directions),
  );
  const { tracks, registry } = readTrackList(trackCount, { lyricTrack, lyrics }, (number, current) =>
    readTrackGp5(reader, number, slots, current, isV510),
  );
  const parts = { source: detected, info, registry, ...headers, tracks, tempo };
  return readSongMeasures(parts, (job) => readMeasureGp5(reader, job, isV510));
}

/** Page size and margins (v5.10: after the RSE master settings), then 11 header/footer strings. */
function readPageSetup(reader: ByteReader, isV510: boolean): void {
  reader.skip(isV510 ? 49 : 30);
  for (let i = 0; i < 11; i++) {
    reader.skip(4);
    reader.readStringByte(0);
  }
}

function readHeaderGp5(reader: ByteReader, number: number, timeSignature: TimeSignature, previous: HeaderDraft | undefined): HeaderRead {
  const flags = reader.readUnsignedByte();
  const numerator = (flags & 0x01) !== 0 ? reader.readByte() : timeSignature.numerator;
  const denominator = (flags & 0x02) !== 0 ? toNoteValue(reader.readByte()) : timeSignature.denominator;
  const repeatClose = (flags & 0x08) !== 0 ? reader.readUnsignedByte() - 1 : 0;
  const marker = (flags & 0x20) !== 0 ? readMarker(reader) : undefined;
  const keySignature = (flags & 0x40) !== 0 ? readKeySignature(reader) : undefined;
  if (keySignature !== undefined) {
    reader.skip(1); // major / minor
  }
  // Beam grouping: four bytes with a time signature, else the previous bar's.
  const ownTime = { numerator, denominator };
  const beamGrouping = (flags & 0x03) !== 0 ? beamGroupingFromGp5(readBytes(reader, GP5_BEAM_GROUPS), ownTime) : previous?.beamGrouping;
  const repeatAlternative = (flags & 0x10) !== 0 ? reader.readUnsignedByte() : 0;
  if ((flags & 0x10) === 0) {
    reader.skip(1);
  }
  const tripletFeel = tripletFeelGp5(reader.readByte());
  reader.skip(1); // TuxGuitar skips this byte before the next header / at the first track
  const header = {
    number,
    timeSignature: { numerator, denominator },
    repeatOpen: (flags & 0x04) !== 0,
    repeatClose,
    repeatAlternative,
    tripletFeel,
    ...(marker === undefined ? {} : { marker }),
    ...(beamGrouping === undefined ? {} : { beamGrouping }),
  };
  return keySignature === undefined ? { header } : { header, keySignature };
}

function readBytes(reader: ByteReader, count: number): readonly number[] {
  return Array.from({ length: count }, () => reader.readUnsignedByte());
}

function tripletFeelGp5(value: number): TripletFeel {
  if (value === 1) {
    return 'eighth';
  }
  return value === 2 ? 'sixteenth' : 'none';
}

function readTrackGp5(
  reader: ByteReader,
  number: number,
  slots: readonly ChannelSlot[],
  registry: TrackStep['registry'],
  isV510: boolean,
): TrackStep {
  const flags = reader.readUnsignedByte();
  const name = reader.readStringByte(40);
  const strings = readStrings(reader);
  reader.readInt(); // MIDI port
  const channel = readTrackChannel(reader, slots, registry);
  reader.readInt(); // fret count
  const offset = reader.readInt();
  const color = readColor(reader);
  reader.skip(5); // staff flags, MIDI auto settings, RSE accentuation, bank, RSE humanize
  const clef: Clef = reader.readInt() === GP5_BASS_CLEF ? 'bass' : 'treble';
  reader.skip(isV510 ? 40 : 36); // RSE instrument, equalizer and unknown settings
  if (isV510) {
    reader.readStringByteSizeOfInteger(); // RSE effect name
    reader.readStringByteSizeOfInteger(); // RSE effect category
  }
  const { channelId, isPercussion } = channel;
  const solo = (flags & 0x10) !== 0;
  const mute = (flags & 0x20) !== 0;
  const draft: TrackDraft = { number, name, channelId, strings, color, offset, isPercussion, solo, mute };
  return { track: { draft, clef }, registry: channel.registry };
}

// ---------------------------------------------------------------- measures and beats

/** Two voices; a voice's beat joins the beat of the other voice that starts at the same tick. */
function readMeasureGp5(reader: ByteReader, job: MeasureJob, isV510: boolean): MeasureBeats {
  reader.skip(1); // TuxGuitar skips this byte after the tracks and after every measure
  let beats: readonly Beat[] = [];
  let tempo = job.tempo;
  for (let voiceIndex = 0; voiceIndex < VOICE_COUNT; voiceIndex++) {
    const count = reader.readInt();
    let start = job.start;
    let previousStart: number | undefined;
    for (let i = 0; i < count; i++) {
      const read = readBeatGp5(reader, { job, voiceIndex, start, beats, isV510 });
      const link = read.beamFromPrevious;
      beats = previousStart === undefined || link === undefined ? read.beats : withBeamToNext(read.beats, previousStart, voiceIndex, link);
      previousStart = start;
      start += read.ticks;
      tempo = read.tempo ?? tempo;
    }
  }
  return { beats: beats.filter((beat) => beat.voices.some((voice) => !voice.isEmpty)), tempo };
}

interface BeatJob {
  readonly job: MeasureJob;
  readonly voiceIndex: number;
  readonly start: number;
  /** Beats of the measure so far, in TuxGuitar's list order. */
  readonly beats: readonly Beat[];
  readonly isV510: boolean;
}

interface Gp5BeatRead {
  readonly beats: readonly Beat[];
  readonly ticks: number;
  readonly tempo?: number;
  /** The beam from the voice's previous beat to this one (GP5 keeps it on the later beat). */
  readonly beamFromPrevious?: BeamLink;
}

/** The voice's beat at `start` with its beam to the next beat set. */
function withBeamToNext(beats: readonly Beat[], start: number, voiceIndex: number, link: BeamLink): readonly Beat[] {
  return beats.map((beat) => {
    const voice = beat.voices[voiceIndex];
    if (beat.start !== start || voice === undefined || voice.isEmpty) {
      return beat;
    }
    return { ...beat, voices: beat.voices.map((current, i) => (i === voiceIndex ? { ...voice, beamToNext: link } : current)) };
  });
}

function readBeatGp5(reader: ByteReader, beatJob: BeatJob): Gp5BeatRead {
  const { job, beats } = beatJob;
  const flags = reader.readUnsignedByte();
  const markedEmpty = (flags & 0x40) !== 0 ? (reader.readUnsignedByte() & 0x02) === 0 : true;
  const duration = readDuration(reader, flags, true);
  const stringCount = job.track.draft.strings.length;
  const chord = (flags & 0x02) !== 0 ? readChordGp5(reader, stringCount) : undefined;
  const text = (flags & 0x04) !== 0 ? reader.readStringByteSizeOfInteger() : undefined;
  const effects: BeatEffects = (flags & 0x08) !== 0 ? readBeatEffectsGp45(reader, 'up') : { effect: EMPTY_NOTE_EFFECT };
  const tempo = (flags & 0x10) !== 0 ? readMixChangeGp5(reader, beatJob.isV510) : undefined;
  const notes = readStringNotes(reader, stringCount, (string) =>
    readNoteGp5(reader, { string, effect: effects.effect, tiedFret: () => findTiedFret(job.previous, beats, string) }),
  );
  const display = reader.readUnsignedByte() | (reader.readUnsignedByte() << 8); // beam, stem, ottava and tuplet flags
  if ((display & GP5_BREAK_SECONDARY_BEAMS) !== 0) {
    reader.skip(1); // secondary beams kept
  }
  // A voice without the "not empty" flag only counts when it has notes (TGVoice.addNote).
  const voice: Voice = { duration, notes, isEmpty: markedEmpty && notes.length === 0, direction: 'none' };
  const placed = placeVoice(beats, beatJob, voice, { chord, text, effects });
  const beam = voice.isEmpty ? undefined : beamLinkFromGp5(display);
  const extras = { ...(tempo === undefined ? {} : { tempo }), ...(beam === undefined ? {} : { beamFromPrevious: beam }) };
  return { beats: placed, ticks: voice.isEmpty ? 0 : durationTicks(duration), ...extras };
}

interface BeatExtras {
  readonly chord: Chord | undefined;
  readonly text: string | undefined;
  readonly effects: BeatEffects;
}

/** TuxGuitar's getBeat: reuse the beat starting at the same tick, else append a new one. */
function placeVoice(beats: readonly Beat[], beatJob: BeatJob, voice: Voice, extras: BeatExtras): readonly Beat[] {
  const index = beats.findIndex((candidate) => candidate.start === beatJob.start);
  const base: Beat = (index >= 0 ? beats[index] : undefined) ?? {
    start: beatJob.start,
    voices: [EMPTY_VOICE, EMPTY_VOICE],
    stroke: NO_STROKE,
    pickStroke: 'none',
  };
  const beat: Beat = {
    ...base,
    voices: base.voices.map((current, voiceIndex) => (voiceIndex === beatJob.voiceIndex ? voice : current)),
    stroke: extras.effects.stroke ?? base.stroke,
    pickStroke: extras.effects.pickStroke ?? base.pickStroke,
    ...(extras.chord === undefined ? {} : { chord: extras.chord }),
    ...(extras.text === undefined ? {} : { text: extras.text }),
    ...(extras.effects.isRasgueado === true ? { rasgueado: DEFAULT_RASGUEADO } : {}),
  };
  return index >= 0 ? beats.map((current, i) => (i === index ? beat : current)) : [...beats, beat];
}

function readChordGp5(reader: ByteReader, stringCount: number): Chord | undefined {
  reader.skip(17);
  const name = reader.readStringByte(21);
  reader.skip(4);
  const firstFret = reader.readInt();
  const frets = readInts(reader, 7);
  reader.skip(32); // barres, omissions, fingering
  return buildChord(name, firstFret, frets, stringCount);
}

/** GP5 mix-table change; only the tempo is kept (TuxGuitar's readMixChange). */
function readMixChangeGp5(reader: ByteReader, isV510: boolean): number | undefined {
  reader.readByte(); // instrument
  reader.skip(16); // RSE instrument
  const values = readMixTableValues(reader);
  reader.readStringByteSizeOfInteger(); // tempo name
  const tempo = reader.readInt();
  skipMixTransitions(reader, values);
  if (tempo >= 0) {
    reader.skip(isV510 ? 2 : 1); // tempo transition duration (v5.10: and "hide tempo")
  }
  reader.readByte(); // "apply to all tracks" flags
  reader.skip(1); // wah-wah
  if (isV510) {
    reader.readStringByteSizeOfInteger();
    reader.readStringByteSizeOfInteger();
  }
  return tempo >= 0 ? tempo : undefined;
}

// ---------------------------------------------------------------- notes

function readNoteGp5(reader: ByteReader, context: NoteContext): Note {
  const flags = reader.readUnsignedByte();
  let effect: NoteEffect = {
    ...context.effect,
    accentuatedNote: (flags & 0x40) !== 0,
    heavyAccentuatedNote: (flags & 0x02) !== 0,
    ghostNote: (flags & 0x04) !== 0,
  };
  const noteType = (flags & 0x20) !== 0 ? reader.readUnsignedByte() : 0;
  const isTied = noteType === 0x02;
  if ((flags & 0x20) !== 0) {
    effect = { ...effect, deadNote: noteType === 0x03 };
  }
  const velocity = (flags & 0x10) !== 0 ? velocityFromGp(reader.readByte()) : DEFAULT_VELOCITY;
  const fret = (flags & 0x20) !== 0 ? resolveFret(reader.readByte(), isTied, context.tiedFret) : 0;
  const fingers = (flags & 0x80) !== 0 ? readFingers(reader) : {};
  // Duration percent (a double, 1 = as written): TuxGuitar skips it; it is the note's play duration.
  const durationPercent = (flags & 0x01) !== 0 ? reader.readDouble() * 100 : undefined;
  reader.skip(1); // second flags byte (accidental spelling)
  if ((flags & 0x08) !== 0) {
    effect = readNoteEffectsGp5(reader, effect);
  }
  const note = { fret, velocity, string: context.string, isTied, effect, ...fingers };
  const audio = durationPercent === undefined ? undefined : audioOf(durationPercent, effect);
  return audio === undefined ? note : { ...note, audio };
}

/**
 * The play duration Guitar Pro 5 writes by itself for a staccato (50 %) or palm-muted (75 %) note, as the real files
 * show; 100 for any other note. renderMidi already shortens those notes for the effect.
 */
export function impliedDurationPercent(effect: NoteEffect): number {
  if (effect.staccato) {
    return 50;
  }
  return effect.palmMute ? 75 : 100;
}

/** A note's audio settings from its duration percent; none when the percent is only what its effect implies. */
function audioOf(durationPercent: number, effect: NoteEffect): NoteAudio | undefined {
  return Math.round(durationPercent) === impliedDurationPercent(effect) ? undefined : toNoteAudio({ ...DEFAULT_NOTE_AUDIO, durationPercent });
}

function readNoteEffectsGp5(reader: ByteReader, effect: NoteEffect): NoteEffect {
  const flags1 = reader.readUnsignedByte();
  const flags2 = reader.readUnsignedByte();
  let result = effect;
  if ((flags1 & 0x01) !== 0) {
    result = withBend(result, readBendPoints(reader, bendValueFromGp));
  }
  if ((flags1 & 0x10) !== 0) {
    result = { ...result, grace: readGraceGp5(reader) };
  }
  if ((flags2 & 0x04) !== 0) {
    result = withTremoloPicking(result, readTremoloPicking(reader));
  }
  if ((flags2 & 0x08) !== 0) {
    result = { ...result, slides: slidesGp5(reader.readByte()) };
  }
  if ((flags2 & 0x10) !== 0) {
    result = withHarmonic(result, readHarmonicGp5(reader));
  }
  if ((flags2 & 0x20) !== 0) {
    result = withTrill(result, readTrill(reader));
  }
  return {
    ...result,
    hammer: (flags1 & 0x02) !== 0,
    letRing: (flags1 & 0x08) !== 0,
    vibrato: ((flags2 & 0x40) !== 0 || result.vibrato) && !result.wideVibrato,
    palmMute: (flags2 & 0x02) !== 0,
    staccato: (flags2 & 0x01) !== 0,
  };
}

function readGraceGp5(reader: ByteReader): Grace {
  const fret = reader.readUnsignedByte();
  const velocity = velocityFromGp(reader.readUnsignedByte());
  const transition = GRACE_TRANSITIONS[reader.readByte()] ?? 'none';
  const duration = reader.readUnsignedByte();
  const flags = reader.readUnsignedByte();
  return { fret, duration, velocity, transition, onBeat: (flags & 0x02) !== 0, isDead: (flags & 0x01) !== 0 };
}

const GP5_SLIDE_BITS: readonly (readonly [number, SlideType])[] = [
  [0x01, 'shift'],
  [0x02, 'legato'],
  [0x04, 'outDownwards'],
  [0x08, 'outUpwards'],
  [0x10, 'intoFromBelow'],
  [0x20, 'intoFromAbove'],
];

/** GP5 slide bitmask; TuxGuitar only records "slide", so a mask without known bits stays a shift slide. */
function slidesGp5(mask: number): readonly SlideType[] {
  const slides = GP5_SLIDE_BITS.filter(([bit]) => (mask & bit) !== 0).map(([, slide]) => slide);
  return slides.length > 0 ? slides : ['shift'];
}

function readHarmonicGp5(reader: ByteReader): Harmonic | undefined {
  switch (reader.readByte()) {
    case 1:
      return { type: 'natural', data: 0 };
    case 2:
      reader.skip(3); // harmonic note, accidental, octave — TuxGuitar keeps data 0 (AH12)
      return { type: 'artificial', data: artificialHarmonicOffset(0) };
    case 3:
      return { type: 'tapped', data: reader.readByte() }; // right-hand fret
    case 4:
      return { type: 'pinch', data: 0 };
    case 5:
      return { type: 'semi', data: 0 };
    default:
      return undefined;
  }
}
