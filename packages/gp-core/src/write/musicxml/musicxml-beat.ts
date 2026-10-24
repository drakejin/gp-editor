// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeBeats (the notes of one beat; LGPL-2.1).
import { DEFAULT_VELOCITY } from '../../formats/common/velocity';
import { artificialHarmonicOffsetAtFret } from '../../formats/common/harmonics';
import { durationTicks } from '../../model/defaults';
import type { Grace, Note, Ottava, Stroke, Track } from '../../model/song';
import { type TrackFlow, type VoiceEvent, beatKey, eventKey, noteKey } from './musicxml-flow';
import type { NoteLyric, TrackLyrics } from './musicxml-lyrics';
import { noteElement, pitchElement, restElement, unpitchedElement } from './musicxml-note';
import { articulationsElement, ornamentsElement, technicalElement } from './musicxml-technical';
import { type XmlChild, type XmlNode, element, elementIfAny, textElement } from './xml-text';

/** The track being written, shared by all its measures. */
export interface PartContext {
  readonly track: Track;
  readonly partId: string;
  readonly flow: TrackFlow;
  readonly lyrics: TrackLyrics;
  /** Ticks per MusicXML division (tickUnit): durations are written in divisions. */
  readonly unit: number;
}

/** One staff of the part: 1 = notation, 2 = tab. */
export interface StaffSpec {
  readonly staff: 1 | 2;
  readonly isTab: boolean;
}

/** What else the event's notes carry: the tuplet bracket, and whether this voice holds the beat's text and lyric. */
export interface EventMarks {
  readonly tuplet?: 'start' | 'stop';
  /** The beat's first voice that is not empty: it carries the beat's text. */
  readonly isFirstVoice: boolean;
  /** The beat's first voice with notes: its first note carries the lyric. */
  readonly isLyricVoice: boolean;
}

/** MusicXML voices: 1–4 on the notation staff, 5–8 on the tab staff. */
const TAB_VOICE_OFFSET = 4;
/** MusicXML numbers slurs and slides 1–16; they are numbered by string. */
const MAX_SPANNER_NUMBER = 16;
const DYNAMICS_DECIMALS = 100;
const GRACE_TYPES: Readonly<Record<number, string>> = { 1: '64th', 2: '32nd', 3: '16th' };

export function voiceNumber(voiceIndex: number, staff: StaffSpec): number {
  return voiceIndex + 1 + (staff.isTab ? TAB_VOICE_OFFSET : 0);
}

function spannerNumber(string: number): number {
  return Math.max(1, Math.min(MAX_SPANNER_NUMBER, string));
}

/** The note's velocity as MusicXML's dynamics: a percentage of forte (TGVelocities.DEFAULT). */
function dynamicsPercent(velocity: number): number {
  return Math.round((velocity / DEFAULT_VELOCITY) * 100 * DYNAMICS_DECIMALS) / DYNAMICS_DECIMALS;
}

function openString(track: Track, string: number): number {
  return track.strings[string - 1]?.tuning ?? 0;
}

/** The sounding pitch: open string, fret and capo; a natural harmonic on the notation staff sounds its harmonic. */
function soundingPitch(track: Track, note: Note, isTab: boolean): number {
  const harmonic = note.effect.harmonic;
  const harmonicOffset = !isTab && harmonic?.type === 'natural' ? artificialHarmonicOffsetAtFret(note.fret) : 0;
  return openString(track, note.string) + track.offset + (harmonicOffset > 0 ? harmonicOffset : note.fret);
}

function soundOf(context: PartContext, fretOrKey: number, pitch: number, keySignature: number): { readonly sound: XmlNode; readonly instrument?: string } {
  if (context.track.isPercussion) {
    return { sound: unpitchedElement(fretOrKey), instrument: `${context.partId}-I${fretOrKey + 1}` };
  }
  return { sound: pitchElement(pitch, keySignature) };
}

function words(text: string, placement: 'above' | 'below', voice: number): XmlNode {
  return element('direction', { placement }, [element('direction-type', {}, [textElement('words', text)]), textElement('voice', voice), textElement('staff', 1)]);
}

/** An 8va or 15ma writes the notes lower (MusicXML's "down"), an 8vb or 15mb higher; the size counts the octave's notes. */
const OCTAVE_SHIFTS: Readonly<Record<Ottava, readonly [type: 'down' | 'up', size: number]>> = { '8va': ['down', 8], '8vb': ['up', 8], '15ma': ['down', 15], '15mb': ['up', 15] };

function octaveShift(ottava: Ottava, isStop: boolean): XmlNode {
  const [type, size] = OCTAVE_SHIFTS[ottava];
  return element('direction', {}, [element('direction-type', {}, [element('octave-shift', { type: isStop ? 'stop' : type, size })]), textElement('staff', 1)]);
}

/** The octave sign starting at the event's beat (before its notes) or ending with it (after them): its first voice carries it. */
function octaveShifts(context: PartContext, event: VoiceEvent, marks: EventMarks, isStop: boolean): XmlNode[] {
  const ottava = (isStop ? context.flow.ottavaStops : context.flow.ottavaStarts).get(beatKey(event.measureIndex, event.beatIndex));
  return marks.isFirstVoice && ottava !== undefined ? [octaveShift(ottava, isStop)] : [];
}

/** Directions written before the event's notes on the notation staff: beat text, octave sign, dynamics change, palm mute. */
function eventDirections(context: PartContext, event: VoiceEvent, marks: EventMarks, voice: number): XmlNode[] {
  const key = eventKey(event.measureIndex, event.beatIndex, event.voiceIndex);
  const dynamic = context.flow.dynamics.get(key);
  return [
    ...octaveShifts(context, event, marks, false),
    ...(marks.isFirstVoice && event.beat.text !== undefined && event.beat.text !== '' ? [words(event.beat.text, 'above', voice)] : []),
    ...(dynamic === undefined
      ? []
      : [element('direction', { placement: 'below' }, [element('direction-type', {}, [element('dynamics', {}, [element(dynamic)])]), textElement('staff', 1)])]),
    ...(context.flow.palmMuteStarts.has(key) ? [words('P.M.', 'below', voice)] : []),
  ];
}

function graceNotations(note: Note, grace: Grace, isTab: boolean): XmlNode | undefined {
  const number = spannerNumber(note.string);
  return elementIfAny('notations', [
    grace.transition === 'hammer' && element('slur', { type: 'start', number }),
    grace.transition === 'slide' && element('slide', { type: 'start', number }),
    isTab && element('technical', {}, [textElement('fret', grace.fret), textElement('string', note.string)]),
  ]);
}

/** The grace notes of an event, as one grace chord before it (a note's grace is on its own string). */
function graceElements(context: PartContext, event: VoiceEvent, staff: StaffSpec, keySignature: number): XmlNode[] {
  const graced = event.voice.notes.flatMap((note) => (note.effect.grace === undefined ? [] : [{ note, grace: note.effect.grace }]));
  return graced.map(({ note, grace }, index) => {
    const pitch = openString(context.track, note.string) + context.track.offset + grace.fret;
    return noteElement({
      grace: element('grace', { slash: grace.onBeat ? undefined : 'yes' }),
      isChord: index > 0,
      ...soundOf(context, grace.fret, pitch, keySignature),
      voice: voiceNumber(event.voiceIndex, staff),
      graceType: GRACE_TYPES[grace.duration] ?? GRACE_TYPES[3],
      hasStem: !staff.isTab,
      notehead: grace.isDead ? textElement('notehead', 'x') : undefined,
      staff: staff.staff,
      notations: graceNotations(note, grace, staff.isTab),
    });
  });
}

const CONNECTED_SLIDES = new Set(['shift', 'legato']);

function hasConnectedSlide(note: Note | undefined): boolean {
  return note?.effect.slides.some((slide) => CONNECTED_SLIDES.has(slide)) ?? false;
}

/** Slurs and slides this note ends (from the previous note or its grace note) and starts (to the next note). */
function spanners(note: Note, next: Note | undefined, previous: Note | undefined): XmlChild[] {
  const number = spannerNumber(note.string);
  const isSlurEnd = previous?.effect.hammer === true || previous?.effect.slides.includes('legato') === true || note.effect.grace?.transition === 'hammer';
  const isSlurStart = next !== undefined && (note.effect.hammer || note.effect.slides.includes('legato'));
  const isSlideEnd = hasConnectedSlide(previous) || note.effect.grace?.transition === 'slide';
  // A slide with no note after it on the string keeps its start (as TuxGuitar writes it), so the slide is not lost.
  const isSlideStart = hasConnectedSlide(note);
  return [
    isSlurEnd && element('slur', { type: 'stop', number }),
    isSlurStart && element('slur', { type: 'start', number }),
    isSlideEnd && element('slide', { type: 'stop', number }),
    isSlideStart && element('slide', { type: 'start', number, 'line-type': 'solid' }),
  ];
}

interface MainNoteInput {
  readonly context: PartContext;
  readonly event: VoiceEvent;
  readonly staff: StaffSpec;
  readonly marks: EventMarks;
  readonly keySignature: number;
  readonly lyric: NoteLyric | undefined;
}

function noteNotations(input: MainNoteInput, note: Note, index: number): XmlNode | undefined {
  const { context, event, staff, marks } = input;
  const key = noteKey(event, note.string);
  const next = context.flow.next.get(key);
  const previous = context.flow.previous.get(key);
  const isTieStart = next?.isTied === true;
  return elementIfAny('notations', [
    !staff.isTab && note.isTied && element('tied', { type: 'stop', orientation: 'over' }),
    !staff.isTab && isTieStart && element('tied', { type: 'start', orientation: 'over' }),
    note.effect.letRing && element('tied', { type: 'let-ring' }),
    ...spanners(note, next, previous),
    index === 0 && marks.tuplet !== undefined && element('tuplet', { type: marks.tuplet }),
    arpeggiateElement(event.beat.stroke),
    technicalElement({ note, next, previous, isTab: staff.isTab, isChordNote: index > 0, pickStroke: event.beat.pickStroke }),
    articulationsElement(note),
    ornamentsElement(note, event.voice.duration),
  ]);
}

/** A stroke as an arpeggio on each note: a down stroke goes from the low strings up, so its arrow points up. */
function arpeggiateElement(stroke: Stroke): XmlNode | undefined {
  return stroke.direction === 'none' ? undefined : element('arpeggiate', { direction: stroke.direction === 'down' ? 'up' : 'down' });
}

function lyricElement(lyric: NoteLyric): XmlNode {
  return element('lyric', { number: 1 }, [textElement('syllabic', lyric.syllabic), textElement('text', lyric.text)]);
}

function playElement(note: Note): XmlNode | undefined {
  if (note.effect.deadNote) {
    return element('play', {}, [textElement('mute', 'straight')]);
  }
  return note.effect.palmMute ? element('play', {}, [textElement('mute', 'palm')]) : undefined;
}

function noteheadOf(note: Note): XmlNode | undefined {
  if (note.effect.ghostNote) {
    return textElement('notehead', 'normal', { parentheses: 'yes' });
  }
  return note.effect.deadNote ? textElement('notehead', 'x') : undefined;
}

function mainNote(input: MainNoteInput, note: Note, index: number): XmlNode {
  const { context, event, staff } = input;
  const next = context.flow.next.get(noteKey(event, note.string));
  return noteElement({
    attributes: { dynamics: dynamicsPercent(note.velocity) },
    isChord: index > 0,
    ...soundOf(context, note.fret, soundingPitch(context.track, note, staff.isTab), input.keySignature),
    ticks: durationTicks(event.voice.duration) / context.unit,
    ties: [...(note.isTied ? ['stop' as const] : []), ...(next?.isTied === true ? ['start' as const] : [])],
    voice: voiceNumber(event.voiceIndex, staff),
    duration: event.voice.duration,
    hasStem: !staff.isTab,
    notehead: noteheadOf(note),
    staff: staff.staff,
    notations: noteNotations(input, note, index),
    lyric: index === 0 && input.lyric !== undefined ? lyricElement(input.lyric) : undefined,
    play: playElement(note),
  });
}

/** One voice of one beat on one staff: its directions (notation staff), grace notes and notes, or a rest; an octave sign's end after them. */
export function eventElements(context: PartContext, event: VoiceEvent, staff: StaffSpec, marks: EventMarks, keySignature: number): XmlNode[] {
  const voice = voiceNumber(event.voiceIndex, staff);
  const directions = staff.isTab ? [] : eventDirections(context, event, marks, voice);
  const after = staff.isTab ? [] : octaveShifts(context, event, marks, true);
  if (event.voice.notes.length === 0) {
    const notations = marks.tuplet === undefined ? undefined : element('notations', {}, [element('tuplet', { type: marks.tuplet })]);
    return [...directions, restElement(durationTicks(event.voice.duration) / context.unit, event.voice.duration, voice, staff.staff, notations), ...after];
  }
  const lyric = !staff.isTab && marks.isLyricVoice ? context.lyrics.get(event.measureIndex)?.get(event.beatIndex) : undefined;
  const input: MainNoteInput = { context, event, staff, marks, keySignature, lyric };
  return [...directions, ...graceElements(context, event, staff, keySignature), ...event.voice.notes.map((note, index) => mainNote(input, note, index)), ...after];
}

