// Port of TuxGuitar app.tuxguitar.io.ptb.PTInputStream (song information and the two scores) and base.PTTrack's section
// list (LGPL-2.1).
import { ByteReader } from '../../io/byte-reader';
import type { Charset } from '../../io/text';
import type { TripletFeel } from '../../model/song';
import type { PtSong, PtSongInfo, PtTrack, PtTrackInfo } from './ptb-model';
import { PtByteReader } from './ptb-byte-reader';
import { PtSectionBuilder, readSection } from './ptb-section-reader';

/** "ptab" and the 16-bit file version (PTFileFormatDetector). */
export const PTB_HEADER_SIZE = 6;
const CLASSIFICATION_SONG = 0;
const CLASSIFICATION_LESSON = 1;
const RELEASE_ALBUM = 0;
const RELEASE_SINGLE = 1;
const RELEASE_VIDEO = 2;
const AUTHOR_KNOWN = 0;
const TEMPO_EIGHTH_TRIPLET_FEEL = 0x01;
const TEMPO_SIXTEENTH_TRIPLET_FEEL = 0x02;

const EMPTY_PT_SONG_INFO: PtSongInfo = {
  name: '',
  interpret: '',
  album: '',
  author: '',
  lyricist: '',
  arranger: '',
  guitarTranscriber: '',
  bassTranscriber: '',
  copyright: '',
  guitarInstructions: '',
  bassInstructions: '',
  instructions: '',
};

/**
 * A score while it is read. PTTrack.getSection creates every section up to the one asked for; here only the sections a
 * record names exist (a Guitar In naming section 65535 must not create 65 535 empty ones), in order.
 */
class PtTrackBuilder {
  readonly infos: PtTrackInfo[] = [];
  private readonly sections = new Map<number, PtSectionBuilder>();

  section(index: number): PtSectionBuilder {
    const existing = this.sections.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const created = new PtSectionBuilder(index);
    this.sections.set(index, created);
    return created;
  }

  build(): PtTrack {
    const sections = [...this.sections.values()].sort((a, b) => a.number - b.number);
    return { infos: [...this.infos], sections: sections.map((section) => section.build()) };
  }
}

/** PTInputStream.read: the song information, then the guitar score and the bass score (what follows is not read). */
export function readPtSong(bytes: Uint8Array, charset: Charset): PtSong {
  const byteReader = new ByteReader(bytes, charset);
  byteReader.skip(PTB_HEADER_SIZE);
  const reader = new PtByteReader(byteReader);
  const info = readSongInfo(reader);
  const track1 = readDataInstruments(reader);
  const track2 = readDataInstruments(reader);
  return { info, track1, track2 };
}

function readSongInfo(reader: PtByteReader): PtSongInfo {
  const classification = reader.readByte();
  if (classification === CLASSIFICATION_SONG) {
    reader.skip(1);
    return readSongClassification(reader);
  }
  if (classification === CLASSIFICATION_LESSON) {
    const name = reader.readString();
    const album = reader.readString();
    reader.readShort(); // style
    reader.readByte(); // level
    const author = reader.readString();
    const instructions = reader.readString();
    const copyright = reader.readString();
    return { ...EMPTY_PT_SONG_INFO, name, album, author, instructions, copyright };
  }
  return EMPTY_PT_SONG_INFO;
}

function readSongClassification(reader: PtByteReader): PtSongInfo {
  const name = reader.readString();
  const interpret = reader.readString();
  const album = readRelease(reader);
  const isAuthorKnown = reader.readByte() === AUTHOR_KNOWN;
  const author = isAuthorKnown ? reader.readString() : '';
  const lyricist = isAuthorKnown ? reader.readString() : '';
  const arranger = reader.readString();
  const guitarTranscriber = reader.readString();
  const bassTranscriber = reader.readString();
  const copyright = reader.readString();
  reader.readString(); // the song's lyrics: TuxGuitar keeps them nowhere
  const guitarInstructions = reader.readString();
  const bassInstructions = reader.readString();
  const credits = { name, interpret, album, author, lyricist, arranger, guitarTranscriber, bassTranscriber, copyright };
  return { ...credits, guitarInstructions, bassInstructions, instructions: '' };
}

/** The album (or single, or video) the song comes from; its date and live flag are skipped, as TuxGuitar keeps neither. */
function readRelease(reader: PtByteReader): string {
  const releaseType = reader.readByte();
  if (releaseType === RELEASE_ALBUM) {
    reader.readByte(); // album type
    const album = reader.readString();
    reader.readShort(); // year
    reader.readBoolean(); // live recording
    return album;
  }
  if (releaseType === RELEASE_SINGLE) {
    const album = reader.readString();
    reader.readBoolean(); // live recording
    return album;
  }
  if (releaseType === RELEASE_VIDEO) {
    const album = reader.readString();
    reader.skip(6); // day, month, year
    return album;
  }
  return '';
}

/** PTInputStream.readDataInstruments: one score, its arrays in file order. */
function readDataInstruments(reader: PtByteReader): PtTrack {
  const track = new PtTrackBuilder();
  reader.readItems(() => track.infos.push(readTrackInfo(reader)));
  reader.readItems(() => readChord(reader));
  reader.readItems(() => readFloatingText(reader));
  reader.readItems(() => readGuitarIn(reader, track));
  reader.readItems(() => readTempoMarker(reader, track));
  reader.readItems(() => reader.skip(6)); // dynamics
  reader.readItems(() => readSectionSymbol(reader, track));
  reader.readItems((index) => readSection(reader, track.section(index)));
  return track.build();
}

function readTrackInfo(reader: PtByteReader): PtTrackInfo {
  const number = reader.readByte();
  const name = reader.readString();
  const instrument = reader.readByte();
  const volume = reader.readByte();
  const balance = reader.readByte();
  reader.skip(4); // reverb, chorus, tremolo, phaser: not used by TuxGuitar
  reader.readByte(); // capo: not used by TuxGuitar
  reader.readString(); // tuning name
  reader.readByte(); // music notation offset, sharps or flats
  const stringCount = reader.readByte();
  const strings = Array.from({ length: stringCount }, () => reader.readByte());
  return { number, name, instrument, volume, balance, strings };
}

function readChord(reader: PtByteReader): void {
  reader.skip(7); // key, modification and the like
  reader.skip(reader.readByte()); // one fret per string
}

function readFloatingText(reader: PtByteReader): void {
  reader.readString();
  reader.skip(17); // rectangle, alignment
  readFontSetting(reader);
}

function readFontSetting(reader: PtByteReader): void {
  reader.readString(); // font name
  reader.skip(15); // point size, weight, italic, underline, strikeout, color
}

function readGuitarIn(reader: PtByteReader, track: PtTrackBuilder): void {
  const section = reader.readShort();
  const staff = reader.readByte();
  const position = reader.readByte();
  reader.skip(1);
  const trackInfo = reader.readByte();
  track.section(section).add(position, { kind: 'guitarIn', staff, trackInfo });
}

function readTempoMarker(reader: PtByteReader, track: PtTrackBuilder): void {
  const section = reader.readShort();
  const position = reader.readByte();
  const tempo = reader.readShort();
  const data = reader.readShort();
  reader.readString(); // description
  if (tempo > 0) {
    track.section(section).add(position, { kind: 'tempo', tempo, tripletFeel: tripletFeelOf(data) });
  }
}

function tripletFeelOf(data: number): TripletFeel {
  if ((data & TEMPO_EIGHTH_TRIPLET_FEEL) !== 0) {
    return 'eighth';
  }
  return (data & TEMPO_SIXTEENTH_TRIPLET_FEEL) !== 0 ? 'sixteenth' : 'none';
}

function readSectionSymbol(reader: PtByteReader, track: PtTrackBuilder): void {
  const section = reader.readShort();
  const position = reader.readByte();
  const data = reader.readInt();
  track.section(section).add(position, { kind: 'symbol', endNumber: data >> 16 });
}
