import { createChannelName } from '../../src/formats/common/channels';
import { artificialHarmonicOffset } from '../../src/formats/common/harmonics';
import { MUSICAL_DIRECTIONS } from '../../src/formats/common/directions';
import { DEFAULT_RASGUEADO } from '../../src/formats/common/rasgueado';
import { velocityFromGp } from '../../src/formats/common/velocity';
import { impliedDurationPercent } from '../../src/formats/gtp/gp5';
import { clefFromTuning } from '../../src/formats/gtp/shared';
import { normalizeBeamGrouping } from '../../src/model/beaming';
import { DEFAULT_PERCUSSION_BANK, durationTicks, EMPTY_VOICE, NO_STROKE, NORMAL_TUPLET, plainDuration, QUARTER } from '../../src/model/defaults';
import type {
  BeamGrouping,
  Beat,
  Channel,
  Clef,
  Duration,
  Measure,
  MeasureHeader,
  Note,
  NoteEffect,
  NoteValue,
  Song,
  Stroke,
  Track,
  Voice,
} from '../../src/model/song';

/*
 * The song a GP5 round trip should return: the source song reduced to what GP5 (and our GP5 reader)
 * can hold. Written independently of src/write as the test oracle; every rule is a documented loss:
 *
 * - channels: mixer values in 17 steps, bank dropped (but percussion's 128), names made from the program; every
 *   drum channel plays on MIDI channel 10, so drum tracks on different channels read back on the first one (its
 *   mixer values; not modelled here, see edit-round-trip.test.ts);
 * - tracks: seven strings at most; lyrics on one track (the first with text); one clef per track
 *   (bass or treble); key signature per measure header (from the first non-percussion track);
 * - beats: voices 1 and 2 only; notes on the track's strings, one per string, in string order, frets
 *   0…99, velocities on the eight dynamics; fade in, tapping/slapping/popping, the tremolo bar and wide
 *   vibrato per voice (a wide vibrato replaces a note's slight one); strokes at 4…64; double dots and tuplets GP5 lacks written as an equal length when there is
 *   one (else dropped, which moves the beats after them); a tuplet inside a tuplet (GP7/GP8) likewise: an equal length
 *   when there is one (a triplet in a triplet = 9:8), else only the outer tuplet; an anacrusis starts at the measure start;
 * - effects: artificial harmonics as AH12, trills at 16/32/64, tremolo picking at 8/16/32;
 * - note audio settings: the duration percent only (no start offset, no velocity change), none when it is what the
 *   note's palm mute (75 %) or staccato (50 %) implies;
 * - measure headers: eight alternate endings at most; each musical direction on its first bar only; tempos are whole
 *   numbers (rounded); beam groups only as four groups of whole eighth notes;
 * - marks: no hairpins, fade outs, volume swells or sustain pedals; a rasgueado without its pattern (read back as the
 *   first pattern, DEFAULT_RASGUEADO);
 * - notation marks: no slashes (a beat's or a track's) and no cautionary or forced accidentals; the beam from a voice's
 *   last beat in the measure is dropped (GP5 keeps a beam on the beat after it); octave signs kept (GP3/GP4: dropped);
 * - ties: a tie that would change the note's fret is dropped (see withDroppedTies);
 * - the app's playback effects (track chains, the master mix): no place for them (only .gp keeps them, effects/song-effects.ts);
 * - the audio track (Guitar Pro 7/8's): GP3/GP4/GP5 have no place for it;
 * - the app's stylesheet and Design Mode layout (bars' `design`): only .gp keeps them (stylesheet/song-stylesheet.ts).
 */

const MAX_STRINGS = 7;
const MAX_FRET = 99;
const MAX_VOICES = 2;
/** The GP5 reader returns every artificial harmonic as AH12 (TuxGuitar's data 0). */
const GP5_ARTIFICIAL_HARMONIC = artificialHarmonicOffset(0);

const channelByte = (value: number): number => Math.min(16, Math.max(0, Math.round((Math.min(127, Math.max(0, value)) + 1) / 8)));
const channelValue = (value: number): number => Math.max(channelByte(value) * 8 - 1, 0);
const dynamicVelocity = (velocity: number): number => velocityFromGp(Math.min(8, Math.round((velocity + 1) / 16)));

/** The candidate note value nearest to `value` on a log scale (the first one on ties). */
function nearest(candidates: readonly NoteValue[], value: number): NoteValue {
  const distance = (candidate: number): number => Math.abs(Math.log2(candidate) - Math.log2(Math.max(1, value)));
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

/** Channels: mixer values in 17 steps, no bank but the percussion one, names made by the reader. */
function expectedChannels(channels: readonly Channel[]): Channel[] {
  const result: Channel[] = [];
  for (const channel of channels) {
    result.push({
      ...channel,
      name: createChannelName(result, channel.program, channel.isPercussion),
      bank: channel.isPercussion ? DEFAULT_PERCUSSION_BANK : 0,
      volume: channelValue(channel.volume),
      balance: channelValue(channel.balance),
      chorus: channelValue(channel.chorus),
      reverb: channelValue(channel.reverb),
      phaser: channelValue(channel.phaser),
      tremolo: channelValue(channel.tremolo),
    });
  }
  return result;
}

function expectedEffect(effect: NoteEffect): NoteEffect {
  const { harmonic, trill, tremoloPicking, grace } = effect;
  return {
    ...effect,
    ...(harmonic?.type === 'artificial' ? { harmonic: { ...harmonic, data: GP5_ARTIFICIAL_HARMONIC } } : {}),
    ...(trill === undefined ? {} : { trill: { ...trill, duration: plainDuration(nearest([16, 32, 64], trill.duration.value)) } }),
    ...(tremoloPicking === undefined
      ? {}
      : { tremoloPicking: { duration: plainDuration(nearest([8, 16, 32], tremoloPicking.duration.value)) } }),
    ...(grace === undefined
      ? {}
      : { grace: { ...grace, fret: Math.min(MAX_FRET, grace.fret), velocity: dynamicVelocity(grace.velocity) } }),
  };
}

/**
 * GP5 keeps fade in, tapping/slapping/popping, the tremolo bar and wide vibrato per beat: every note of the voice gets
 * them, and wide vibrato wins over a note's slight vibrato.
 */
function withVoiceEffects(notes: readonly Note[]): Note[] {
  const tremoloBar = [...notes].reverse().find((note) => note.effect.tremoloBar !== undefined)?.effect.tremoloBar;
  const fadeIn = notes.some((note) => note.effect.fadeIn);
  const wideVibrato = notes.some((note) => note.effect.wideVibrato);
  const tapping = notes.some((note) => note.effect.tapping);
  const slapping = !tapping && notes.some((note) => note.effect.slapping);
  const popping = !tapping && !slapping && notes.some((note) => note.effect.popping);
  return notes.map((note) => {
    const { tremoloBar: _ignored, fadeOut: _fadeOut, volumeSwell: _volumeSwell, ...rest } = note.effect;
    const effect = { ...rest, fadeIn, tapping, slapping, popping, wideVibrato, vibrato: rest.vibrato && !wideVibrato };
    return { ...note, effect: tremoloBar === undefined ? effect : { ...effect, tremoloBar } };
  });
}

/**
 * GP5 keeps a note's duration percent only (its start offset and velocity change are lost); the reader takes the
 * percent a palm mute or staccato implies for no setting (GP5 writes those by itself).
 */
function withGp5Audio(note: Note): Note {
  const { audio, ...rest } = note;
  if (audio === undefined || audio.durationPercent === 100 || audio.durationPercent === impliedDurationPercent(note.effect)) {
    return rest;
  }
  return { ...rest, audio: { durationPercent: audio.durationPercent, offsetPercent: 0, velocityOffset: 0 } };
}

/** GP3 and GP4 have no audio settings. */
function withoutAudio(track: Track): Track {
  const voice = (v: Voice): Voice => ({ ...v, notes: v.notes.map(({ audio: _dropped, ...note }) => note) });
  return { ...track, measures: track.measures.map((m) => ({ ...m, beats: m.beats.map((b) => ({ ...b, voices: b.voices.map(voice) })) })) };
}

function expectedNotes(voice: Voice, stringCount: number): Note[] {
  const byString = new Map<number, Note>();
  for (const note of voice.notes) {
    if (note.string >= 1 && note.string <= stringCount && !byString.has(note.string)) {
      byString.set(note.string, note);
    }
  }
  const notes = [...byString.values()].sort((a, b) => a.string - b.string);
  return withVoiceEffects(
    notes.map((note) => ({
      ...withGp5Audio(withoutAccidentalDisplay(note)),
      fret: Math.min(MAX_FRET, Math.max(0, note.fret)),
      velocity: dynamicVelocity(note.velocity),
      effect: expectedEffect(note.effect),
    })),
  );
}

/** Tuplets GP3–GP5 store (enters → times). */
const GP_TUPLETS: ReadonlyMap<number, number> = new Map([[3, 2], [5, 4], [6, 4], [7, 4], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8]]);
const ALL_VALUES: readonly NoteValue[] = [1, 2, 4, 8, 16, 32, 64];

function isGpTuplet(enters: number, times: number): boolean {
  return (enters === 1 && times === 1) || GP_TUPLETS.get(enters) === times;
}

/** GP5 has no double dot, no tuplet inside a tuplet and only the tuplets above: same length if it can, else drop them. */
function expectedDuration(duration: Duration): Duration {
  const { enters, times } = duration.tuplet;
  if (!duration.doubleDotted && duration.innerTuplet === undefined && isGpTuplet(enters, times)) {
    return duration;
  }
  const ticks = durationTicks(duration);
  const tuplets = [
    ...[...GP_TUPLETS].filter(([e]) => e === enters),
    [1, 1] as const,
    ...[...GP_TUPLETS].filter(([e]) => e !== enters),
  ];
  for (const [e, t] of tuplets) {
    for (const value of ALL_VALUES) {
      for (const dotted of [false, true]) {
        const candidate = { value, dotted, doubleDotted: false, tuplet: { enters: e, times: t } };
        if (durationTicks(candidate) === ticks) {
          return e === 1 ? { ...candidate, tuplet: NORMAL_TUPLET } : candidate;
        }
      }
    }
  }
  const tuplet = isGpTuplet(enters, times) ? duration.tuplet : NORMAL_TUPLET;
  return { value: duration.value, dotted: duration.dotted || duration.doubleDotted, doubleDotted: false, tuplet };
}

function withoutAccidentalDisplay(note: Note): Note {
  const { accidentalDisplay: _dropped, ...rest } = note;
  return rest;
}

function withoutSlash(voice: Voice): Voice {
  const { isSlashed: _dropped, ...rest } = voice;
  return rest;
}

function withoutBeam(voice: Voice): Voice {
  const { beamToNext: _dropped, ...rest } = voice;
  return rest;
}

function expectedVoice(voice: Voice | undefined, stringCount: number): Voice {
  if (voice === undefined || voice.isEmpty) {
    return voice ?? EMPTY_VOICE;
  }
  return { ...withoutSlash(voice), duration: expectedDuration(voice.duration), notes: expectedNotes(voice, stringCount) };
}

/** GP5 keeps a beam on the beat after it: the last beat of each voice loses its beam to the next. */
function withoutLastBeams(beats: readonly Beat[]): Beat[] {
  const last = [0, 1].map((voiceIndex) => beats.reduce((found, beat, index) => (beat.voices[voiceIndex]?.isEmpty === false ? index : found), -1));
  return beats.map((beat, index) =>
    last.includes(index) ? { ...beat, voices: beat.voices.map((voice, v) => (last[v] === index ? withoutBeam(voice) : voice)) } : beat,
  );
}

function expectedStroke(stroke: Stroke): Stroke {
  return stroke.direction === 'none' ? stroke : { ...stroke, value: nearest([64, 32, 16, 8, 4], stroke.value) };
}

function expectedBeat(beat: Beat, stringCount: number): Beat {
  const voices = Array.from({ length: MAX_VOICES }, (_, index) => expectedVoice(beat.voices[index], stringCount));
  const { hairpin: _hairpin, rasgueado, ...rest } = beat;
  return { ...rest, voices, stroke: expectedStroke(beat.stroke), ...(rasgueado === undefined ? {} : { rasgueado: DEFAULT_RASGUEADO }) };
}

function hasVoice(beat: Beat): boolean {
  return beat.voices.some((voice) => !voice.isEmpty);
}

/** Whether the GP5 reader, which lays every voice out from the measure start, puts a beat elsewhere. */
function needsRetiming(beats: readonly Beat[], measureStart: number): boolean {
  return [0, 1].some((voiceIndex) => {
    let cursor = measureStart;
    return beats.some((beat) => {
      const voice = beat.voices[voiceIndex];
      if (voice === undefined || voice.isEmpty) {
        return false;
      }
      const isMoved = beat.start !== cursor;
      cursor += durationTicks(voice.duration);
      return isMoved;
    });
  });
}

/** The first non-empty voice carries the beat's chord and text. */
function carrierOf(beat: Beat): number {
  return beat.voices.findIndex((voice) => !voice.isEmpty);
}

/** Lays the voices out again as the GP5 reader does (anacrusis shifts and lost double dots move beats). */
function retimed(beats: readonly Beat[], measureStart: number): Beat[] {
  const placed: Beat[] = [];
  [0, 1].forEach((voiceIndex) => {
    let cursor = measureStart;
    for (const beat of beats) {
      const voice = beat.voices[voiceIndex];
      if (voice === undefined || voice.isEmpty) {
        continue;
      }
      const index = placed.findIndex((candidate) => candidate.start === cursor);
      const base = placed[index] ?? { start: cursor, voices: [EMPTY_VOICE, EMPTY_VOICE], stroke: NO_STROKE, pickStroke: 'none' };
      const isCarrier = carrierOf(beat) === voiceIndex;
      const next: Beat = {
        ...base,
        voices: base.voices.map((current, i) => (i === voiceIndex ? voice : current)),
        stroke: beat.stroke.direction === 'none' ? base.stroke : beat.stroke,
        pickStroke: beat.pickStroke === 'none' ? base.pickStroke : beat.pickStroke,
        ...(isCarrier && beat.chord !== undefined ? { chord: beat.chord } : {}),
        ...(isCarrier && beat.text !== undefined ? { text: beat.text } : {}),
        ...(beat.rasgueado === undefined ? {} : { rasgueado: beat.rasgueado }),
        ...(base.ottava === undefined && beat.ottava !== undefined ? { ottava: beat.ottava } : {}),
      };
      placed.splice(index >= 0 ? index : placed.length, index >= 0 ? 1 : 0, next);
      cursor += durationTicks(voice.duration);
    }
  });
  return placed.sort((a, b) => a.start - b.start);
}

function expectedMeasure(measure: Measure, context: MeasureRules): Measure {
  const measureStart = context.measureStarts[measure.headerIndex] ?? 0;
  const projected = measure.beats.map((beat) => expectedBeat(beat, context.stringCount)).filter(hasVoice);
  const beats = needsRetiming(projected, measureStart) ? retimed(projected, measureStart) : projected;
  const { pedals: _pedals, ...rest } = measure;
  return { ...rest, clef: context.clef, keySignature: context.keySignatures[measure.headerIndex] ?? 0, beats: withoutLastBeams(beats) };
}

/** GP5 places each direction on one bar: the first that has it. */
function expectedDirections(headers: readonly MeasureHeader[]): MeasureHeader[] {
  return headers.map((header, index) => {
    const { directions, ...rest } = header;
    const kept = MUSICAL_DIRECTIONS.filter(
      (direction) => directions?.includes(direction) === true && headers.findIndex((other) => other.directions?.includes(direction) === true) === index,
    );
    return kept.length === 0 ? rest : { ...rest, directions: kept };
  });
}

interface MeasureRules {
  readonly stringCount: number;
  readonly clef: Clef;
  readonly keySignatures: readonly number[];
  readonly measureStarts: readonly number[];
}

function expectedTrack(track: Track, song: Song, lyricTrack: number | undefined): Track {
  const strings = track.strings.slice(0, MAX_STRINGS);
  const reference = song.tracks.find((candidate) => !candidate.isPercussion) ?? song.tracks[0];
  const keySignatures = track.isPercussion ? [] : (reference?.measures.map((measure) => measure.keySignature) ?? []);
  const clef: Clef = track.measures[0]?.clef === 'bass' ? 'bass' : 'treble';
  const measureStarts = song.measureHeaders.map((header) => header.start);
  const rules: MeasureRules = { stringCount: strings.length, clef, keySignatures, measureStarts };
  const { lyrics, hasSlashNotation: _slash, effects: _effects, ...rest } = track;
  return {
    ...rest,
    ...(lyrics !== undefined && track.number === lyricTrack ? { lyrics } : {}),
    strings,
    measures: track.measures.map((measure) => expectedMeasure(measure, rules)),
  };
}

function lyricTrackNumber(tracks: readonly Track[]): number | undefined {
  return (tracks.find((track) => (track.lyrics?.text ?? '') !== '') ?? tracks.find((track) => track.lyrics))?.number;
}

/**
 * GP3–GP5 files hold no fret for a tied note (the reader repeats the previous one), so the writer drops
 * a tie that would change the note's fret. Allowed here: a tie may be lost, the fret never.
 */
function withDroppedTies(expected: Song, actual: Song): Song {
  const tracks = expected.tracks.map((track, t) => ({
    ...track,
    measures: track.measures.map((measure, m) => ({
      ...measure,
      beats: measure.beats.map((beat, b) => ({
        ...beat,
        voices: beat.voices.map((voice, v) => ({
          ...voice,
          notes: voice.notes.map((note, n) => {
            const read = actual.tracks[t]?.measures[m]?.beats[b]?.voices[v]?.notes[n];
            const isDropped = note.isTied && read !== undefined && !read.isTied && read.fret === note.fret;
            return isDropped ? { ...note, isTied: false } : note;
          }),
        })),
      })),
    })),
  }));
  return { ...expected, tracks };
}

/** GP5's beam groups: four groups of whole eighth notes, else none (the time signature's). */
function expectedBeamGrouping(header: MeasureHeader): BeamGrouping | undefined {
  const grouping = normalizeBeamGrouping(header.beamGrouping, header.timeSignature);
  const eighths = grouping?.groups.map((size) => (size * 8) / grouping.unit) ?? [];
  if (grouping === undefined || eighths.length > 4 || !eighths.every(Number.isInteger)) {
    return undefined;
  }
  return normalizeBeamGrouping({ unit: 8, groups: eighths }, header.timeSignature);
}

function expectedHeaderGp5(header: MeasureHeader): MeasureHeader {
  const { beamGrouping: _replaced, design: _design, ...rest } = header;
  const beamGrouping = expectedBeamGrouping(header);
  return { ...rest, tempo: Math.round(header.tempo), repeatAlternative: header.repeatAlternative & 0xff, ...(beamGrouping === undefined ? {} : { beamGrouping }) };
}

/** GP3/GP4 hold no beam, slash, accidental display or octave sign. */
function withoutGp5Marks(measure: Measure): Measure {
  const beats = measure.beats.map(({ ottava: _ottava, ...beat }) => ({
    ...beat,
    voices: beat.voices.map((voice) => ({ ...withoutBeam(withoutSlash(voice)), notes: voice.notes.map(withoutAccidentalDisplay) })),
  }));
  return { ...measure, beats };
}

/** A measure without beats is written as Guitar Pro's empty quarter beat, which the GP3/GP4 readers take as a rest. */
function withEmptyMeasureRest(measure: Measure, start: number): Measure {
  if (measure.beats.length > 0) {
    return measure;
  }
  const rest: Beat = { start, voices: [{ duration: QUARTER, notes: [], isEmpty: false, direction: 'none' }, EMPTY_VOICE], stroke: NO_STROKE, pickStroke: 'none' };
  return { ...measure, beats: [rest] };
}

/**
 * The song a GP3/GP4 round trip should return for a song GP3/GP4 can hold (one voice, no GP5-only
 * effects): channels as for GP5, whole-number tempos, no note audio settings, the clef the GP3/GP4 readers derive from
 * the tuning, a quarter rest in a measure without beats, and no notation marks but fingering.
 */
export function expectedAfterGp34(song: Song, actual?: Song): Song {
  const { master: _master, audioTrack: _audioTrack, stylesheet: _stylesheet, ...rest } = song;
  const expected: Song = {
    ...rest,
    channels: expectedChannels(song.channels),
    measureHeaders: song.measureHeaders.map(({ beamGrouping: _dropped, design: _design, ...header }) => ({ ...header, tempo: Math.round(header.tempo) })),
    tracks: song.tracks.map(({ hasSlashNotation: _slash, effects: _effects, ...track }) => {
      const clef = clefFromTuning(track.strings, track.isPercussion);
      return withoutAudio({
        ...track,
        measures: track.measures.map((measure) => withEmptyMeasureRest({ ...withoutGp5Marks(measure), clef }, song.measureHeaders[measure.headerIndex]?.start ?? 0)),
      });
    }),
  };
  return actual === undefined ? expected : withDroppedTies(expected, actual);
}

/** `actual` (the song read back) only decides which ties were dropped. */
export function expectedAfterGp5(song: Song, actual?: Song): Song {
  const lyricTrack = lyricTrackNumber(song.tracks);
  const { master: _master, audioTrack: _audioTrack, stylesheet: _stylesheet, ...rest } = song;
  const expected: Song = {
    ...rest,
    channels: expectedChannels(song.channels),
    measureHeaders: expectedDirections(song.measureHeaders).map(expectedHeaderGp5),
    tracks: song.tracks.map((track) => expectedTrack(track, song, lyricTrack)),
  };
  return actual === undefined ? expected : withDroppedTies(expected, actual);
}

