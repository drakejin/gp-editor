import type { Duration, Measure, Note, Track, VoiceDirection } from '@gp-editor/core';
import type { MeasureLayout } from '../../lib/layout';
import { OTTAVA } from './metrics';
import {
  type Accidental,
  type ClefKind,
  type PitchedClef,
  drumPlacement,
  measureAccidentals,
  spellPitch,
  staffPosition,
  writtenMidi,
} from './pitch';

const STEPS_PER_OCTAVE = 7;

/** A note placed on the staff. */
export interface StaffNote {
  readonly string: number;
  /** Staff position as drawn (after any ottava): 0 = bottom line, 8 = top line. */
  readonly position: number;
  readonly accidental?: Accidental;
  readonly isCross: boolean;
  readonly isTied: boolean;
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
  /** Lowest staff position first; empty for a rest. */
  readonly notes: readonly StaffNote[];
  /** Octaves the notes are drawn below (8va, positive) or above (8vb, negative) their written place. */
  readonly ottava: number;
}

type RawEvent = Omit<VoiceEvent, 'notes' | 'ottava'> & { readonly notes: readonly Note[] };

/** The measure's voices in playing order, notes placed on the staff with their accidentals. */
export function buildVoiceEvents(track: Track, measure: Measure, layout: MeasureLayout, clef: ClefKind): VoiceEvent[] {
  const raw = rawEvents(measure, layout);
  const placed = clef === 'percussion' ? raw.map((event) => event.notes.map(placeDrum)) : placePitched(raw, track, measure.keySignature, clef);
  const sorted = placed.map((notes) => [...notes].sort((a, b) => a.position - b.position));
  const voiceOttavas = new Map(
    [...new Set(raw.map((event) => event.voiceIndex))].map((voiceIndex) => [
      voiceIndex,
      voiceOttava(sorted.filter((_, i) => raw[i]?.voiceIndex === voiceIndex).flat()),
    ]),
  );
  return raw.map((event, index) => {
    const notes = sorted[index] ?? [];
    const ottava = voiceOttavas.get(event.voiceIndex) ?? chordOttava(notes);
    const shift = ottava * STEPS_PER_OCTAVE;
    return { ...event, notes: shift === 0 ? notes : notes.map((note) => ({ ...note, position: note.position - shift })), ottava };
  });
}

function rawEvents(measure: Measure, layout: MeasureLayout): RawEvent[] {
  return layout.beats.flatMap(({ beatIndex, x }) => {
    const beat = measure.beats[beatIndex];
    if (beat === undefined) {
      return [];
    }
    return beat.voices.flatMap((voice, voiceIndex) =>
      voice.isEmpty
        ? []
        : [{ beatIndex, voiceIndex, x, start: beat.start, duration: voice.duration, direction: voice.direction, notes: voice.notes }],
    );
  });
}

function placeDrum(note: Note): StaffNote {
  const { position, isCross } = drumPlacement(note.fret);
  return { string: note.string, position, isCross: isCross || note.effect.deadNote, isTied: note.isTied };
}

function placePitched(raw: readonly RawEvent[], track: Track, keySignature: number, clef: PitchedClef): StaffNote[][] {
  const pitches = raw.map((event) =>
    event.notes.map((note) => ({ note, pitch: { ...spellPitch(writtenMidi(track, note), keySignature), isTied: note.isTied } })),
  );
  const accidentals = measureAccidentals(
    pitches.map((chord) => chord.map(({ pitch }) => pitch)),
    keySignature,
  );
  return pitches.map((chord, i) =>
    chord.map(({ note, pitch }, j) => ({
      string: note.string,
      position: staffPosition(pitch.step, clef),
      accidental: accidentals[i]?.[j],
      isCross: note.effect.deadNote,
      isTied: note.isTied,
    })),
  );
}

/** Octaves to move notes so they stay within four ledger lines above or about five below the staff. */
function ottavaOctaves(lowest: number, highest: number): number {
  if (highest > OTTAVA.highest) {
    return Math.min(OTTAVA.maxOctaves, Math.ceil((highest - OTTAVA.highest) / STEPS_PER_OCTAVE));
  }
  if (lowest < OTTAVA.lowest) {
    return -Math.min(OTTAVA.maxOctaves, Math.ceil((OTTAVA.lowest - lowest) / STEPS_PER_OCTAVE));
  }
  return 0;
}

function chordOttava(sorted: readonly StaffNote[]): number {
  return ottavaOctaves(sorted[0]?.position ?? 0, sorted[sorted.length - 1]?.position ?? 0);
}

/** One octave shift for a whole voice of the measure, or undefined when its range is too wide and each chord picks its own. */
function voiceOttava(notes: readonly StaffNote[]): number | undefined {
  if (notes.length === 0) {
    return 0;
  }
  const positions = notes.map((note) => note.position);
  const lowest = Math.min(...positions);
  const highest = Math.max(...positions);
  const shift = ottavaOctaves(lowest, highest) * STEPS_PER_OCTAVE;
  const fits = highest - shift <= OTTAVA.highest && lowest - shift >= OTTAVA.lowest;
  return fits ? shift / STEPS_PER_OCTAVE : undefined;
}
