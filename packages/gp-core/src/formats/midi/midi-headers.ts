// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader (LGPL-2.1): getHeader, parseTimeSignature and parseTempo, plus key signatures.
import { MAX_KEY_ACCIDENTALS, MAX_NUMERATOR, MAX_TEMPO, MIN_TEMPO } from '../../edit/measure-headers';
import { GpFormatError } from '../../errors';
import { FOUR_FOUR, measureTicks } from '../../model/defaults';
import { type MeasureHeader, QUARTER_TIME, type TimeSignature } from '../../model/song';
import { META_TYPE, type MetaMessage, type MidiTrackEvents } from './midi-sequence';
import { WHOLE_PRECISE_DURATION } from './precise-duration';

/** Most measures an imported song may have: past it the file is rejected rather than read for ever. */
export const MAX_MEASURES = 4096;
const DEFAULT_TEMPO = 120;
/** Time signature denominators by the power of two the file stores (TuxGuitar knows whole … thirty-second). */
const DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32];
const MILLISECONDS_PER_MINUTE = 60_000;
const MICROSECONDS_PER_MILLISECOND = 1000;

/** A measure header while the file is read: tempo, meter and key may still change. */
interface HeaderDraft {
  readonly start: number;
  timeSignature: TimeSignature;
  tempo: number;
  keySignature: number;
}

function lengthOf(draft: HeaderDraft): number {
  return measureTicks(draft.timeSignature.numerator, draft.timeSignature.denominator);
}

/** The measure headers built while the file is read: each holds a tick range, the next starts where the last ends. */
export class HeaderTimeline {
  private readonly drafts: HeaderDraft[] = [];

  constructor(private readonly maxMeasures: number = MAX_MEASURES) {}

  get count(): number {
    return this.drafts.length;
  }

  /** getHeader: index of the header holding `tick` (the song start for earlier ticks), adding headers up to it. */
  indexAt(tick: number): number {
    const at = Math.max(tick, QUARTER_TIME);
    let last = this.drafts[this.drafts.length - 1];
    while (last === undefined || at >= last.start + lengthOf(last)) {
      last = this.append(last);
    }
    return this.search(at);
  }

  start(index: number): number {
    return this.draft(index).start;
  }

  /** Length in ticks (TGMeasureHeader.getLength). */
  length(index: number): number {
    return lengthOf(this.draft(index));
  }

  /** TGMeasureHeader.getPreciseLength. */
  preciseLength(index: number): number {
    const { numerator, denominator } = this.draft(index).timeSignature;
    return (numerator * WHOLE_PRECISE_DURATION) / denominator;
  }

  keySignature(index: number): number {
    return this.draft(index).keySignature;
  }

  /** Sets the time signature of the header holding `tick`, the last one while meta events are read in tick order. */
  setTimeSignature(tick: number, timeSignature: TimeSignature): void {
    this.draft(this.indexAt(tick)).timeSignature = timeSignature;
  }

  setTempo(tick: number, tempo: number): void {
    this.draft(this.indexAt(tick)).tempo = tempo;
  }

  setKeySignature(tick: number, keySignature: number): void {
    this.draft(this.indexAt(tick)).keySignature = keySignature;
  }

  toMeasureHeaders(): MeasureHeader[] {
    return this.drafts.map((draft, index) => ({
      number: index + 1,
      start: draft.start,
      timeSignature: draft.timeSignature,
      tempo: draft.tempo,
      repeatOpen: false,
      repeatClose: 0,
      repeatAlternative: 0,
      tripletFeel: 'none',
    }));
  }

  /** A header after `last` with its tempo, meter and key (4/4 at 120 bpm in C for the first). */
  private append(last: HeaderDraft | undefined): HeaderDraft {
    if (this.drafts.length >= this.maxMeasures) {
      throw new GpFormatError(`MIDI file is too long: more than ${this.maxMeasures} measures`);
    }
    const draft: HeaderDraft =
      last === undefined
        ? { start: QUARTER_TIME, timeSignature: FOUR_FOUR, tempo: DEFAULT_TEMPO, keySignature: 0 }
        : { start: last.start + lengthOf(last), timeSignature: last.timeSignature, tempo: last.tempo, keySignature: last.keySignature };
    this.drafts.push(draft);
    return draft;
  }

  private search(tick: number): number {
    let low = 0;
    let high = this.drafts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.draft(middle).start <= tick) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  private draft(index: number): HeaderDraft {
    const draft = this.drafts[index];
    if (draft === undefined) {
      throw new RangeError(`No measure header ${index}`);
    }
    return draft;
  }
}

/** A data byte as Java's signed byte. */
function signedByte(value: number | undefined): number {
  const byte = value ?? 0;
  return byte > 127 ? byte - 256 : byte;
}

/** parseTimeSignature: numerator, then the denominator's power of two (a quarter when unknown). Numerators past the editor's range are skipped. */
function parseTimeSignature(data: Uint8Array): TimeSignature | undefined {
  const numerator = signedByte(data[0]);
  if (data.length < 2 || numerator < 1 || numerator > MAX_NUMERATOR) {
    return undefined;
  }
  return { numerator, denominator: DENOMINATORS[data[1] ?? 2] ?? FOUR_FOUR.denominator };
}

/** parseTempo / TGTempo.fromUSQ: microseconds per quarter note → quarter notes per minute, kept in the editor's range. */
function parseTempo(data: Uint8Array): number | undefined {
  const usq = ((data[0] ?? 0) << 16) | ((data[1] ?? 0) << 8) | (data[2] ?? 0);
  if (data.length < 3 || usq === 0) {
    return undefined;
  }
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.trunc(MILLISECONDS_PER_MINUTE / (usq / MICROSECONDS_PER_MILLISECOND))));
}

/** A key signature event's sharps (> 0) or flats (< 0); the major / minor flag is not kept. */
function parseKeySignature(data: Uint8Array): number | undefined {
  const accidentals = signedByte(data[0]);
  return data.length < 2 || Math.abs(accidentals) > MAX_KEY_ACCIDENTALS ? undefined : accidentals;
}

function applyMeta(timeline: HeaderTimeline, tick: number, event: MetaMessage): void {
  if (event.type === META_TYPE.TIME_SIGNATURE) {
    const timeSignature = parseTimeSignature(event.data);
    if (timeSignature !== undefined) {
      timeline.setTimeSignature(tick, timeSignature);
    }
  } else if (event.type === META_TYPE.TEMPO) {
    const tempo = parseTempo(event.data);
    if (tempo !== undefined) {
      timeline.setTempo(tick, tempo);
    }
  } else if (event.type === META_TYPE.KEY_SIGNATURE) {
    const keySignature = parseKeySignature(event.data);
    if (keySignature !== undefined) {
      timeline.setKeySignature(tick, keySignature);
    }
  }
}

const HEADER_META_TYPES: ReadonlySet<number> = new Set([META_TYPE.TIME_SIGNATURE, META_TYPE.TEMPO, META_TYPE.KEY_SIGNATURE]);

/**
 * The measure headers the tempo, time signature and key signature events make, read from every track in tick order
 * before the notes (TuxGuitar reads them track by track, so a meter change in a later track left earlier measures in
 * place). `toTick` turns a file tick into a song tick.
 */
export function buildHeaderTimeline(tracks: readonly MidiTrackEvents[], toTick: (fileTick: number) => number, maxMeasures?: number): HeaderTimeline {
  const timeline = new HeaderTimeline(maxMeasures);
  const events = tracks
    .flatMap((events) => events.filter((event): event is MetaMessage => event.kind === 'meta' && HEADER_META_TYPES.has(event.type)))
    .sort((a, b) => a.tick - b.tick);
  for (const event of events) {
    applyMeta(timeline, toTick(event.tick), event);
  }
  return timeline;
}
