/**
 * Test-only writer for Guitar Pro 1 / 2 (.gtp) files. It emits exactly the byte layout
 * that TuxGuitar's GP1InputStream / GP2InputStream read, so synthetic files can reach
 * every branch of the readers. Field order follows the Java readers line by line.
 */

export type LegacyFormat = 'gp1' | 'gp2';

export interface LegacyNoteSpec {
  /** Bit position in the string mask, 5 … 0 (note string = stringCount - bit). */
  readonly bit: number;
  readonly fret: number;
  /** GP2 only: dynamic byte (velocity = 16 * dynamic - 1). Default 6. */
  readonly dynamic?: number;
  /** Note effect byte (1/2 hammer, 3/4 slide, 5/6 bend). Omitted = no effect byte. */
  readonly effect?: number;
  /** Bend byte for effects 5/6 (value = max(byte / 8 - 26, 1)). */
  readonly bendByte?: number;
  /** GP2 only: write a 3-byte grace note block for this bit. */
  readonly grace?: boolean;
}

export interface LegacyChordSpec {
  readonly name: string;
  /** Value of the int that decides whether 32 extra bytes follow (< 12 → they do). */
  readonly kind?: number;
  readonly firstFret: number;
  /** Six frets, written only when firstFret != 0. */
  readonly frets?: readonly number[];
}

export interface LegacyMixSpec {
  readonly tempo?: number;
  readonly reverb?: boolean;
  readonly chorus?: boolean;
  readonly balance?: boolean;
  readonly volume?: boolean;
  readonly instrument?: boolean;
}

export interface LegacyBeatSpec {
  /** Duration byte: -2 whole, -1 half, 0 quarter, 1 eighth … 4 sixty-fourth. */
  readonly duration: number;
  readonly dotted?: boolean;
  readonly triplet?: boolean;
  readonly rest?: boolean;
  readonly tied?: boolean;
  /** Beat effect byte (1 vibrato, 2 wide vibrato, 3 bend, 4 fade in, 5 tap, 6 slap, 7 pop, 8/9 harmonic). */
  readonly beatEffect?: number;
  readonly beatBendByte?: number;
  /** Full chord (GP1 ≥ v1.04, GP2). */
  readonly chord?: LegacyChordSpec;
  /** Old-style chord name (GP1 ≤ v1.03). */
  readonly oldChord?: string;
  readonly text?: string;
  readonly notes?: readonly LegacyNoteSpec[];
  /** GP2 only. */
  readonly mix?: LegacyMixSpec;
  /** GP2 only: [stroke type, stroke duration]. */
  readonly stroke?: readonly [number, number];
}

export interface LegacyMeasureSpec {
  readonly numerator?: number;
  readonly denominator?: number;
  readonly repeatOpen?: boolean;
  readonly repeatClose?: number;
  readonly alternative?: number;
  /** Beats per track; missing tracks have no beats. */
  readonly tracks?: readonly (readonly LegacyBeatSpec[])[];
  /** Raw beat-count byte override per track (to test the > 127 rule). */
  readonly beatCounts?: readonly number[];
}

export interface LegacyTrackSpec {
  readonly tuning?: readonly number[];
  readonly program?: number;
  readonly frets?: number;
  readonly name?: string;
  readonly solo?: boolean;
  readonly volume?: number;
  readonly balance?: number;
  readonly chorus?: number;
  readonly reverb?: number;
  readonly offset?: number;
}

export interface LegacySongSpec {
  readonly version: string;
  readonly title?: string;
  readonly author?: string;
  readonly comment?: string;
  /** Size of the fixed block each info string is padded to (0 = exact length). */
  readonly infoBlockSize?: number;
  readonly tempo?: number;
  /** Raw triplet-feel int (1 = eighth). */
  readonly tripletFeel?: number;
  readonly keySignature?: number;
  readonly tracks?: readonly LegacyTrackSpec[];
  readonly measures?: readonly LegacyMeasureSpec[];
}

const GP1_VERSION_CODES: Readonly<Record<string, number>> = {
  'FICHIER GUITARE PRO v1': 0,
  'FICHIER GUITARE PRO v1.01': 1,
  'FICHIER GUITARE PRO v1.02': 2,
  'FICHIER GUITARE PRO v1.03': 3,
  'FICHIER GUITARE PRO v1.04': 4,
};

export const STANDARD_GTP_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];

interface Layout {
  readonly format: LegacyFormat;
  readonly trackCount: number;
  readonly hasStringCount: boolean;
  readonly hasTrackDetails: boolean;
  readonly hasFullChords: boolean;
}

function layoutFor(version: string): Layout {
  const code = GP1_VERSION_CODES[version];
  if (code === undefined) {
    return { format: 'gp2', trackCount: 8, hasStringCount: true, hasTrackDetails: true, hasFullChords: true };
  }
  return {
    format: 'gp1',
    trackCount: code > 2 ? 8 : 1,
    hasStringCount: code > 1,
    hasTrackDetails: code > 2,
    hasFullChords: code > 3,
  };
}

class Writer {
  private readonly bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  i32(value: number): this {
    for (let shift = 0; shift < 32; shift += 8) {
      this.u8((value >> shift) & 0xff);
    }
    return this;
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

  /** u8 length + bytes (readStringByte(0)). */
  stringByte(text: string): this {
    return this.u8(text.length).latin1(text);
  }

  /** u8 block size + 1, u8 length, block (readStringByteSizeOfByte). */
  stringByteSizeOfByte(text: string, blockSize = text.length): this {
    const size = Math.max(blockSize, text.length);
    return this.u8(size + 1).u8(text.length).latin1(text).zeros(size - text.length);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Build a complete .gtp file from a spec. */
export function buildLegacyGtp(spec: LegacySongSpec): Uint8Array {
  const layout = layoutFor(spec.version);
  const tracks = Array.from({ length: layout.trackCount }, (_, i) => spec.tracks?.[i] ?? {});
  const measures = spec.measures ?? [{}];
  const writer = new Writer();
  writeHeader(writer, spec, layout);
  tracks.forEach((track) => writeTuning(writer, track, layout));
  writer.i32(measures.length);
  tracks.forEach((track) => writeTrack(writer, track, layout));
  if (layout.hasTrackDetails) {
    writer.zeros(10);
  }
  measures.forEach((measure) => writeMeasure(writer, measure, layout, tracks));
  return writer.toBytes();
}

function writeHeader(writer: Writer, spec: LegacySongSpec, layout: Layout): void {
  writer.u8(spec.version.length).latin1(spec.version).zeros(30 - spec.version.length);
  const block = spec.infoBlockSize ?? 0;
  writer.stringByteSizeOfByte(spec.title ?? '', block);
  writer.stringByteSizeOfByte(spec.author ?? '', block);
  writer.stringByteSizeOfByte(spec.comment ?? '', block);
  writer.i32(spec.tempo ?? 120);
  writer.i32(spec.tripletFeel ?? 0);
  if (layout.hasTrackDetails) {
    writer.i32(spec.keySignature ?? 0);
  }
}

function writeTuning(writer: Writer, track: LegacyTrackSpec, layout: Layout): void {
  const tuning = track.tuning ?? STANDARD_GTP_TUNING;
  if (layout.hasStringCount) {
    writer.i32(tuning.length);
  }
  const count = layout.hasStringCount ? tuning.length : 6;
  for (let i = 0; i < count; i++) {
    writer.i32(tuning[i] ?? 0);
  }
}

function writeTrack(writer: Writer, track: LegacyTrackSpec, layout: Layout): void {
  writer.i32(track.program ?? 25);
  if (!layout.hasTrackDetails) {
    return;
  }
  writer.i32(track.frets ?? 24);
  writer.stringByteSizeOfByte(track.name ?? '', 40);
  writer.u8(track.solo === true ? 1 : 0);
  writer.i32(track.volume ?? 127);
  writer.i32(track.balance ?? 64);
  writer.i32(track.chorus ?? 0);
  writer.i32(track.reverb ?? 0);
  writer.i32(track.offset ?? 0);
}

function writeMeasure(
  writer: Writer,
  measure: LegacyMeasureSpec,
  layout: Layout,
  tracks: readonly LegacyTrackSpec[],
): void {
  writer.u8(measure.numerator ?? 4).u8(measure.denominator ?? 4).zeros(6);
  for (let i = 0; i < layout.trackCount; i++) {
    const count = measure.beatCounts?.[i] ?? measure.tracks?.[i]?.length ?? 0;
    writer.u8(0).u8(0).u8(count).zeros(9);
  }
  writer.zeros(2);
  const flags =
    (measure.repeatOpen === true ? 0x01 : 0) |
    (measure.repeatClose !== undefined ? 0x02 : 0) |
    (measure.alternative !== undefined ? 0x04 : 0);
  writer.u8(flags);
  if (measure.repeatClose !== undefined) {
    writer.u8(measure.repeatClose);
  }
  if (measure.alternative !== undefined) {
    writer.u8(measure.alternative);
  }
  tracks.forEach((_, i) => {
    for (const beat of measure.tracks?.[i] ?? []) {
      writeBeat(writer, beat, layout);
    }
  });
}

function beatFlags(beat: LegacyBeatSpec): number {
  return (
    (beat.text !== undefined ? 0x01 : 0) |
    (beat.chord !== undefined || beat.oldChord !== undefined ? 0x02 : 0) |
    (beat.beatEffect !== undefined ? 0x04 : 0) |
    (beat.rest === true ? 0x08 : 0) |
    (beat.dotted === true ? 0x10 : 0) |
    (beat.triplet === true ? 0x20 : 0) |
    (beat.tied === true ? 0x40 : 0)
  );
}

function writeBeat(writer: Writer, beat: LegacyBeatSpec, layout: Layout): void {
  writer.i32(0).u8(beat.duration).u8(beatFlags(beat));
  if (layout.format === 'gp2') {
    writeGp2BeatPrefix(writer, beat);
  }
  if (beat.triplet === true) {
    writer.u8(0);
  }
  if (beat.beatEffect !== undefined) {
    writer.u8(beat.beatEffect);
    if (beat.beatEffect === 3) {
      writeBend(writer, beat.beatBendByte ?? 0);
    }
  }
  writeChord(writer, beat, layout);
  if (beat.text !== undefined) {
    writer.stringByte(beat.text);
  }
  if (beat.tied !== true && beat.rest !== true) {
    writeNotes(writer, beat.notes ?? [], layout);
  }
}

function writeGp2BeatPrefix(writer: Writer, beat: LegacyBeatSpec): void {
  writer.u8((beat.mix !== undefined ? 0x02 : 0) | (beat.stroke !== undefined ? 0x01 : 0));
  if (beat.mix !== undefined) {
    writeMix(writer, beat.mix);
  }
  if (beat.stroke !== undefined) {
    writer.u8(beat.stroke[0]).u8(beat.stroke[1]);
  }
}

function writeMix(writer: Writer, mix: LegacyMixSpec): void {
  const flags =
    (mix.tempo !== undefined ? 0x20 : 0) |
    (mix.reverb === true ? 0x10 : 0) |
    (mix.chorus === true ? 0x08 : 0) |
    (mix.balance === true ? 0x04 : 0) |
    (mix.volume === true ? 0x02 : 0) |
    (mix.instrument === true ? 0x01 : 0);
  writer.u8(flags);
  if (mix.tempo !== undefined) {
    writer.i32(mix.tempo).u8(0);
  }
  for (const present of [mix.reverb, mix.chorus, mix.balance, mix.volume]) {
    if (present === true) {
      writer.u8(0x7f).u8(0);
    }
  }
  if (mix.instrument === true) {
    writer.u8(0x19);
  }
}

function writeChord(writer: Writer, beat: LegacyBeatSpec, layout: Layout): void {
  if (beat.oldChord !== undefined) {
    writer.stringByteSizeOfByte(beat.oldChord, 20);
    return;
  }
  if (beat.chord === undefined) {
    return;
  }
  const chord = beat.chord;
  if (!layout.hasFullChords) {
    throw new Error('this version only stores old-style chords; use oldChord');
  }
  writer.stringByte(chord.name).u8(0).i32(chord.kind ?? 0);
  if ((chord.kind ?? 0) < 12) {
    writer.zeros(32);
  }
  writer.i32(chord.firstFret);
  if (chord.firstFret !== 0) {
    for (let i = 0; i < 6; i++) {
      writer.i32(chord.frets?.[i] ?? -1);
    }
  }
}

function writeNotes(writer: Writer, notes: readonly LegacyNoteSpec[], layout: Layout): void {
  const mask = (pick: (note: LegacyNoteSpec) => boolean): number =>
    notes.filter(pick).reduce((acc, note) => acc | (1 << note.bit), 0);
  writer.u8(mask(() => true)).u8(mask((note) => note.effect !== undefined));
  if (layout.format === 'gp2') {
    writer.u8(mask((note) => note.grace === true));
  }
  for (let bit = 5; bit >= 0; bit--) {
    const note = notes.find((candidate) => candidate.bit === bit);
    if (note === undefined) {
      continue;
    }
    writer.u8(note.fret);
    if (layout.format === 'gp2') {
      writer.u8(note.dynamic ?? 6);
    }
    if (note.effect !== undefined) {
      writer.u8(note.effect);
      if (note.effect === 5 || note.effect === 6) {
        writeBend(writer, note.bendByte ?? 0);
      }
    }
    if (note.grace === true) {
      writer.u8(3).u8(5).u8(1);
    }
  }
}

function writeBend(writer: Writer, bendByte: number): void {
  writer.zeros(6).u8(bendByte).u8(0);
}
