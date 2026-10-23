// Port of TuxGuitar app.tuxguitar.io.ptb.PTInputStream.readSection (and the staff, position, note and bar line readers it
// calls) and of base.PTSection's position list (LGPL-2.1).
import type { PtBar, PtBeat, PtComponent, PtNote, PtSection } from './ptb-model';
import type { PtByteReader } from './ptb-byte-reader';

/** PTInputStream.readStaff: every staff has two voices. */
const VOICES_PER_STAFF = 2;
/** readBarLine: the top three bits of a bar line's type (3 = repeat start, 4 = repeat end + count). */
const BAR_REPEAT_START = 3;
const BAR_REPEAT_END = 4;
const BAR_REPEAT_COUNT_BASE = 128;
/** readPosition: beaming bytes from 128 hold the same value + 128. */
const BEAMING_FLAG = 128;
const BEAT_DOTTED = 0x01;
const BEAT_DOUBLE_DOTTED = 0x02;
const BEAT_VIBRATO = 0x08;
const BEAT_WIDE_VIBRATO = 0x10;
const BEAT_ARPEGGIO_UP = 0x20;
const BEAT_ARPEGGIO_DOWN = 0x40;
const BEAT_GRACE = 0x01;
/** A complex symbol of this type is a multi-bar rest (its count = bars). */
const SYMBOL_MULTI_BAR_REST = 0x08;
const NOTE_TIED = 0x01;
const NOTE_DEAD = 0x02;
const NOTE_FRET_MASK = 0x1f;
const NOTE_STRING_MASK = 0xe0;
const NOTE_SYMBOL_SLIDE = 100;
const NOTE_SYMBOL_BEND = 101;
const BEND_TYPE_STEP = 16;

/** A section while it is read: positions (PTSection.getPosition) in the order they first appear. */
export class PtSectionBuilder {
  staffs = 0;
  private readonly positions = new Map<number, PtComponent[]>();

  constructor(readonly number: number) {}

  /** PTSection.getPosition(position).addComponent(component). */
  add(position: number, component: PtComponent): void {
    const components = this.positions.get(position);
    if (components === undefined) {
      this.positions.set(position, [component]);
    } else {
      components.push(component);
    }
  }

  /** PTSection.getNextPositionNumber: one past the last position used. */
  nextPositionNumber(): number {
    return [...this.positions.keys()].reduce((next, position) => Math.max(next, position + 1), 0);
  }

  build(): PtSection {
    const positions = [...this.positions].map(([position, components]) => ({ position, components }));
    return { number: this.number, staffs: this.staffs, positions };
  }
}

/** PTInputStream.readSection: one system — bar lines, directions, staffs and the closing bar line. */
export function readSection(reader: PtByteReader, section: PtSectionBuilder): void {
  reader.skip(16); // the system's rectangle
  const lastBarData = reader.readByte();
  reader.skip(4);
  readBarLine(reader, section);
  reader.readItems(() => readDirection(reader, section));
  reader.readItems(() => readChordText(reader));
  reader.readItems(() => readRhythmSlash(reader));
  section.staffs = reader.readItems((staff) => readStaff(reader, section, staff));
  reader.readItems(() => readBarLine(reader, section));
  const end: PtBar = { kind: 'bar', repeatStart: false, repeatClose: repeatCloseOf(lastBarData), numerator: 0, denominator: 0 };
  section.add(section.nextPositionNumber(), end);
}

function readStaff(reader: PtByteReader, section: PtSectionBuilder, staff: number): void {
  reader.skip(5);
  for (let voice = 0; voice < VOICES_PER_STAFF; voice++) {
    reader.readItems(() => readPosition(reader, section, staff, voice));
  }
}

function readPosition(reader: PtByteReader, section: PtSectionBuilder, staff: number, voice: number): void {
  const position = reader.readByte();
  const rawBeaming = reader.readByte();
  const beaming = rawBeaming < BEAMING_FLAG ? rawBeaming : rawBeaming - BEAMING_FLAG;
  reader.readByte();
  const data1 = reader.readByte();
  reader.readByte();
  const data3 = reader.readByte();
  const duration = reader.readByte();
  const multiBarRest = readComplexSymbols(reader);
  const notes: PtNote[] = [];
  const noteCount = reader.readItems(() => notes.push(readNote(reader)));
  const beat: PtBeat = {
    kind: 'beat',
    staff,
    voice,
    multiBarRest: noteCount === 0 ? multiBarRest : 1,
    duration,
    enters: (beaming - (beaming % 8)) / 8 + 1,
    times: (beaming % 8) + 1,
    dotted: (data1 & BEAT_DOTTED) !== 0,
    doubleDotted: (data1 & BEAT_DOUBLE_DOTTED) !== 0,
    vibrato: (data1 & (BEAT_VIBRATO | BEAT_WIDE_VIBRATO)) !== 0,
    grace: (data3 & BEAT_GRACE) !== 0,
    arpeggioUp: (data1 & BEAT_ARPEGGIO_UP) !== 0,
    arpeggioDown: (data1 & BEAT_ARPEGGIO_DOWN) !== 0,
    notes,
  };
  section.add(position, beat);
}

/** The position's complex symbols; returns the multi-bar rest count (1 when there is none). */
function readComplexSymbols(reader: PtByteReader): number {
  let multiBarRest = 1;
  const count = reader.readByte();
  for (let i = 0; i < count; i++) {
    const value = reader.readShort();
    reader.readByte();
    const type = reader.readByte();
    if ((type & SYMBOL_MULTI_BAR_REST) !== 0) {
      multiBarRest = value;
    }
  }
  return multiBarRest;
}

/** PTInputStream.readNote: the last bend or slide symbol wins, as in TuxGuitar. */
function readNote(reader: PtByteReader): PtNote {
  const position = reader.readByte();
  const simpleData = reader.readShort();
  let bend = 0;
  let slide = false;
  const symbolCount = reader.readByte();
  for (let i = 0; i < symbolCount; i++) {
    reader.skip(2);
    const data3 = reader.readByte();
    const data4 = reader.readByte();
    bend = data4 === NOTE_SYMBOL_BEND ? Math.trunc(data3 / BEND_TYPE_STEP) + 1 : 0;
    slide = data4 === NOTE_SYMBOL_SLIDE;
  }
  return {
    value: position & NOTE_FRET_MASK,
    string: ((position & NOTE_STRING_MASK) >> 5) + 1,
    bend,
    tied: (simpleData & NOTE_TIED) !== 0,
    dead: (simpleData & NOTE_DEAD) !== 0,
    slide,
  };
}

function repeatCloseOf(type: number): number {
  return type >>> 5 === BAR_REPEAT_END ? type - BAR_REPEAT_COUNT_BASE : 0;
}

function readBarLine(reader: PtByteReader, section: PtSectionBuilder): void {
  const position = reader.readByte();
  const type = reader.readByte();
  reader.readByte(); // key signature
  const { numerator, denominator } = readTimeSignature(reader);
  reader.readByte(); // rehearsal sign letter
  reader.readString(); // rehearsal sign description
  section.add(position, { kind: 'bar', repeatStart: type >>> 5 === BAR_REPEAT_START, repeatClose: repeatCloseOf(type), numerator, denominator });
}

/** PTInputStream.readTimeSignature: Java's signed shift and remainder, so a negative byte gives denominator 0. */
function readTimeSignature(reader: PtByteReader): { readonly numerator: number; readonly denominator: number } {
  const data = reader.readInt();
  reader.readByte(); // pulses per measure
  const meter = data >> 24;
  return { numerator: (meter - (meter % 8)) / 8 + 1, denominator: Math.trunc(2 ** (meter % 8)) };
}

function readDirection(reader: PtByteReader, section: PtSectionBuilder): void {
  const position = reader.readByte();
  const count = reader.readByte();
  for (let i = 0; i < count; i++) {
    const data = reader.readShort();
    section.add(position, { kind: 'direction', direction: data >> 8, activeSymbol: (data & 0xc0) >> 6, repeat: data & 0x1f });
  }
}

function readChordText(reader: PtByteReader): void {
  reader.skip(7);
}

function readRhythmSlash(reader: PtByteReader): void {
  reader.skip(6);
}
