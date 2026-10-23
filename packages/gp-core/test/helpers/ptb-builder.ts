/**
 * Test-only writer for Power Tab (.ptb, version 4) files. It emits exactly the byte layout TuxGuitar's PTInputStream reads
 * (MFC object arrays: a count, the first object's class tag with schema and name, a 2-byte tag between objects), so
 * synthetic files can reach every branch of the reader. Field order follows the Java reader line by line.
 */

export interface PtbInfoSpec {
  /** 0 = song, 1 = lesson, anything else = nothing more is read. Default 0. */
  readonly classification?: number;
  /** 0 = album, 1 = single, 2 = video, anything else = no release data. Default 0. */
  readonly releaseType?: number;
  /** Default true: author and lyricist are written. */
  readonly isAuthorKnown?: boolean;
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly author?: string;
  readonly lyricist?: string;
  readonly arranger?: string;
  readonly guitarTranscriber?: string;
  readonly bassTranscriber?: string;
  readonly copyright?: string;
  readonly lyrics?: string;
  readonly guitarInstructions?: string;
  readonly bassInstructions?: string;
  /** A lesson's instructions. */
  readonly instructions?: string;
}

export interface PtbGuitarSpec {
  readonly number: number;
  readonly name?: string;
  readonly instrument?: number;
  readonly volume?: number;
  readonly balance?: number;
  /** MIDI pitches, highest string first. Default standard guitar tuning. */
  readonly tuning?: readonly number[];
}

export interface PtbNoteSpec {
  /** 1 = highest string (1–8). */
  readonly string: number;
  /** 0–31. */
  readonly fret: number;
  readonly isTied?: boolean;
  readonly isDead?: boolean;
  /** Bend type 1–8. */
  readonly bend?: number;
  readonly hasSlide?: boolean;
}

export interface PtbBeatSpec {
  readonly position: number;
  /** Note value as stored (1 … 64). Default 4. */
  readonly duration?: number;
  readonly isDotted?: boolean;
  readonly isDoubleDotted?: boolean;
  /** [enters, times] (1–32, 1–8). */
  readonly tuplet?: readonly [number, number];
  /** Store the beaming byte with its 128 flag set (the reader takes it off). */
  readonly hasBeamingFlag?: boolean;
  readonly isVibrato?: boolean;
  readonly isWideVibrato?: boolean;
  readonly isGrace?: boolean;
  readonly isArpeggioUp?: boolean;
  readonly isArpeggioDown?: boolean;
  /** Bars of a multi-bar rest (written as a complex symbol). */
  readonly multiBarRest?: number;
  readonly notes?: readonly PtbNoteSpec[];
}

export interface PtbBarSpec {
  readonly position: number;
  readonly isRepeatStart?: boolean;
  readonly repeatClose?: number;
  /** Default 4/4; numerator 1–16, denominator a power of two up to 128. */
  readonly numerator?: number;
  readonly denominator?: number;
  /** Raw top byte of the time-signature int, instead of numerator/denominator. */
  readonly meterByte?: number;
}

export interface PtbDirectionSpec {
  readonly position: number;
  readonly direction: number;
  readonly activeSymbol?: number;
  readonly repeat?: number;
}

export interface PtbStaffSpec {
  /** The staff's two voices. */
  readonly voices: readonly (readonly PtbBeatSpec[])[];
}

export interface PtbSectionSpec {
  /** The bar line the section starts with. Default position 0, 4/4. */
  readonly startBar?: PtbBarSpec;
  readonly bars?: readonly PtbBarSpec[];
  readonly directions?: readonly PtbDirectionSpec[];
  readonly chordTexts?: number;
  readonly rhythmSlashes?: number;
  readonly staffs?: readonly PtbStaffSpec[];
  /** Repeat count of the bar line that closes the section. */
  readonly endRepeatClose?: number;
}

export interface PtbGuitarInSpec {
  readonly section: number;
  readonly staff: number;
  readonly position: number;
  /** Bit mask of guitar numbers. */
  readonly guitars: number;
}

export interface PtbTempoSpec {
  readonly section: number;
  readonly position: number;
  readonly tempo: number;
  /** 1 = eighth triplet feel, 2 = sixteenth. */
  readonly tripletFeel?: number;
}

export interface PtbSymbolSpec {
  readonly section: number;
  readonly position: number;
  /** Alternate endings bit mask (bit 0 = ending 1). */
  readonly endings: number;
}

export interface PtbScoreSpec {
  readonly guitars?: readonly PtbGuitarSpec[];
  /** One fret list per chord diagram. */
  readonly chordDiagrams?: readonly (readonly number[])[];
  readonly floatingTexts?: readonly string[];
  readonly guitarIns?: readonly PtbGuitarInSpec[];
  readonly tempos?: readonly PtbTempoSpec[];
  readonly dynamics?: number;
  readonly symbols?: readonly PtbSymbolSpec[];
  readonly sections?: readonly PtbSectionSpec[];
}

export interface PtbSongSpec {
  /** Default 4. */
  readonly version?: number;
  readonly info?: PtbInfoSpec;
  readonly guitarScore?: PtbScoreSpec;
  readonly bassScore?: PtbScoreSpec;
  /** Class schema of the first object array (TuxGuitar only reads 1). */
  readonly schema?: number;
}

export const PTB_STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];
const NEW_CLASS_TAG = 0xffff;
const CLASS_REFERENCE_TAG = 0x8001;

class PtbWriter {
  private readonly bytes: number[] = [];
  private schema: number;

  constructor(schema: number) {
    this.schema = schema;
  }

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

  /** u8 length (0xff: a u16 length follows), then the text. */
  string(text: string): this {
    if (text.length < 0xff) {
      return this.u8(text.length).latin1(text);
    }
    return this.u8(0xff).u16(text.length).latin1(text);
  }

  /** An MFC object array: count, the first object's class (tag, schema, name), a tag between objects. */
  items<T>(className: string, items: readonly T[], write: (item: T, index: number) => void): this {
    this.u16(items.length);
    items.forEach((item, index) => {
      if (index === 0) {
        this.u16(NEW_CLASS_TAG).u16(this.schema).u16(className.length).latin1(className);
        this.schema = 1;
      } else {
        this.u16(CLASS_REFERENCE_TAG);
      }
      write(item, index);
    });
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Build a complete .ptb file from a spec. */
export function buildPtb(spec: PtbSongSpec = {}): Uint8Array {
  const writer = new PtbWriter(spec.schema ?? 1);
  writer.latin1('ptab').u16(spec.version ?? 4);
  writeInfo(writer, spec.info ?? {});
  writeScore(writer, spec.guitarScore ?? {});
  writeScore(writer, spec.bassScore ?? {});
  writer.zeros(8); // what follows the scores (fonts, spacing) is not read
  return writer.toBytes();
}

function writeInfo(writer: PtbWriter, info: PtbInfoSpec): void {
  const classification = info.classification ?? 0;
  writer.u8(classification);
  if (classification === 0) {
    writer.u8(0).string(info.title ?? '').string(info.artist ?? '');
    writeRelease(writer, info);
    const isAuthorKnown = info.isAuthorKnown ?? true;
    writer.u8(isAuthorKnown ? 0 : 1);
    if (isAuthorKnown) {
      writer.string(info.author ?? '').string(info.lyricist ?? '');
    }
    for (const text of [info.arranger, info.guitarTranscriber, info.bassTranscriber, info.copyright, info.lyrics, info.guitarInstructions, info.bassInstructions]) {
      writer.string(text ?? '');
    }
  } else if (classification === 1) {
    writer.string(info.title ?? '').string(info.album ?? '').u16(3).u8(1).string(info.author ?? '');
    writer.string(info.instructions ?? '').string(info.copyright ?? '');
  }
}

function writeRelease(writer: PtbWriter, info: PtbInfoSpec): void {
  const releaseType = info.releaseType ?? 0;
  writer.u8(releaseType);
  if (releaseType === 0) {
    writer.u8(2).string(info.album ?? '').u16(1999).u8(0);
  } else if (releaseType === 1) {
    writer.string(info.album ?? '').u8(1);
  } else if (releaseType === 2) {
    writer.string(info.album ?? '').u16(1).u16(2).u16(2001);
  }
}

function writeScore(writer: PtbWriter, score: PtbScoreSpec): void {
  writer.items('CGuitar', score.guitars ?? [], (guitar) => writeGuitar(writer, guitar));
  writer.items('CChordDiagram', score.chordDiagrams ?? [], (frets) => {
    writer.u16(0).u8(0).u16(0).u8(0).u8(0).u8(frets.length);
    frets.forEach((fret) => writer.u8(fret));
  });
  writer.items('CFloatingText', score.floatingTexts ?? [], (text) => {
    writer.string(text).i32(1).i32(2).i32(3).i32(4).u8(0);
    writer.string('Arial').i32(8).i32(400).u8(0).u8(0).u8(0).i32(0);
  });
  writer.items('CGuitarIn', score.guitarIns ?? [], (guitarIn) => {
    writer.u16(guitarIn.section).u8(guitarIn.staff).u8(guitarIn.position).u8(0).u8(guitarIn.guitars);
  });
  writer.items('CTempoMarker', score.tempos ?? [], (tempo) => {
    writer.u16(tempo.section).u8(tempo.position).u16(tempo.tempo).u16(tempo.tripletFeel ?? 0).string('');
  });
  writer.items('CDynamic', Array.from({ length: score.dynamics ?? 0 }), () => writer.zeros(6));
  writer.items('CSectionSymbol', score.symbols ?? [], (symbol) => {
    writer.u16(symbol.section).u8(symbol.position).i32(symbol.endings << 16);
  });
  writer.items('CSection', score.sections ?? [], (section) => writeSection(writer, section));
}

function writeGuitar(writer: PtbWriter, guitar: PtbGuitarSpec): void {
  const tuning = guitar.tuning ?? PTB_STANDARD_TUNING;
  writer.u8(guitar.number).string(guitar.name ?? 'Untitled').u8(guitar.instrument ?? 24).u8(guitar.volume ?? 104);
  writer.u8(guitar.balance ?? 64).zeros(4).u8(0).string('Standard').u8(0).u8(tuning.length);
  tuning.forEach((pitch) => writer.u8(pitch));
}

function writeSection(writer: PtbWriter, section: PtbSectionSpec): void {
  const endRepeat = section.endRepeatClose === undefined ? 0 : 128 + section.endRepeatClose;
  writer.i32(0).i32(0).i32(800).i32(200).u8(endRepeat).zeros(4);
  writeBar(writer, section.startBar ?? { position: 0 });
  writer.items('CDirection', section.directions ?? [], (direction) => {
    const data = (direction.direction << 8) | ((direction.activeSymbol ?? 0) << 6) | (direction.repeat ?? 0);
    writer.u8(direction.position).u8(1).u16(data);
  });
  writer.items('CChordText', Array.from({ length: section.chordTexts ?? 0 }), () => writer.zeros(7));
  writer.items('CRhythmSlash', Array.from({ length: section.rhythmSlashes ?? 0 }), () => writer.zeros(6));
  writer.items('CStaff', section.staffs ?? [{ voices: [] }], (staff) => {
    writer.zeros(5);
    for (let voice = 0; voice < 2; voice++) {
      writer.items('CPosition', staff.voices[voice] ?? [], (beat) => writeBeat(writer, beat));
    }
  });
  writer.items('CBarline', section.bars ?? [], (bar) => writeBar(writer, bar));
}

function writeBar(writer: PtbWriter, bar: PtbBarSpec): void {
  const type = bar.repeatClose !== undefined ? 128 + bar.repeatClose : bar.isRepeatStart === true ? 3 << 5 : 0;
  const meter = bar.meterByte ?? ((bar.numerator ?? 4) - 1) * 8 + Math.log2(bar.denominator ?? 4);
  writer.u8(bar.position).u8(type).u8(0).i32(meter << 24).u8(4).u8(0).string('');
}

function writeBeat(writer: PtbWriter, beat: PtbBeatSpec): void {
  const [enters, times] = beat.tuplet ?? [1, 1];
  const beaming = (enters - 1) * 8 + (times - 1) + (beat.hasBeamingFlag === true ? 128 : 0);
  const data1 =
    (beat.isDotted === true ? 0x01 : 0) |
    (beat.isDoubleDotted === true ? 0x02 : 0) |
    (beat.isVibrato === true ? 0x08 : 0) |
    (beat.isWideVibrato === true ? 0x10 : 0) |
    (beat.isArpeggioUp === true ? 0x20 : 0) |
    (beat.isArpeggioDown === true ? 0x40 : 0);
  writer.u8(beat.position).u8(beaming).u8(0).u8(data1).u8(0).u8(beat.isGrace === true ? 1 : 0).u8(beat.duration ?? 4);
  if (beat.multiBarRest === undefined) {
    writer.u8(0);
  } else {
    writer.u8(1).u16(beat.multiBarRest).u8(0).u8(0x08);
  }
  writer.items('CNote', beat.notes ?? [], (note) => writeNote(writer, note));
}

function writeNote(writer: PtbWriter, note: PtbNoteSpec): void {
  const simple = (note.isTied === true ? 0x01 : 0) | (note.isDead === true ? 0x02 : 0);
  writer.u8(((note.string - 1) << 5) | note.fret).u16(simple);
  const symbols: (readonly [number, number])[] = [];
  if (note.bend !== undefined) {
    symbols.push([(note.bend - 1) * 16, 101]);
  }
  if (note.hasSlide === true) {
    symbols.push([0, 100]);
  }
  writer.u8(symbols.length);
  symbols.forEach(([data3, data4]) => writer.u8(0).u8(0).u8(data3).u8(data4));
}
