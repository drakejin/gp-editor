// The song information and the part-list of a MusicXML score (no TuxGuitar reader exists; mirrors MusicXMLWriter#writeHeaders / #writePartList).
import { EMPTY_SONG_INFO } from '../../model/defaults';
import type { SongInfo } from '../../model/song';
import { type XmlElement, attribute, child, childText, children } from '../gpif/xml';
import { clamp, readIntegerIn, readNumber, readText } from './musicxml-values';

/** A score-instrument with its midi-instrument. */
export interface PartInstrument {
  readonly id: string;
  /** 1–16. */
  readonly midiChannel?: number;
  /** 0–127. */
  readonly program?: number;
  readonly bank?: number;
  /** 0–127. */
  readonly volume?: number;
  /** 0–127, 64 = centre. */
  readonly balance?: number;
  /** A drum instrument's MIDI key, 0–127. */
  readonly unpitchedKey?: number;
}

export interface PartInfo {
  readonly name: string;
  /** `<part-abbreviation>` ('' when none): the track's short name. */
  readonly abbreviation: string;
  readonly instruments: readonly PartInstrument[];
}

const MAX_MIDI_VALUE = 127;
const MAX_BANK = 16384;
const PERCENT = 100;
const PAN_DEGREES = 90;
const PAN_CENTRE = 64;

function creator(identification: XmlElement | undefined, type: string): string {
  return readText(children(identification, 'creator').find((element) => attribute(element, 'type') === type)?.text);
}

function subtitle(root: XmlElement): string {
  const credit = children(root, 'credit').find((element) => childText(element, 'credit-type')?.trim() === 'subtitle');
  return readText(childText(credit, 'credit-words'));
}

/** writeHeaders read back: title, composer, lyricist, artist, rights and encoder (the transcriber). */
export function readSongInfo(root: XmlElement): SongInfo {
  const identification = child(root, 'identification');
  return {
    ...EMPTY_SONG_INFO,
    title: readText(childText(child(root, 'work'), 'work-title')) || readText(childText(root, 'movement-title')),
    subtitle: subtitle(root),
    artist: creator(identification, 'artist'),
    music: creator(identification, 'composer'),
    words: creator(identification, 'lyricist') || creator(identification, 'poet'),
    copyright: readText(childText(identification, 'rights')),
    transcriber: readText(childText(child(identification, 'encoding'), 'encoder')),
  };
}

function readMidi(midi: XmlElement): Omit<PartInstrument, 'id'> {
  const volume = readNumber(childText(midi, 'volume'));
  const pan = readNumber(childText(midi, 'pan'));
  const program = readIntegerIn(childText(midi, 'midi-program'), 1, MAX_MIDI_VALUE + 1);
  const bank = readIntegerIn(childText(midi, 'midi-bank'), 1, MAX_BANK);
  const key = readIntegerIn(childText(midi, 'midi-unpitched'), 1, MAX_MIDI_VALUE + 1);
  return {
    midiChannel: readIntegerIn(childText(midi, 'midi-channel'), 1, 16),
    program: program === undefined ? undefined : program - 1,
    bank: bank === undefined ? undefined : bank - 1,
    volume: volume === undefined ? undefined : Math.round(clamp(volume, 0, PERCENT) * (MAX_MIDI_VALUE / PERCENT)),
    balance: pan === undefined ? undefined : Math.round(clamp(PAN_CENTRE + (clamp(pan, -PAN_DEGREES, PAN_DEGREES) / PAN_DEGREES) * PAN_CENTRE, 0, MAX_MIDI_VALUE)),
    unpitchedKey: key === undefined ? undefined : key - 1,
  };
}

/** A score-part: its name (else its abbreviation or first instrument's name), its abbreviation and its instruments. */
export function readPartInfo(scorePart: XmlElement | undefined): PartInfo {
  const scoreInstruments = children(scorePart, 'score-instrument');
  const abbreviation = readText(childText(scorePart, 'part-abbreviation'));
  const name = readText(childText(scorePart, 'part-name')) || abbreviation || readText(childText(scoreInstruments[0], 'instrument-name'));
  const midis = children(scorePart, 'midi-instrument');
  const ids = [...new Set([...scoreInstruments, ...midis].map((element) => attribute(element, 'id') ?? ''))];
  const instruments = ids.map((id): PartInstrument => {
    const midi = midis.find((element) => (attribute(element, 'id') ?? '') === id);
    return { id, ...(midi === undefined ? {} : readMidi(midi)) };
  });
  return { name, abbreviation, instruments };
}
