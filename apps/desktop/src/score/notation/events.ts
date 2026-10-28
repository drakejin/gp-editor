import { ottavaOctaves as signOctaves } from '@gp-editor/core';
import type {
  AccidentalDisplay,
  BeamLink,
  DrumNoteheads,
  DrumTechnique,
  Duration,
  Finger,
  Grace,
  GraceTransition,
  Measure,
  Note,
  NoteEffect,
  StrokeDirection,
  Track,
  VoiceDirection,
} from '@gp-editor/core';
import type { MeasureLayout } from '../../lib/layout';
import { drumPlacement } from './drum-notes';
import { OTTAVA, STAFF } from './metrics';
import {
  type Accidental,
  type ClefKind,
  type PitchedClef,
  type StaffPitch,
  keyAlter,
  measureAccidentals,
  spellPitch,
  staffPosition,
  writtenMidi,
} from './pitch';

const STEPS_PER_OCTAVE = 7;

/** A grace note before a staff note, on its own pitch. */
export interface GraceNote {
  /** Staff position as drawn (moved with the main note by any ottava). */
  readonly position: number;
  readonly accidental?: Accidental;
  readonly isOnBeat: boolean;
  readonly transition: GraceTransition;
}

/** A note placed on the staff. */
export interface StaffNote {
  readonly string: number;
  readonly fret: number;
  /** Staff position as drawn (after any ottava): 0 = bottom line, 8 = top line. */
  readonly position: number;
  readonly accidental?: Accidental;
  readonly isCross: boolean;
  readonly isTied: boolean;
  readonly effect: NoteEffect;
  readonly grace?: GraceNote;
  /** The accidental is a reminder, written in parentheses. */
  readonly isCautionary?: boolean;
  /** The rhythm slash standing for a slashed beat's notes. */
  readonly isSlash?: boolean;
  readonly leftFinger?: Finger;
  readonly rightFinger?: Finger;
  /** A drum's noteheads in Guitar Pro's kit, drawn in place of the plain one (a dead note stays an x). */
  readonly drumNoteheads?: DrumNoteheads;
  /** A drum's technique symbol in Guitar Pro's kit (the ride's edge, a choke, a mute's parentheses …). */
  readonly drumTechnique?: DrumTechnique;
}

/** One non-empty voice of one beat: a chord, a single note or a rest. */
export interface VoiceEvent {
  readonly beatIndex: number;
  readonly voiceIndex: number;
  /** Beat centre, shared with the tab staff. */
  readonly x: number;
  readonly start: number;
  readonly duration: Duration;
  readonly direction: VoiceDirection;
  /** The beat's strum (an arrow beside the chord). */
  readonly stroke: StrokeDirection;
  /** The beat's pick stroke (a bowing mark above the staff). */
  readonly pickStroke: StrokeDirection;
  /** Staff position of a rest moved clear of another voice; the usual place when absent. */
  readonly restPosition?: number;
  /** Lowest staff position first; empty for a rest. */
  readonly notes: readonly StaffNote[];
  /** Octaves the notes are drawn below (8va, positive) or above (8vb, negative) their written place. */
  readonly ottava: number;
  /** The shift is the beat's octave sign (`Beat.ottava`), not one the engraver chose for notes far off the staff. */
  readonly isWrittenOttava?: boolean;
  /** The beam to the voice's next beat, set by hand. */
  readonly beamToNext?: BeamLink;
  /** Written as a rhythm slash (the beat's, or its track's slash notation). */
  readonly isSlashed?: boolean;
}

type RawEvent = Omit<VoiceEvent, 'notes' | 'ottava'> & {
  readonly notes: readonly Note[];
};

/**
 * The measure's voices in playing order, notes placed on the staff with their accidentals, each written `transposition`
 * above its sound (trackTransposition).
 */
export function buildVoiceEvents(
  track: Track,
  measure: Measure,
  layout: MeasureLayout,
  clef: ClefKind,
  transposition: number,
): VoiceEvent[] {
  const raw = rawEvents(measure, layout, track.hasSlashNotation === true);
  const placed =
    clef === 'percussion'
      ? raw.map(event => event.notes.map(placeDrum))
      : placePitched(raw, track, measure.keySignature, clef, transposition);
  const sorted = placed.map(notes =>
    [...notes].sort((a, b) => a.position - b.position),
  );
  const written = writtenOttavas(raw, sorted, measure, clef);
  const voiceOttavas = new Map(
    [...new Set(raw.map(event => event.voiceIndex))].map(voiceIndex => [
      voiceIndex,
      voiceOttava(
        // Slashes sit on the middle line: their notes move nothing.
        sorted
          .filter(
            (_, i) =>
              raw[i]?.voiceIndex === voiceIndex &&
              raw[i]?.isSlashed !== true &&
              written[i] === 0,
          )
          .flat(),
      ),
    ]),
  );
  return raw.map((event, index) => {
    const notes = sorted[index] ?? [];
    const sign = written[index] ?? 0;
    const ottava =
      sign !== 0
        ? sign
        : voiceOttavas.get(event.voiceIndex) ?? chordOttava(notes);
    const shift = ottava * STEPS_PER_OCTAVE;
    const shifted = {
      ...event,
      notes: shift === 0 ? notes : notes.map(note => shiftNote(note, shift)),
      ottava,
      ...(sign !== 0 ? { isWrittenOttava: true } : {}),
    };
    return event.isSlashed === true ? asSlash(shifted) : shifted;
  });
}

/**
 * The octave shift the beat's own sign writes each event at (0: none), deciding it before the engraver picks one for
 * notes far off the staff. A sign that would move the notes out of the staff's room (an 8va over low notes) is drawn as
 * no sign: the row has no room for them.
 */
function writtenOttavas(
  raw: readonly RawEvent[],
  sorted: readonly (readonly StaffNote[])[],
  measure: Measure,
  clef: ClefKind,
): readonly number[] {
  return raw.map((event, index) => {
    const octaves =
      clef === 'percussion'
        ? 0
        : signOctaves(measure.beats[event.beatIndex]?.ottava);
    const shift = octaves * STEPS_PER_OCTAVE;
    const fits = (sorted[index] ?? []).every(
      note =>
        note.position - shift <= OTTAVA.highest &&
        note.position - shift >= OTTAVA.lowest,
    );
    return fits ? octaves : 0;
  });
}

/** A slashed beat's notes become one slash on the middle line, with the first note's string and effects. */
function asSlash(event: VoiceEvent): VoiceEvent {
  const [first] = event.notes;
  if (first === undefined) {
    return event;
  }
  const slash: StaffNote = {
    string: first.string,
    fret: first.fret,
    position: STAFF.middleLine,
    isCross: false,
    isTied: event.notes.every(note => note.isTied),
    effect: first.effect,
    isSlash: true,
  };
  // A written sign stays the event's, so the sign's mark runs on over the slash; the engraver's own shift does not.
  return { ...event, notes: [slash], ottava: event.isWrittenOttava === true ? event.ottava : 0 };
}

function shiftNote(note: StaffNote, shift: number): StaffNote {
  const grace =
    note.grace === undefined
      ? undefined
      : { ...note.grace, position: note.grace.position - shift };
  return { ...note, position: note.position - shift, grace };
}

function rawEvents(
  measure: Measure,
  layout: MeasureLayout,
  isTrackSlashed: boolean,
): RawEvent[] {
  return layout.beats.flatMap(({ beatIndex, x }) => {
    const beat = measure.beats[beatIndex];
    if (beat === undefined) {
      return [];
    }
    return beat.voices.flatMap((voice, voiceIndex) =>
      voice.isEmpty
        ? []
        : [
            {
              beatIndex,
              voiceIndex,
              x,
              start: beat.start,
              duration: voice.duration,
              direction: voice.direction,
              stroke: beat.stroke.direction,
              pickStroke: beat.pickStroke,
              notes: voice.notes,
              ...(voice.beamToNext === undefined
                ? {}
                : { beamToNext: voice.beamToNext }),
              ...(isTrackSlashed || voice.isSlashed === true
                ? { isSlashed: true }
                : {}),
            },
          ],
    );
  });
}

function graceNote(
  grace: Grace,
  position: number,
  accidental?: Accidental,
): GraceNote {
  return {
    position,
    accidental,
    isOnBeat: grace.onBeat,
    transition: grace.transition,
  };
}

/** A drum note on the percussion staff, where and as Guitar Pro's kit writes its key (the drum key draws it too). */
export function placeDrum(note: Note): StaffNote {
  const { position, noteheads, technique } = drumPlacement(note.fret);
  const { grace } = note.effect;
  return {
    string: note.string,
    fret: note.fret,
    position,
    isCross: note.effect.deadNote,
    drumNoteheads: noteheads,
    ...(technique === undefined ? {} : { drumTechnique: technique }),
    isTied: note.isTied,
    effect: note.effect,
    grace:
      grace === undefined
        ? undefined
        : graceNote(grace, drumPlacement(grace.fret).position),
  };
}

const ACCIDENTAL_OF_ALTER: Readonly<Record<number, Accidental>> = {
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
};

/** A grace note on the same string: its own spelling, with an accidental where it leaves the key. */
function placeGrace(
  track: Track,
  note: Note,
  keySignature: number,
  clef: PitchedClef,
  transposition: number,
): GraceNote | undefined {
  const { grace } = note.effect;
  if (grace === undefined) {
    return undefined;
  }
  const pitch = spellPitch(
    writtenMidi(track, { ...note, fret: grace.fret }, transposition),
    keySignature,
  );
  const letter =
    ((pitch.step % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
  const accidental =
    pitch.alter === keyAlter(letter, keySignature)
      ? undefined
      : ACCIDENTAL_OF_ALTER[pitch.alter];
  return graceNote(grace, staffPosition(pitch.step, clef), accidental);
}

function placePitched(
  raw: readonly RawEvent[],
  track: Track,
  keySignature: number,
  clef: PitchedClef,
  transposition: number,
): StaffNote[][] {
  const pitches = raw.map(event =>
    event.notes.map(note => ({
      note,
      pitch: {
        ...spellPitch(writtenMidi(track, note, transposition), keySignature),
        isTied: note.isTied,
      },
    })),
  );
  const accidentals = measureAccidentals(
    pitches.map(chord => chord.map(({ pitch }) => pitch)),
    keySignature,
  );
  return pitches.map((chord, i) =>
    chord.map(({ note, pitch }, j) => ({
      string: note.string,
      fret: note.fret,
      position: staffPosition(pitch.step, clef),
      ...shownAccidental(accidentals[i]?.[j], pitch, note.accidentalDisplay),
      isCross: note.effect.deadNote,
      isTied: note.isTied,
      effect: note.effect,
      grace: placeGrace(track, note, keySignature, clef, transposition),
      ...fingersOf(note),
    })),
  );
}

/**
 * The accidental the bar needs, else the one the note asks to show: always (forced) or as a reminder in parentheses
 * (cautionary). A tied note shows none.
 */
function shownAccidental(
  needed: Accidental | undefined,
  pitch: StaffPitch,
  display: AccidentalDisplay | undefined,
): Pick<StaffNote, 'accidental' | 'isCautionary'> {
  if (needed !== undefined || display === undefined || pitch.isTied) {
    return { accidental: needed };
  }
  const accidental = ACCIDENTAL_OF_ALTER[pitch.alter];
  return display === 'cautionary'
    ? { accidental, isCautionary: true }
    : { accidental };
}

function fingersOf(note: Note): Pick<StaffNote, 'leftFinger' | 'rightFinger'> {
  return {
    ...(note.leftFinger === undefined ? {} : { leftFinger: note.leftFinger }),
    ...(note.rightFinger === undefined
      ? {}
      : { rightFinger: note.rightFinger }),
  };
}

/** Octaves to move notes so they stay within four ledger lines above or about five below the staff. */
function ottavaOctaves(lowest: number, highest: number): number {
  if (highest > OTTAVA.highest) {
    return Math.min(
      OTTAVA.maxOctaves,
      Math.ceil((highest - OTTAVA.highest) / STEPS_PER_OCTAVE),
    );
  }
  if (lowest < OTTAVA.lowest) {
    return -Math.min(
      OTTAVA.maxOctaves,
      Math.ceil((OTTAVA.lowest - lowest) / STEPS_PER_OCTAVE),
    );
  }
  return 0;
}

function chordOttava(sorted: readonly StaffNote[]): number {
  return ottavaOctaves(
    sorted[0]?.position ?? 0,
    sorted[sorted.length - 1]?.position ?? 0,
  );
}

/** One octave shift for a whole voice of the measure, or undefined when its range is too wide and each chord picks its own. */
function voiceOttava(notes: readonly StaffNote[]): number | undefined {
  if (notes.length === 0) {
    return 0;
  }
  const positions = notes.map(note => note.position);
  const lowest = Math.min(...positions);
  const highest = Math.max(...positions);
  const shift = ottavaOctaves(lowest, highest) * STEPS_PER_OCTAVE;
  const fits =
    highest - shift <= OTTAVA.highest && lowest - shift >= OTTAVA.lowest;
  return fits ? shift / STEPS_PER_OCTAVE : undefined;
}
