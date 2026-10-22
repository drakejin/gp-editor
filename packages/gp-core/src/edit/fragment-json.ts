import { MAX_VELOCITY } from '../formats/common/velocity';
import { NO_STROKE, STROKE_VALUES } from '../model/defaults';
import type { Note, Stroke, StrokeDirection } from '../model/song';
import { isRawObject } from '../transcription/parse-values';
import { MAX_STRINGS } from '../write/gtp-song';
import { STROKE_DIRECTIONS } from './beat-attributes';
import { type BeatFragment, type BeatFragmentItem, settleFragmentTies } from './beat-fragment';
import { MAX_FRET } from './edit-song';
import { isIntegerIn, parseChord, parseDuration, parseNoteEffect } from './fragment-values-json';
import { sortByString } from './song-paths';

/** What a serialized fragment says it is, so text from elsewhere on the clipboard is never taken for one. */
const FRAGMENT_FORMAT = 'gp-editor.beats';
const FRAGMENT_VERSION = 1;
/** Beats a fragment may hold (a long song of sixteenths fits). */
export const MAX_FRAGMENT_ITEMS = 8192;
/** Characters a beat text may have. */
const MAX_TEXT_LENGTH = 1024;
/** A drum track's frets are MIDI percussion keys. */
const MAX_PERCUSSION_KEY = 127;

/** The fragment as JSON, tagged with its format and version (parseBeatFragment reads it back). */
export function serializeBeatFragment(fragment: BeatFragment): string {
  return JSON.stringify({ format: FRAGMENT_FORMAT, version: FRAGMENT_VERSION, isPercussion: fragment.isPercussion, items: fragment.items });
}

function parseNote(value: unknown, maxFret: number): Note | undefined {
  if (!isRawObject(value) || !isIntegerIn(value.string, 1, MAX_STRINGS) || !isIntegerIn(value.fret, 0, maxFret)) {
    return undefined;
  }
  const effect = parseNoteEffect(value.effect, maxFret);
  if (!isIntegerIn(value.velocity, 0, MAX_VELOCITY) || typeof value.isTied !== 'boolean' || effect === undefined) {
    return undefined;
  }
  return { string: value.string, fret: value.fret, velocity: value.velocity, isTied: value.isTied, effect };
}

/** Up to one note per string, ordered by string. */
function parseNotes(value: unknown, maxFret: number): readonly Note[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_STRINGS) {
    return undefined;
  }
  const notes = value.map((note: unknown) => parseNote(note, maxFret));
  if (!notes.every((note): note is Note => note !== undefined) || new Set(notes.map((note) => note.string)).size !== notes.length) {
    return undefined;
  }
  return sortByString(notes);
}

function parseDirection(value: unknown): StrokeDirection | undefined {
  return STROKE_DIRECTIONS.find((direction) => direction === value);
}

/** A stroke up or down at a speed of STROKE_VALUES, or none (any stored speed reads as NO_STROKE). */
function parseStroke(value: unknown): Stroke | undefined {
  const direction = isRawObject(value) ? parseDirection(value.direction) : undefined;
  if (!isRawObject(value) || direction === undefined || typeof value.value !== 'number') {
    return undefined;
  }
  if (direction === 'none') {
    return value.value === 0 || STROKE_VALUES.includes(value.value) ? NO_STROKE : undefined;
  }
  return STROKE_VALUES.includes(value.value) ? { direction, value: value.value } : undefined;
}

/** No text, or 1…MAX_TEXT_LENGTH characters; `null` stands for invalid. */
function parseText(value: unknown): { readonly text?: string } | null {
  if (value === undefined) {
    return {};
  }
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_TEXT_LENGTH ? { text: value } : null;
}

function parseItem(value: unknown, maxFret: number): BeatFragmentItem | undefined {
  if (!isRawObject(value)) {
    return undefined;
  }
  const duration = parseDuration(value.duration);
  const notes = parseNotes(value.notes, maxFret);
  const stroke = parseStroke(value.stroke);
  const pickStroke = parseDirection(value.pickStroke);
  const text = parseText(value.text);
  const chord = value.chord === undefined ? undefined : parseChord(value.chord);
  if (duration === undefined || notes === undefined || stroke === undefined || pickStroke === undefined || text === null || (value.chord !== undefined && chord === undefined)) {
    return undefined;
  }
  return { duration, notes, stroke, pickStroke, ...(chord === undefined ? {} : { chord }), ...text };
}

/**
 * A fragment from untrusted JSON (the system clipboard), checked field by field: the format tag and version, 1 to
 * MAX_FRAGMENT_ITEMS beats, durations of Guitar Pro's note values and tuplets, notes on strings 1…MAX_STRINGS (one per
 * string) at frets 0…MAX_FRET (MIDI keys 0…127 for drums) with velocities 0…127 and well-formed effects, strokes, chord
 * diagrams and texts up to 1024 characters. Undefined when anything is off. Ties that do not start inside the fragment are removed.
 */
export function parseBeatFragment(value: unknown): BeatFragment | undefined {
  if (!isRawObject(value) || value.format !== FRAGMENT_FORMAT || value.version !== FRAGMENT_VERSION || typeof value.isPercussion !== 'boolean') {
    return undefined;
  }
  const { items, isPercussion } = value;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_FRAGMENT_ITEMS) {
    return undefined;
  }
  const maxFret = isPercussion ? MAX_PERCUSSION_KEY : MAX_FRET;
  const parsed: BeatFragmentItem[] = [];
  for (const item of items) {
    const next = parseItem(item, maxFret);
    if (next === undefined) {
      return undefined;
    }
    parsed.push(next);
  }
  return { isPercussion, items: settleFragmentTies(parsed) };
}
