// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser#parseBar / #fixFirstMeasureStartPositions (LGPL-2.1).
import { MAX_VOICES, NO_STROKE, QUARTER, durationTicks, measureTicks } from '../../model/defaults';
import type {
  Beat,
  Chord,
  Clef,
  GuitarString,
  Hairpin,
  Measure,
  MeasureHeader,
  Note,
  RasgueadoPattern,
  Stroke,
  BeamLink,
  StrokeDirection,
  Voice,
} from '../../model/song';
import type { GpifAutomation, GpifBar, GpifBeat, GpifChord, GpifDocument, GpifVoice } from './gpif-document';
import { rhythmDuration, strokeValueFromTicks } from './gpif-duration';
import { type GraceSource, buildNote, notePosition } from './gpif-note';
import { rasgueadoFromGpif } from '../common/rasgueado';
import { pedalMarksOf } from './gpif-pedals';
import { lookupName } from './xml';

/** Guitar Pro 6+ bars have up to four voices; every beat keeps all four slots. */
export { MAX_VOICES };

const EMPTY_VOICE: Voice = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' };

const SIMILE_STEPS: Readonly<Record<string, number>> = { Simple: 1, FirstOfDouble: 2, SecondOfDouble: 2 };

const HAIRPINS: Readonly<Record<string, Hairpin>> = { Crescendo: 'crescendo', Decrescendo: 'decrescendo' };

export const CLEFS: Readonly<Record<string, Clef>> = { F4: 'bass', C3: 'alto', C4: 'tenor', Neutral: 'neutral' };

const MAX_ACCIDENTALS = 7;

/** What a measure needs to know about its track. */
export interface TrackLayout {
  readonly strings: readonly GuitarString[];
  readonly isPercussion: boolean;
  /** Index of the track's (first) staff in MasterBar.barIds. */
  readonly barIndex: number;
  readonly chords: ReadonlyMap<number, GpifChord>;
  /** The track's SustainPedal automations, by bar index (`pedalAutomationsByBar`). */
  readonly pedalAutomations: ReadonlyMap<number, readonly GpifAutomation[]>;
}

/** A beat under construction: voices are filled in voice by voice. */
interface BeatDraft {
  readonly start: number;
  readonly voices: (Voice | undefined)[];
  readonly usedStrings: Set<number>;
  stroke: Stroke;
  pickStroke: StrokeDirection;
  chord: Chord | undefined;
  text: string | undefined;
  hairpin: Hairpin | undefined;
  rasgueado: RasgueadoPattern | undefined;
}

export function buildMeasure(
  doc: GpifDocument,
  header: MeasureHeader,
  headerIndex: number,
  layout: TrackLayout,
): Measure {
  const accidentals = doc.masterBars[headerIndex]?.accidentalCount ?? 0;
  const bar = resolveBar(doc, headerIndex, layout.barIndex);
  const drafts = bar === undefined ? [] : buildDrafts(doc, bar, header, layout);
  const shift = header.number === 1 ? firstMeasureShift(drafts, header) : 0;
  const pedals = pedalMarksOf(layout.pedalAutomations.get(headerIndex), header);
  return {
    headerIndex,
    clef: lookupName(CLEFS, bar?.clef) ?? 'treble',
    keySignature: layout.isPercussion || Math.abs(accidentals) > MAX_ACCIDENTALS ? 0 : accidentals,
    beats: drafts.map((draft) => toBeat(draft, shift)),
    ...(pedals === undefined ? {} : { pedals }),
  };
}

function barAt(doc: GpifDocument, masterBarIndex: number, barIndex: number): GpifBar | undefined {
  const id = doc.masterBars[masterBarIndex]?.barIds[barIndex];
  return id === undefined ? undefined : doc.bars.get(id);
}

/** Follow simile marks back to the bar whose content is repeated. */
function resolveBar(doc: GpifDocument, masterBarIndex: number, barIndex: number): GpifBar | undefined {
  let index = masterBarIndex;
  let bar = barAt(doc, index, barIndex);
  while (bar?.simileMark !== undefined) {
    const step = lookupName(SIMILE_STEPS, bar.simileMark);
    if (step === undefined) {
      return bar;
    }
    index -= step;
    bar = index >= 0 ? barAt(doc, index, barIndex) : undefined;
  }
  return bar;
}

function buildDrafts(doc: GpifDocument, bar: GpifBar, header: MeasureHeader, layout: TrackLayout): BeatDraft[] {
  const drafts = new Map<number, BeatDraft>();
  bar.voiceIds.slice(0, MAX_VOICES).forEach((voiceId, slot) => {
    const voice = voiceId >= 0 ? doc.voices.get(voiceId) : undefined;
    if (voice !== undefined) {
      addVoice(doc, voice, slot, header.start, layout, drafts);
    }
  });
  return [...drafts.values()].sort((a, b) => a.start - b.start);
}

function addVoice(
  doc: GpifDocument,
  voice: GpifVoice,
  slot: number,
  measureStart: number,
  layout: TrackLayout,
  drafts: Map<number, BeatDraft>,
): void {
  let start = measureStart;
  let grace: GraceSource | undefined;
  for (const beatId of voice.beatIds) {
    const beat = doc.beats.get(beatId);
    if (beat === undefined) {
      continue;
    }
    const duration = rhythmDuration(doc.rhythms.get(beat.rhythmId));
    if (beat.graceNotes !== undefined) {
      // Grace notes are a beat of their own in GPIF; they decorate the next beat's notes.
      grace = { beat, notes: beatNotes(doc, beat), duration };
      continue;
    }
    const draft = draftAt(drafts, start);
    applyBeatProperties(draft, beat, layout);
    draft.voices[slot] = { duration, notes: buildNotes(doc, beat, grace, draft, layout), isEmpty: false, direction: 'none', ...voiceMarks(beat) };
    start += durationTicks(duration);
    grace = undefined;
  }
}

/** XProperty 1124204546: 1 = beam joined to the next beat, 2 = broken. */
const BEAM_MODES: Readonly<Record<number, BeamLink>> = { 1: 'join', 2: 'break' };
const SECONDARY_BEAM_BREAK = 1;

/** A broken beam wins over a secondary break, which wins over a joined beam (alphaTab's reading). */
function beamLinkOf(beat: GpifBeat): BeamLink | undefined {
  const mode = beat.beamMode === undefined ? undefined : BEAM_MODES[beat.beamMode];
  if (mode === 'break') {
    return mode;
  }
  return beat.secondaryBeamBreak === SECONDARY_BEAM_BREAK ? 'breakSecondary' : mode;
}

/** A voice's slash and beam marks, only when set. */
function voiceMarks(beat: GpifBeat): Pick<Voice, 'isSlashed' | 'beamToNext'> {
  const beamToNext = beamLinkOf(beat);
  return { ...(beat.slashed ? { isSlashed: true } : {}), ...(beamToNext === undefined ? {} : { beamToNext }) };
}

function beatNotes(doc: GpifDocument, beat: GpifBeat): GraceSource['notes'] {
  return (beat.noteIds ?? []).flatMap((id) => {
    const note = doc.notes.get(id);
    return note === undefined ? [] : [note];
  });
}

function draftAt(drafts: Map<number, BeatDraft>, start: number): BeatDraft {
  const existing = drafts.get(start);
  if (existing !== undefined) {
    return existing;
  }
  const draft: BeatDraft = {
    start,
    voices: [],
    usedStrings: new Set<number>(),
    stroke: NO_STROKE,
    pickStroke: 'none',
    chord: undefined,
    text: undefined,
    hairpin: undefined,
    rasgueado: undefined,
  };
  drafts.set(start, draft);
  return draft;
}

/**
 * Beat-level properties. Several voices share a beat; TuxGuitar lets every voice overwrite the
 * stroke, here the first voice that has one keeps it. Text and chord: the last voice that has one.
 */
function applyBeatProperties(draft: BeatDraft, beat: GpifBeat, layout: TrackLayout): void {
  const brush = strokeDirection(beat.brush);
  if (draft.stroke.direction === 'none' && brush !== 'none') {
    draft.stroke = { direction: brush, value: strokeValueFromTicks(beat.brushDuration) };
  }
  if (draft.pickStroke === 'none') {
    draft.pickStroke = strokeDirection(beat.pickStroke);
  }
  const text = beat.text.trim();
  if (text !== '') {
    draft.text = text;
  }
  const chord = beat.chordId === undefined ? undefined : layout.chords.get(beat.chordId);
  if (chord !== undefined) {
    draft.chord = buildChord(chord, layout.strings.length);
  }
  draft.hairpin ??= lookupName(HAIRPINS, beat.hairpin);
  draft.rasgueado ??= beat.rasgueado === undefined ? undefined : rasgueadoFromGpif(beat.rasgueado);
}

function strokeDirection(direction: string): StrokeDirection {
  if (direction === 'Down') {
    return 'down';
  }
  return direction === 'Up' ? 'up' : 'none';
}

/** TGChord from a GPIF diagram: GPIF string 0 is the lowest string, frets are relative to baseFret. */
function buildChord(chord: GpifChord, trackStrings: number): Chord {
  const diagram = chord.diagram;
  if (diagram === undefined) {
    return { name: chord.name, firstFret: 1, frets: Array.from({ length: trackStrings }, () => -1) };
  }
  const count = diagram.stringCount;
  const frets = Array.from({ length: count }, (_, index) => {
    const fret = diagram.frets[count - index - 1];
    return fret === undefined ? -1 : fret + diagram.baseFret;
  });
  // GPIF baseFret is 0-based; the model (like GP3–5) counts the first fret from 1.
  return { name: chord.name, firstFret: diagram.baseFret + 1, frets };
}

function buildNotes(
  doc: GpifDocument,
  beat: GpifBeat,
  grace: GraceSource | undefined,
  draft: BeatDraft,
  layout: TrackLayout,
): readonly Note[] {
  const notes: Note[] = [];
  for (const note of beatNotes(doc, beat)) {
    const position = notePosition(note, layout.strings, draft.usedStrings, layout.isPercussion);
    if (position === undefined) {
      continue;
    }
    draft.usedStrings.add(position.string);
    const tuning = layout.strings.find((s) => s.number === position.string)?.tuning ?? 0;
    notes.push(buildNote(note, position, { beat, grace, tuning }));
  }
  return notes;
}

/** fixFirstMeasureStartPositions: an incomplete first bar (anacrusis) is played at the end of the bar. */
function firstMeasureShift(drafts: readonly BeatDraft[], header: MeasureHeader): number {
  const measureEnd = header.start + measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  let maximumEnd = 0;
  for (const draft of drafts) {
    for (const voice of draft.voices) {
      if (voice !== undefined) {
        maximumEnd = Math.max(maximumEnd, draft.start + durationTicks(voice.duration));
      }
    }
  }
  return drafts.length > 0 && maximumEnd < measureEnd ? measureEnd - maximumEnd : 0;
}

function toBeat(draft: BeatDraft, shift: number): Beat {
  return {
    start: draft.start + shift,
    voices: Array.from({ length: MAX_VOICES }, (_, slot) => draft.voices[slot] ?? EMPTY_VOICE),
    stroke: draft.stroke,
    pickStroke: draft.pickStroke,
    ...(draft.chord === undefined ? {} : { chord: draft.chord }),
    ...(draft.text === undefined ? {} : { text: draft.text }),
    ...(draft.hairpin === undefined ? {} : { hairpin: draft.hairpin }),
    ...(draft.rasgueado === undefined ? {} : { rasgueado: draft.rasgueado }),
  };
}
