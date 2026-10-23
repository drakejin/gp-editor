/**
 * Test-only writer for TablEdit 3 (.tef) files: the 256-byte header TuxGuitar's TEFileFormatDetector checks, then the
 * sections TEInputStream reads one after another (song texts, chords, measures, tracks, print data, reading list) and the
 * 12-byte components up to the 0xffffffff end marker. Synthetic files reach every branch of the reader.
 */

export interface TefHeaderSpec {
  readonly majorVersion?: number;
  readonly minorVersion?: number;
  /** The four bytes at offset 56. Default "debt" (TablEdit's "tbed" as a little-endian number). */
  readonly tag?: string;
  readonly bpm?: number;
  readonly chorus?: number;
  readonly reverb?: number;
  readonly oldNum?: number;
  readonly formatLo?: number;
  readonly formatHi?: number;
  /** A byte written into the block 16–23 that must stay zero. */
  readonly zeroBlockByte?: number;
}

export interface TefChordSpec {
  readonly name: string;
  /** Seven frets, first string first. */
  readonly frets: readonly number[];
}

export interface TefMeasureSpec {
  readonly numerator?: number;
  readonly denominator?: number;
  readonly key?: number;
}

export interface TefTrackSpec {
  /** Open-string pitches without the capo, first string first (stored as TablEdit does: 96 − pitch − capo). */
  readonly tuning?: readonly number[];
  readonly program?: number;
  readonly capo?: number;
  /** TETrackClef (1 treble, 2 bass, 4 tenor, 5 alto). */
  readonly clef?: number;
  readonly pan?: number;
  readonly volume?: number;
  readonly name?: string;
}

/** Where a component is: measure, sixty-fourth in the measure, track and string in the track (0-based). */
export interface TefAt {
  readonly measure: number;
  readonly position: number;
  readonly track?: number;
  readonly string?: number;
}

export interface TefComponentSpec {
  readonly at: TefAt;
  /** A raw location instead of `at`. */
  readonly location?: number;
  readonly type: number;
  /** The seven data bytes. */
  readonly data: readonly number[];
}

export interface TefSongSpec {
  readonly header?: TefHeaderSpec;
  readonly title?: string;
  readonly author?: string;
  readonly comments?: string;
  readonly notes?: string;
  readonly url?: string;
  readonly copyright?: string;
  readonly lyrics?: string;
  readonly textEvents?: readonly string[];
  readonly chords?: readonly TefChordSpec[];
  readonly chordRecordSize?: number;
  readonly measures?: readonly TefMeasureSpec[];
  readonly measureRecordSize?: number;
  readonly tracks?: readonly TefTrackSpec[];
  /** Raw string count of the first track (instead of its tuning's length). */
  readonly firstTrackStringCount?: number;
  readonly trackRecordSize?: number;
  /** [first measure, last measure] per entry. */
  readonly readingList?: readonly (readonly [number, number])[];
  readonly components?: readonly TefComponentSpec[];
  readonly hasNoEndMarker?: boolean;
}

export const TEF_STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];
const HEADER_SIZE = 256;
const CHORD_RECORD = 36;
const MEASURE_RECORD = 8;
const TRACK_RECORD = 68;

class TefWriter {
  private readonly bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    return this.u8(value).u8(value >> 8);
  }

  i32(value: number): this {
    return this.u16(value & 0xffff).u16((value >>> 16) & 0xffff);
  }

  zeros(count: number): this {
    for (let i = 0; i < count; i++) {
      this.u8(0);
    }
    return this;
  }

  latin1(text: string): this {
    for (const char of text) {
      this.u8(char.charCodeAt(0));
    }
    return this;
  }

  /** A text padded with NULs to `size` bytes. */
  field(text: string, size: number): this {
    return this.latin1(text.slice(0, size - 1)).zeros(size - Math.min(text.length, size - 1));
  }

  /** readShortString: a 16-bit length counting the closing NUL, the text and the NUL. */
  shortString(text: string): this {
    return this.u16(text.length + 1).latin1(text).u8(0);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Build a complete .tef file from a spec. */
export function buildTef(spec: TefSongSpec = {}): Uint8Array {
  const measures = spec.measures ?? [{}];
  const tracks = spec.tracks ?? [{}];
  const writer = new TefWriter();
  writeHeader(writer, spec);
  writeTexts(writer, spec);
  if (spec.chords !== undefined) {
    writeChords(writer, spec.chords, spec.chordRecordSize ?? CHORD_RECORD);
  }
  writeMeasures(writer, measures, spec.measureRecordSize ?? MEASURE_RECORD);
  writeTracks(writer, spec, tracks);
  writer.u16(4).zeros(4); // print metadata
  if (spec.readingList !== undefined) {
    writer.u16(32).u16(spec.readingList.length);
    spec.readingList.forEach(([first, last]) => writer.u16(first).u16(last).field('Part', 28));
  }
  const layout = { measureStarts: gridStarts(measures), totalStrings: tracks.reduce((sum, track) => sum + stringCount(track), 0), tracks };
  for (const component of spec.components ?? []) {
    writer.i32(component.location ?? locationOf(layout, component.at)).u8(component.type);
    component.data.forEach((byte) => writer.u8(byte));
    writer.zeros(7 - component.data.length);
  }
  if (spec.hasNoEndMarker !== true) {
    writer.i32(-1);
  }
  return writer.toBytes();
}

function stringCount(track: TefTrackSpec): number {
  return (track.tuning ?? TEF_STANDARD_TUNING).length;
}

function writeHeader(writer: TefWriter, spec: TefSongSpec): void {
  const header = spec.header ?? {};
  const bytes = new Uint8Array(HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  bytes[2] = header.minorVersion ?? 4;
  bytes[3] = header.majorVersion ?? 3;
  view.setUint16(6, header.bpm ?? 120, true);
  view.setUint16(8, header.chorus ?? 0, true);
  view.setUint16(10, header.reverb ?? 0, true);
  bytes[20] = header.zeroBlockByte ?? 0;
  bytes.set(Array.from(header.tag ?? 'debt', (char) => char.charCodeAt(0)), 56);
  const flags: readonly (readonly [number, boolean])[] = [
    [84, spec.textEvents !== undefined],
    [88, spec.chords !== undefined],
    [128, spec.readingList !== undefined],
    [132, spec.url !== undefined],
    [140, spec.copyright !== undefined],
  ];
  flags.forEach(([offset, isPresent]) => view.setUint32(offset, isPresent ? 0x100 : 0, true));
  view.setUint16(202, header.oldNum ?? 4, true);
  bytes[204] = header.formatLo ?? 4;
  bytes[205] = header.formatHi ?? 10;
  bytes.forEach((byte) => writer.u8(byte));
}

function writeTexts(writer: TefWriter, spec: TefSongSpec): void {
  writer.shortString(spec.title ?? '').shortString(spec.author ?? '').shortString(spec.comments ?? '').shortString(spec.notes ?? '');
  if (spec.url !== undefined) {
    writer.shortString(spec.url);
  }
  if (spec.copyright !== undefined) {
    writer.shortString(spec.copyright);
  }
  writer.shortString(spec.lyrics ?? '');
  if (spec.textEvents !== undefined) {
    writer.u16(spec.textEvents.length);
    spec.textEvents.forEach((text) => writer.shortString(text));
  }
}

function writeChords(writer: TefWriter, chords: readonly TefChordSpec[], size: number): void {
  writer.u16(size).u16(chords.length);
  for (const chord of chords) {
    const record = new TefWriter();
    chord.frets.forEach((fret) => record.u8(fret));
    record.zeros(7 - chord.frets.length);
    record.zeros(7).field(chord.name, 17).u8(1).zeros(4);
    const bytes = record.toBytes();
    for (let i = 0; i < size; i++) {
      writer.u8(bytes[i] ?? 0);
    }
  }
}

function writeMeasures(writer: TefWriter, measures: readonly TefMeasureSpec[], size: number): void {
  writer.u16(size + 4).u16(measures.length).zeros(4);
  for (const measure of measures) {
    const record = [0, 0, measure.key ?? 0, 0x30, measure.denominator ?? 4, measure.numerator ?? 4, 0, 0];
    for (let i = 0; i < size; i++) {
      writer.u8(record[i] ?? 0);
    }
  }
}

function writeTracks(writer: TefWriter, spec: TefSongSpec, tracks: readonly TefTrackSpec[]): void {
  const size = spec.trackRecordSize ?? TRACK_RECORD;
  writer.u16(size).u16(tracks.length);
  tracks.forEach((track, index) => {
    const tuning = track.tuning ?? TEF_STANDARD_TUNING;
    const capo = track.capo ?? 0;
    const record = new TefWriter();
    record.u8(index === 0 ? (spec.firstTrackStringCount ?? tuning.length) : tuning.length).zeros(7).u8(track.program ?? 25).zeros(3).u8(capo).u8(0).u8(12);
    record.u8(track.clef ?? 0).u8(0x30).u8(track.pan ?? 7).u8(track.volume ?? 0).u8(0);
    tuning.forEach((pitch) => record.u8(96 - pitch - capo));
    record.zeros(12 - tuning.length).field(track.name ?? 'Guitar', size - 32);
    const bytes = record.toBytes();
    for (let i = 0; i < size; i++) {
      writer.u8(bytes[i] ?? 0);
    }
  });
}

interface Layout {
  readonly measureStarts: readonly number[];
  readonly totalStrings: number;
  readonly tracks: readonly TefTrackSpec[];
}

function gridStarts(measures: readonly TefMeasureSpec[]): readonly number[] {
  const starts = [0];
  for (const measure of measures) {
    starts.push((starts[starts.length - 1] ?? 0) + (64 * (measure.numerator ?? 4)) / (measure.denominator ?? 4));
  }
  return starts;
}

function locationOf(layout: Layout, at: TefAt): number {
  const stringOffset = layout.tracks.slice(0, at.track ?? 0).reduce((sum, track) => sum + stringCount(track), 0);
  const grid = (layout.measureStarts[at.measure] ?? 0) + at.position;
  return (grid * layout.totalStrings + stringOffset + (at.string ?? 0)) * 8;
}

// ---------------------------------------------------------------- components

export interface TefNoteSpec {
  readonly at: TefAt;
  readonly fret: number;
  /** TENoteDuration code (0 whole … 18 sixty-fourth). Default 6 (quarter). */
  readonly duration?: number;
  /** 0 fff … 7 ppp. Default 2 (f). */
  readonly dynamics?: number;
  readonly effect1?: number;
  /** 2 = upper voice, 3 = lower voice. */
  readonly attributes?: number;
  readonly grace?: { readonly fret: number; readonly effect: number };
  readonly effect2?: number;
  readonly effect3?: number;
  readonly stroke?: number;
  readonly isTied?: boolean;
}

export function tefNote(note: TefNoteSpec): TefComponentSpec {
  const type = (note.fret + 1) | (note.grace !== undefined ? 0x40 : 0);
  const data = [
    ((note.dynamics ?? 2) << 5) | (note.duration ?? 6),
    ((note.attributes ?? 0) << 4) | (note.effect1 ?? 0),
    note.grace === undefined ? 0 : (note.grace.effect << 5) | note.grace.fret,
    ((note.effect3 ?? 0) << 4) | (note.effect2 ?? 0),
    0,
    (note.stroke ?? 0) << 5,
    note.isTied === true ? 0x20 : 0,
  ];
  return { at: note.at, type, data };
}

export function tefRest(at: TefAt, duration: number, isLowerVoice = false): TefComponentSpec {
  return { at, type: 0x33, data: [duration, isLowerVoice ? 0x30 : 0] };
}

export function tefChord(at: TefAt, index: number): TefComponentSpec {
  return { at, type: 0x35, data: [index & 0xff, index >> 8] };
}

export function tefText(at: TefAt, index: number): TefComponentSpec {
  return { at, type: 0x39, data: [index & 0xff, index >> 8, 0, 0, 3, 0, 1] };
}

export function tefTempo(at: TefAt, bpm: number): TefComponentSpec {
  return { at, type: 0xfe, data: [bpm & 0xff, bpm >> 8] };
}

export function tefEnding(at: TefAt, number: number, isOpen = false, isClose = false): TefComponentSpec {
  return { at, type: 0xb7, data: [1, number | (isOpen ? 0x40 : 0) | (isClose ? 0x80 : 0)] };
}

/** Grace-note metadata (a first byte of 0 makes it a spacing marker instead). */
export function tefGraceMetadata(at: TefAt, duration: number, fret = 0): TefComponentSpec {
  return { at, type: 0x7d, data: [duration, 0, at.string ?? 0, fret] };
}
