import { NORMAL_TUPLET } from '../../src/model/defaults';
import type { Beat, Duration, Measure, MeasureHeader, Note, NoteEffect, Song, Track, Tuplet, Voice } from '../../src/model/song';

/*
 * The part of a score both gp-core and alphaTab read, as plain values: what the alphaTab cross-check compares. Built from
 * a gp-core `Song` here and from an alphaTab `Score` in alphatab-view.ts, the same way on both sides:
 *
 * - strings are numbered from 1 = highest (alphaTab counts from the lowest), tunings listed from the highest string;
 * - a bar is its voices, each the beats that voice plays (no empty beats), trailing empty voices left out; grace notes
 *   are a tag on the note they lead to (alphaTab keeps them as beats of their own before it), `grace:x` when dead; drum
 *   notes are their key and tie (alphaTab's drum grace notes keep a string their main note no longer has);
 * - track names without outer spaces (gp-core's GPIF reader trims them), track colours as "r g b";
 * - effects are sorted tags, e.g. `slide-out:shift`, `harmonic:natural`, `grace:5`, so a difference names them;
 * - a beat's chord name and text belong to the first voice playing in it (GP3–GP5 keep them on one voice's beat); its
 *   octave sign to every voice playing in it (GP5 and GPIF keep it on each voice's beat);
 * - a closing repeat is its play count (alphaTab's `repeatCount`; gp-core's `repeatClose` counts the repeats, one less);
 * - a bar's tempo is the one in effect at its end;
 * - lyrics are the letters and digits of the text (alphaTab splits it into syllables over the beats).
 */

export interface NoteView {
  /** 1 = highest string; 0 on percussion tracks (the drum key is the fret). */
  readonly string: number;
  readonly fret: number;
  readonly isTied: boolean;
  readonly effects: readonly string[];
}

export interface BeatView {
  /** Note value, dots, then tuplets as `(enters:times)`, e.g. `8.(3:2)`. */
  readonly duration: string;
  /** Sorted by string; empty for a rest. */
  readonly notes: readonly NoteView[];
  readonly effects: readonly string[];
}

export type VoiceView = readonly BeatView[];

export interface BarView {
  readonly voices: readonly VoiceView[];
}

export interface TrackView {
  readonly name: string;
  /** "r g b", 0–255 each. */
  readonly color: string;
  readonly isPercussion: boolean;
  /** Open-string pitches from the highest string. */
  readonly tuning: readonly number[];
  readonly capo: number;
  readonly lyrics: string;
  readonly bars: readonly BarView[];
}

export interface MasterBarView {
  readonly timeSignature: string;
  readonly keySignature: number;
  /** The tempo in effect at the end of the bar. */
  readonly tempo: number;
  readonly repeatOpen: boolean;
  /** How often a closing repeat plays the section (alphaTab's count; gp-core's `repeatClose` counts the repeats). */
  readonly playCount: number;
  readonly alternateEndings: number;
}

export interface ScoreView {
  readonly title: string;
  readonly artist: string;
  readonly tempo: number;
  readonly masterBars: readonly MasterBarView[];
  readonly tracks: readonly TrackView[];
}

/** The fret a dead grace note shows in a `grace:` tag. */
export const DEAD_GRACE = 'x';

/** Notes in string order, then fret, then effects: one order for both readers. */
export function sortedNotes(notes: readonly NoteView[]): NoteView[] {
  const key = (note: NoteView): string => note.effects.join(' ');
  return [...notes].sort((a, b) => a.string - b.string || a.fret - b.fret || key(a).localeCompare(key(b)));
}

/** Letters and digits only: how lyrics are compared. */
export function lyricLetters(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

function tupletText(tuplet: Tuplet | undefined): string {
  return tuplet === undefined || (tuplet.enters === tuplet.times) ? '' : `(${tuplet.enters}:${tuplet.times})`;
}

/** `value`, a dot per dot, then the tuplet and the tuplet inside it. */
export function durationText(value: number, dots: number, tuplet?: Tuplet, innerTuplet?: Tuplet): string {
  return `${value}${'.'.repeat(dots)}${tupletText(tuplet)}${tupletText(innerTuplet)}`;
}

function songDurationText(duration: Duration): string {
  const dots = duration.doubleDotted ? 2 : duration.dotted ? 1 : 0;
  return durationText(duration.value, dots, duration.tuplet ?? NORMAL_TUPLET, duration.innerTuplet);
}

const SLIDE_OUT_ORDER = ['shift', 'legato', 'outDownwards', 'outUpwards'] as const;
const SLIDE_IN_ORDER = ['intoFromBelow', 'intoFromAbove'] as const;

/** The slide tags alphaTab can hold: one slide out and one slide in, the first in Guitar Pro's flag order. */
function slideTags(effect: NoteEffect): string[] {
  const out = SLIDE_OUT_ORDER.find((slide) => effect.slides.includes(slide));
  const into = SLIDE_IN_ORDER.find((slide) => effect.slides.includes(slide));
  return [...(out === undefined ? [] : [`slide-out:${out}`]), ...(into === undefined ? [] : [`slide-in:${into}`])];
}

function vibratoTag(effect: NoteEffect): string[] {
  return effect.wideVibrato ? ['vibrato:wide'] : effect.vibrato ? ['vibrato:slight'] : [];
}

function noteTags(effect: NoteEffect): string[] {
  const flags: readonly (readonly [boolean, string])[] = [
    [effect.bend !== undefined, 'bend'],
    [effect.hammer, 'hammer'],
    [effect.palmMute, 'palm-mute'],
    [effect.letRing, 'let-ring'],
    [effect.deadNote, 'dead'],
    [effect.ghostNote, 'ghost'],
    [effect.staccato, 'staccato'],
    [effect.accentuatedNote, 'accent'],
    [effect.heavyAccentuatedNote, 'heavy-accent'],
  ];
  return [
    ...flags.filter(([isSet]) => isSet).map(([, tag]) => tag),
    ...slideTags(effect),
    ...vibratoTag(effect),
    ...(effect.harmonic === undefined ? [] : [`harmonic:${effect.harmonic.type}`]),
    ...(effect.grace === undefined ? [] : [`grace:${effect.grace.isDead ? DEAD_GRACE : effect.grace.fret}`]),
    ...(effect.trill === undefined ? [] : [`trill:${effect.trill.fret}`]),
  ].sort();
}

function noteView(note: Note, track: Track): NoteView {
  if (track.isPercussion) {
    const { grace: _grace, ...effect } = note.effect;
    return { string: 0, fret: note.fret, isTied: note.isTied, effects: noteTags(effect) };
  }
  return { string: note.string, fret: note.fret, isTied: note.isTied, effects: noteTags(note.effect) };
}

function beatTags(beat: Beat, voice: Voice, isCarrier: boolean): string[] {
  const any = (pick: (effect: NoteEffect) => boolean): boolean => voice.notes.some((note) => pick(note.effect));
  const flags: readonly (readonly [boolean, string])[] = [
    [any((effect) => effect.tremoloPicking !== undefined), 'tremolo-picking'],
    [any((effect) => effect.tremoloBar !== undefined), 'whammy'],
    [any((effect) => effect.tapping), 'tap'],
    [any((effect) => effect.slapping), 'slap'],
    [any((effect) => effect.popping), 'pop'],
    [any((effect) => effect.fadeIn), 'fade-in'],
  ];
  return [
    ...flags.filter(([isSet]) => isSet).map(([, tag]) => tag),
    ...(isCarrier && beat.chord !== undefined && beat.chord.name.trim() !== '' ? [`chord:${beat.chord.name.trim()}`] : []),
    ...(isCarrier && beat.text !== undefined && beat.text.trim() !== '' ? [`text:${beat.text.trim()}`] : []),
    ...(beat.ottava === undefined ? [] : [`ottava:${beat.ottava}`]),
  ].sort();
}

function beatView(beat: Beat, voiceIndex: number, track: Track): BeatView | undefined {
  const voice = beat.voices[voiceIndex];
  if (voice === undefined || voice.isEmpty) {
    return undefined;
  }
  const isCarrier = beat.voices.findIndex((candidate) => !candidate.isEmpty) === voiceIndex;
  const notes = sortedNotes(voice.notes.map((note) => noteView(note, track)));
  return { duration: songDurationText(voice.duration), notes, effects: beatTags(beat, voice, isCarrier) };
}

/** Voices up to the last one that plays; an empty voice before it is an empty list. */
export function trimVoices(voices: readonly VoiceView[]): VoiceView[] {
  const last = voices.reduce((found, voice, index) => (voice.length > 0 ? index : found), -1);
  return voices.slice(0, last + 1);
}

function barView(measure: Measure, track: Track): BarView {
  const voiceCount = Math.max(0, ...measure.beats.map((beat) => beat.voices.length));
  const voices = Array.from({ length: voiceCount }, (_, voiceIndex) =>
    measure.beats.flatMap((beat) => beatView(beat, voiceIndex, track) ?? []),
  );
  return { voices: trimVoices(voices) };
}

function trackView(track: Track): TrackView {
  return {
    name: track.name.trim(),
    color: `${track.color.r} ${track.color.g} ${track.color.b}`,
    isPercussion: track.isPercussion,
    tuning: track.strings.map((string) => string.tuning),
    capo: track.offset,
    lyrics: lyricLetters(track.lyrics?.text ?? ''),
    bars: track.measures.map((measure) => barView(measure, track)),
  };
}

function masterBarView(header: MeasureHeader, keySignature: number): MasterBarView {
  return {
    timeSignature: `${header.timeSignature.numerator}/${header.timeSignature.denominator}`,
    keySignature,
    tempo: header.tempo,
    repeatOpen: header.repeatOpen,
    playCount: header.repeatClose > 0 ? header.repeatClose + 1 : 0,
    alternateEndings: header.repeatAlternative,
  };
}

/** The view of a gp-core song; the key signature of a bar is the first pitched track's. */
export function viewFromSong(song: Song): ScoreView {
  const reference = song.tracks.find((track) => !track.isPercussion) ?? song.tracks[0];
  return {
    title: song.info.title,
    artist: song.info.artist,
    tempo: song.measureHeaders[0]?.tempo ?? 0,
    masterBars: song.measureHeaders.map((header, index) => masterBarView(header, reference?.measures[index]?.keySignature ?? 0)),
    tracks: song.tracks.map(trackView),
  };
}
