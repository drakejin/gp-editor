// alphaTab (https://github.com/CoderLine/alphaTab, MPL-2.0) is a test-only devDependency: an independent reader of
// GP3–GP5, GPX and GP7/GP8 files the cross-check reads our written files with. It is never bundled into the app.
import { importer, Logger, LogLevel, model, Settings } from '@coderline/alphatab';
import {
  type BarView,
  type BeatView,
  DEAD_GRACE,
  durationText,
  lyricLetters,
  type MasterBarView,
  type NoteView,
  type ScoreView,
  sortedNotes,
  type TrackView,
  trimVoices,
  type VoiceView,
} from './cross-check-view';

type Score = model.Score;
type Track = model.Track;
type Staff = model.Staff;
type Bar = model.Bar;
type Voice = model.Voice;
type Beat = model.Beat;
type Note = model.Note;
type MasterBar = model.MasterBar;

/**
 * Guitar Pro 3–5 store text in the system's code page: on Western systems (and in gp-core's writer) windows-1252.
 * alphaTab decodes GPIF documents (GPX, GP7/GP8) with the same setting, and they are UTF-8.
 */
const BINARY_TEXT_ENCODING = 'windows-1252';
const GPIF_TEXT_ENCODING = 'utf-8';

/** File families alphaTab decodes text differently in. */
export type AlphaTabFamily = 'binary' | 'gpif';

Logger.logLevel = LogLevel.None;

/** The score alphaTab reads from `bytes` (a GP3–GP5 file or a GPIF one), decoding its text as Guitar Pro does. */
export function readWithAlphaTab(bytes: Uint8Array, family: AlphaTabFamily): Score {
  const settings = new Settings();
  settings.importer.encoding = family === 'binary' ? BINARY_TEXT_ENCODING : GPIF_TEXT_ENCODING;
  return importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
}

const SLIDE_OUT: ReadonlyMap<model.SlideOutType, string> = new Map([
  [model.SlideOutType.Shift, 'shift'],
  [model.SlideOutType.Legato, 'legato'],
  [model.SlideOutType.OutDown, 'outDownwards'],
  [model.SlideOutType.OutUp, 'outUpwards'],
  [model.SlideOutType.PickSlideDown, 'pickSlideDown'],
  [model.SlideOutType.PickSlideUp, 'pickSlideUp'],
]);

const SLIDE_IN: ReadonlyMap<model.SlideInType, string> = new Map([
  [model.SlideInType.IntoFromBelow, 'intoFromBelow'],
  [model.SlideInType.IntoFromAbove, 'intoFromAbove'],
]);

const HARMONICS: ReadonlyMap<model.HarmonicType, string> = new Map([
  [model.HarmonicType.Natural, 'natural'],
  [model.HarmonicType.Artificial, 'artificial'],
  [model.HarmonicType.Pinch, 'pinch'],
  [model.HarmonicType.Tap, 'tapped'],
  [model.HarmonicType.Semi, 'semi'],
  [model.HarmonicType.Feedback, 'feedback'],
]);

const VIBRATOS: ReadonlyMap<model.VibratoType, string> = new Map([
  [model.VibratoType.Slight, 'slight'],
  [model.VibratoType.Wide, 'wide'],
]);

function tagged(prefix: string, table: ReadonlyMap<number, string>, value: number): string[] {
  const name = table.get(value);
  return name === undefined ? [] : [`${prefix}:${name}`];
}

function noteTags(note: Note, grace: string | undefined): string[] {
  const vibrato = note.vibrato === model.VibratoType.None ? note.beat.vibrato : note.vibrato;
  const flags: readonly (readonly [boolean, string])[] = [
    [note.hasBend, 'bend'],
    [note.isHammerPullOrigin, 'hammer'],
    [note.isPalmMute, 'palm-mute'],
    [note.isLetRing, 'let-ring'],
    [note.isDead, 'dead'],
    [note.isGhost, 'ghost'],
    [note.isStaccato, 'staccato'],
    [note.accentuated === model.AccentuationType.Normal, 'accent'],
    [note.accentuated === model.AccentuationType.Heavy, 'heavy-accent'],
  ];
  return [
    ...flags.filter(([isSet]) => isSet).map(([, tag]) => tag),
    ...tagged('slide-out', SLIDE_OUT, note.slideOutType),
    ...tagged('slide-in', SLIDE_IN, note.slideInType),
    ...tagged('vibrato', VIBRATOS, vibrato),
    ...tagged('harmonic', HARMONICS, note.harmonicType),
    ...(grace === undefined ? [] : [`grace:${grace}`]),
    ...(note.isTrill ? [`trill:${note.trillFret}`] : []),
  ].sort();
}

/** 1 = highest string: alphaTab counts from the lowest. */
function stringOf(note: Note, stringCount: number): number {
  return stringCount - note.string + 1;
}

/** A drum note's key: its articulation's MIDI note (GP7/GP8), else the articulation number (GP3–GP5: the key). */
function drumKey(note: Note, track: Track): number {
  const articulation = track.percussionArticulations[note.percussionArticulation];
  return articulation === undefined ? note.percussionArticulation : articulation.outputMidiNumber;
}

function noteView(note: Note, staff: Staff, graces: ReadonlyMap<number, string>): NoteView {
  if (staff.isPercussion) {
    return { string: 0, fret: drumKey(note, staff.track), isTied: note.isTieDestination, effects: noteTags(note, undefined) };
  }
  const string = stringOf(note, staff.tuning.length);
  return { string, fret: note.fret, isTied: note.isTieDestination, effects: noteTags(note, graces.get(string)) };
}

function beatTags(beat: Beat): string[] {
  const flags: readonly (readonly [boolean, string])[] = [
    [beat.isTremolo, 'tremolo-picking'],
    [beat.hasWhammyBar, 'whammy'],
    [beat.tap, 'tap'],
    [beat.slap, 'slap'],
    [beat.pop, 'pop'],
    [beat.fadeIn, 'fade-in'],
  ];
  const chordName = beat.chord?.name.trim() ?? '';
  const text = beat.text?.trim() ?? '';
  return [
    ...flags.filter(([isSet]) => isSet).map(([, tag]) => tag),
    ...(chordName === '' ? [] : [`chord:${chordName}`]),
    ...(text === '' ? [] : [`text:${text}`]),
    ...(beat.ottava === model.Ottavia.Regular ? [] : [`ottava:${model.Ottavia[beat.ottava].slice(1)}`]),
  ].sort();
}

function beatView(beat: Beat, staff: Staff, graces: ReadonlyMap<number, string>): BeatView {
  const tuplet = beat.hasTuplet ? { enters: beat.tupletNumerator, times: beat.tupletDenominator } : undefined;
  const notes = sortedNotes(beat.notes.map((note) => noteView(note, staff, graces)));
  return { duration: durationText(beat.duration, beat.dots, tuplet), notes, effects: beatTags(beat) };
}

/** A grace note's fret, or `x` when it is dead. */
function graceText(note: Note): string {
  return note.isDead ? DEAD_GRACE : String(note.fret);
}

/** The voice's beats; grace beats become a `grace:<fret>` tag on the note they lead to, on the same string. */
function voiceView(voice: Voice, staff: Staff): VoiceView {
  const beats: BeatView[] = [];
  let graces = new Map<number, string>();
  for (const beat of voice.beats) {
    if (beat.graceType !== model.GraceType.None) {
      graces = new Map([...graces, ...beat.notes.map((note) => [stringOf(note, staff.tuning.length), graceText(note)] as const)]);
    } else if (!beat.isEmpty) {
      beats.push(beatView(beat, staff, graces));
      graces = new Map();
    }
  }
  return beats;
}

function barView(bar: Bar): BarView {
  return { voices: trimVoices(bar.voices.map((voice) => voiceView(voice, bar.staff))) };
}

function lyricsOf(staff: Staff): string {
  const syllables = staff.bars.flatMap((bar) => (bar.voices[0]?.beats ?? []).map((beat) => beat.lyrics?.[0] ?? ''));
  return lyricLetters(syllables.join(''));
}

function colorOf(track: Track): string {
  return `${track.color.r} ${track.color.g} ${track.color.b}`;
}

function trackView(track: Track): TrackView {
  const staff = track.staves[0];
  if (staff === undefined) {
    return { name: track.name, color: colorOf(track), isPercussion: false, tuning: [], capo: 0, lyrics: '', bars: [] };
  }
  return {
    name: track.name.trim(),
    color: colorOf(track),
    isPercussion: staff.isPercussion,
    tuning: [...staff.tuning],
    capo: staff.capo,
    lyrics: lyricsOf(staff),
    bars: staff.bars.map(barView),
  };
}

/** The tempo at the end of each bar: the bar's last tempo change, else the one before. */
function tempos(masterBars: readonly MasterBar[], initial: number): number[] {
  let tempo = initial;
  return masterBars.map((masterBar) => {
    const changes = [...masterBar.tempoAutomations].sort((a, b) => a.ratioPosition - b.ratioPosition);
    tempo = changes[changes.length - 1]?.value ?? tempo;
    return tempo;
  });
}

function masterBarView(masterBar: MasterBar, keySignature: number, tempo: number): MasterBarView {
  return {
    timeSignature: `${masterBar.timeSignatureNumerator}/${masterBar.timeSignatureDenominator}`,
    keySignature,
    tempo,
    repeatOpen: masterBar.isRepeatStart,
    playCount: masterBar.repeatCount,
    alternateEndings: masterBar.alternateEndings,
  };
}

/** The view of an alphaTab score (see cross-check-view.ts); the key signature of a bar is the first pitched track's. */
export function viewFromScore(score: Score): ScoreView {
  const reference = score.tracks.find((track) => track.staves[0]?.isPercussion === false) ?? score.tracks[0];
  const barTempos = tempos(score.masterBars, score.tempo);
  return {
    title: score.title,
    artist: score.artist,
    tempo: score.tempo,
    masterBars: score.masterBars.map((masterBar, index) =>
      masterBarView(masterBar, reference?.staves[0]?.bars[index]?.keySignature ?? 0, barTempos[index] ?? score.tempo),
    ),
    tracks: score.tracks.map(trackView),
  };
}
