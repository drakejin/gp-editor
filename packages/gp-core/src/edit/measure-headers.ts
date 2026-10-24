// Measure property edits after TuxGuitar's TGSongManager.changeTimeSignature / changeTempos / changeTripletFeel,
// TGTrackManager.changeKeySignature and TGUpdateMarkerAction / TGSongManager.removeMarker (LGPL-2.1), propagated the way
// Guitar Pro does.
import { NOTE_VALUES, measureTicks, roundTempo } from '../model/defaults';
import type { Marker, Measure, MeasureHeader, NoteValue, Song, TimeSignature, TripletFeel } from '../model/song';
import { headerTicks, relayoutMeasures } from './relayout';
import { replaceAt, hasSameItems } from './song-paths';
import { type VoiceEvents, eventsTicks, restEvents, hasSameEvents, toBeats, toMeasureVoices } from './timeline';
import { fitLimits, settleVoice } from './voice-fit';

export const MIN_TEMPO = 1;
export const MAX_TEMPO = 999;
const MIN_NUMERATOR = 1;
export const MAX_NUMERATOR = 32;
/** Seven flats … seven sharps. */
export const MAX_KEY_ACCIDENTALS = 7;
/** Largest repeat count every Guitar Pro format can store (GP3 keeps it in a signed byte). */
const MAX_REPEAT_CLOSE = 127;
/** Alternate endings 1–8, one bit each. */
const MAX_REPEAT_ALTERNATIVE = 0xff;
const TRIPLET_FEELS: readonly TripletFeel[] = ['none', 'eighth', 'sixteenth'];
/** Largest red, green or blue value of a marker colour. */
const MAX_COLOR_COMPONENT = 255;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** End (exclusive) of the run of measures from `from` that still have the value `from` has (GP's "until the next change"). */
export function runEnd<T>(items: readonly T[], from: number, isSame: (item: T) => boolean): number {
  let end = from + 1;
  while (end < items.length) {
    const item = items[end];
    if (item === undefined || !isSame(item)) {
      break;
    }
    end += 1;
  }
  return end;
}

function withoutBeamGrouping(header: MeasureHeader): MeasureHeader {
  const { beamGrouping: _dropped, ...rest } = header;
  return rest;
}

function nearestNoteValue(denominator: number): NoteValue {
  const exponent = clamp(Math.round(Math.log2(Math.max(1, denominator))), 0, NOTE_VALUES.length - 1);
  return NOTE_VALUES[exponent] ?? 4;
}

function clampTimeSignature(timeSignature: TimeSignature): TimeSignature | undefined {
  const { numerator, denominator } = timeSignature;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return undefined;
  }
  return { numerator: clamp(Math.round(numerator), MIN_NUMERATOR, MAX_NUMERATOR), denominator: nearestNoteValue(denominator) };
}

function isSameTimeSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

/**
 * One voice fitted to a new measure length: a voice that filled the old measure is padded with rests when it grows;
 * free rests past the new end are dropped or shortened. Notes may run past the end (GP shows the bar as too long) but
 * none may start outside it unless it already did; undefined then.
 */
function fitVoice(events: VoiceEvents, oldLength: number, newLength: number): VoiceEvents | undefined {
  const total = eventsTicks(events);
  const padding = total === oldLength && newLength > oldLength ? (restEvents(newLength - total) ?? []) : [];
  const limits = { eventsOutside: fitLimits(events, oldLength).eventsOutside, overhang: Number.POSITIVE_INFINITY };
  return settleVoice([...events, ...padding], newLength, limits);
}

/** The measure with its voices fitted to `newLength`; the same measure when nothing moves, undefined when a note would fall out. */
function fitMeasure(measure: Measure, header: MeasureHeader, newLength: number): Measure | undefined {
  const measureVoices = toMeasureVoices(measure, header.start);
  if (measureVoices === undefined) {
    return undefined;
  }
  const voices = measureVoices.voices.map((events) => fitVoice(events, headerTicks(header), newLength));
  const fitted = voices.filter((events): events is VoiceEvents => events !== undefined);
  if (fitted.length !== voices.length) {
    return undefined;
  }
  if (fitted.every((events, i) => hasSameEvents(events, measureVoices.voices[i] ?? []))) {
    return measure;
  }
  return { ...measure, beats: toBeats(header.start, { ...measureVoices, voices: fitted }, measure.beats) };
}

/**
 * New song with the time signature of `measureIndex` and of the following measures that had the same one (up to the
 * next change) set; numerator clamped to 1…32, denominator to the nearest note value. Every track's measures are
 * fitted to the new length and the later measures move. Same song when nothing changes or a note would no longer
 * start inside its measure.
 */
export function setTimeSignature(song: Song, measureIndex: number, timeSignature: TimeSignature): Song {
  const header = song.measureHeaders[measureIndex];
  const next = clampTimeSignature(timeSignature);
  if (header === undefined || next === undefined || isSameTimeSignature(header.timeSignature, next)) {
    return song;
  }
  const end = runEnd(song.measureHeaders, measureIndex, (other) => isSameTimeSignature(other.timeSignature, header.timeSignature));
  const isChanged = (index: number): boolean => index >= measureIndex && index < end;
  const newLength = measureTicks(next.numerator, next.denominator);
  const measuresByTrack = song.tracks.map((track) =>
    track.measures.map((measure, index) => {
      const measureHeader = song.measureHeaders[index];
      return isChanged(index) && measureHeader !== undefined ? fitMeasure(measure, measureHeader, newLength) : measure;
    }),
  );
  const fitted = measuresByTrack.map((measures) => measures.filter((measure): measure is Measure => measure !== undefined));
  if (fitted.some((measures, trackIndex) => measures.length !== measuresByTrack[trackIndex]?.length)) {
    return song;
  }
  // A bar's own beam grouping was for the old time signature.
  const headers = song.measureHeaders.map((other, index) => (isChanged(index) ? { ...withoutBeamGrouping(other), timeSignature: next } : other));
  return relayoutMeasures(song, headers, fitted);
}

/** The song with `change` applied to the header at `measureIndex` and to the following ones `isSame` holds for. */
function updateHeaderRun(
  song: Song,
  measureIndex: number,
  isSame: (header: MeasureHeader) => boolean,
  change: (header: MeasureHeader) => MeasureHeader,
): Song {
  const end = runEnd(song.measureHeaders, measureIndex, isSame);
  const measureHeaders = song.measureHeaders.map((header, index) => (index >= measureIndex && index < end ? change(header) : header));
  return { ...song, measureHeaders };
}

/**
 * New song with the tempo of `measureIndex` and of the following measures that had the same tempo set, clamped to
 * 1…999 and kept to two decimals. Same song when nothing changes.
 */
export function setTempo(song: Song, measureIndex: number, tempo: number): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined || !Number.isFinite(tempo)) {
    return song;
  }
  const next = clamp(roundTempo(tempo), MIN_TEMPO, MAX_TEMPO);
  if (next === header.tempo) {
    return song;
  }
  return updateHeaderRun(song, measureIndex, (other) => other.tempo === header.tempo, (other) => ({ ...other, tempo: next }));
}

/**
 * New song with the triplet feel (swing) of `measureIndex` and of the following measures that had the same feel set,
 * like setTempo: a feel holds until it changes. Same song when nothing changes or the feel is unknown.
 */
export function setTripletFeel(song: Song, measureIndex: number, tripletFeel: TripletFeel): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined || !TRIPLET_FEELS.includes(tripletFeel) || header.tripletFeel === tripletFeel) {
    return song;
  }
  return updateHeaderRun(song, measureIndex, (other) => other.tripletFeel === header.tripletFeel, (other) => ({ ...other, tripletFeel }));
}

function toColorComponent(value: number): number {
  return clamp(Math.round(value), 0, MAX_COLOR_COMPONENT) + 0;
}

function isSameMarker(a: Marker, b: Marker): boolean {
  return a.title === b.title && a.color.r === b.color.r && a.color.g === b.color.g && a.color.b === b.color.b;
}

function withoutMarker(header: MeasureHeader): MeasureHeader {
  const { marker: _removed, ...rest } = header;
  return rest;
}

/**
 * New song with the marker (section title and colour) of one measure set, the title trimmed and the colour components
 * kept in 0…255; none or a blank title removes it. Same song when nothing changes, a colour component is not a number
 * or the measure does not exist.
 */
export function setMeasureMarker(song: Song, measureIndex: number, marker: Marker | undefined): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return song;
  }
  const title = typeof marker?.title === 'string' ? marker.title.trim() : '';
  if (marker === undefined || title === '') {
    return header.marker === undefined ? song : { ...song, measureHeaders: replaceAt(song.measureHeaders, measureIndex, withoutMarker(header)) };
  }
  const { r, g, b } = marker.color;
  if (![r, g, b].every(Number.isFinite)) {
    return song;
  }
  const next: Marker = { title, color: { r: toColorComponent(r), g: toColorComponent(g), b: toColorComponent(b) } };
  if (header.marker !== undefined && isSameMarker(header.marker, next)) {
    return song;
  }
  return { ...song, measureHeaders: replaceAt(song.measureHeaders, measureIndex, { ...header, marker: next }) };
}

function keyMeasures(measures: readonly Measure[], measureIndex: number, keySignature: number): readonly Measure[] {
  const current = measures[measureIndex];
  if (current === undefined || current.keySignature === keySignature) {
    return measures;
  }
  const end = runEnd(measures, measureIndex, (other) => other.keySignature === current.keySignature);
  return measures.map((measure, index) => (index >= measureIndex && index < end ? { ...measure, keySignature } : measure));
}

/**
 * New song with the key signature (-7 flats … 7 sharps) of `measureIndex` set in every track, and in each track's
 * following measures that had the same key. Same song when nothing changes.
 */
export function setKeySignature(song: Song, measureIndex: number, keySignature: number): Song {
  if (!Number.isFinite(keySignature)) {
    return song;
  }
  const next = clamp(Math.round(keySignature), -MAX_KEY_ACCIDENTALS, MAX_KEY_ACCIDENTALS) + 0;
  const tracks = song.tracks.map((track) => {
    const measures = keyMeasures(track.measures, measureIndex, next);
    return measures === track.measures ? track : { ...track, measures };
  });
  return hasSameItems(tracks, song.tracks) ? song : { ...song, tracks };
}

export interface RepeatChange {
  readonly repeatOpen?: boolean;
  /** Repeat count; 0 removes the repeat close. */
  readonly repeatClose?: number;
  /** Bitmask of alternate endings (bit 0 = ending 1). */
  readonly repeatAlternative?: number;
}

function clampCount(value: number | undefined, current: number, max: number): number {
  return value === undefined || !Number.isFinite(value) ? current : clamp(Math.round(value), 0, max);
}

/** New song with the given repeat fields of one measure set (others kept). Same song when nothing changes. */
export function setRepeat(song: Song, measureIndex: number, repeat: RepeatChange): Song {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return song;
  }
  const repeatOpen = repeat.repeatOpen ?? header.repeatOpen;
  const repeatClose = clampCount(repeat.repeatClose, header.repeatClose, MAX_REPEAT_CLOSE);
  const repeatAlternative = clampCount(repeat.repeatAlternative, header.repeatAlternative, MAX_REPEAT_ALTERNATIVE);
  if (repeatOpen === header.repeatOpen && repeatClose === header.repeatClose && repeatAlternative === header.repeatAlternative) {
    return song;
  }
  return { ...song, measureHeaders: replaceAt(song.measureHeaders, measureIndex, { ...header, repeatOpen, repeatClose, repeatAlternative }) };
}
