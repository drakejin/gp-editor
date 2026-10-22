// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentReader#readTracks / #readChords (LGPL-2.1).
import { DEFAULT_PERCUSSION_CHANNEL } from '../../model/defaults';
import {
  type GpifChord,
  type GpifChordDiagram,
  type GpifLyricsLine,
  type GpifPlaybackState,
  type GpifTrack,
  type GpifVersion,
  indexById,
} from './gpif-document';
import {
  type XmlElement,
  attribute,
  child,
  childList,
  childText,
  children,
  parseFloatOr,
  parseIntList,
  parseJavaInt,
} from './xml';

/** RSE channel strip parameters: index 11 = pan, 12 = volume (0–1), as alphaTab reads them. */
/** Upper bound for a diagram's string count (TuxGuitar's TGTrack.MAX_STRINGS); guards against corrupt files. */
export const MAX_DIAGRAM_STRINGS = 25;
const CHANNEL_STRIP_BALANCE = 11;
const CHANNEL_STRIP_VOLUME = 12;

interface MidiSetup {
  readonly program: number;
  readonly bank: number;
  readonly channel1: number;
  readonly channel2: number;
}

/** Read every `<Track>`; MIDI channel defaults depend on the tracks read before. */
export function readTracks(root: XmlElement, version: GpifVersion): GpifTrack[] {
  const tracks: GpifTrack[] = [];
  for (const node of childList(root, 'Tracks', 'Track')) {
    tracks.push(readTrack(node, version, tracks));
  }
  return tracks;
}

function readTrack(node: XmlElement, version: GpifVersion, previous: readonly GpifTrack[]): GpifTrack {
  const properties = version === 6 ? childList(node, 'Properties', 'Property') : staffProperties(node);
  const midi = version === 6 ? readGeneralMidi(node, previous) : readMidiConnection(node, previous);
  const strip = channelStrip(node);
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    name: (childText(node, 'Name') ?? '').replaceAll('\n', '').trim(),
    color: parseIntList(childText(node, 'Color'), ' '),
    tuningPitches: parseIntList(childText(property(properties, 'Tuning'), 'Pitches'), ' '),
    capo: parseJavaInt(childText(property(properties, 'CapoFret'), 'Fret'), 0),
    gmProgram: midi.program,
    gmBank: midi.bank,
    gmChannel1: midi.channel1,
    gmChannel2: midi.channel2,
    volume: strip[CHANNEL_STRIP_VOLUME],
    balance: strip[CHANNEL_STRIP_BALANCE],
    playbackState: playbackState(childText(node, 'PlaybackState')),
    staffCount: version === 6 ? 1 : Math.max(1, childList(node, 'Staves', 'Staff').length),
    lyrics: childList(node, 'Lyrics', 'Line').map(readLyricsLine),
    chords: readChords(properties),
  };
}

function staffProperties(node: XmlElement): readonly XmlElement[] {
  return childList(child(child(node, 'Staves'), 'Staff'), 'Properties', 'Property');
}

function property(properties: readonly XmlElement[], name: string): XmlElement | undefined {
  return properties.find((p) => attribute(p, 'name') === name);
}

/** GP6 `<GeneralMidi>`: missing channels take the first free ones. */
function readGeneralMidi(node: XmlElement, previous: readonly GpifTrack[]): MidiSetup {
  const gm = child(node, 'GeneralMidi');
  if (gm === undefined) {
    return { program: 0, bank: 0, channel1: 0, channel2: 0 };
  }
  const channel1 = parseJavaInt(childText(gm, 'PrimaryChannel'), freeGmChannel(previous, []));
  const channel2 = parseJavaInt(childText(gm, 'SecondaryChannel'), freeGmChannel(previous, [channel1, 0]));
  return { program: parseJavaInt(childText(gm, 'Program'), 0), bank: 0, channel1, channel2 };
}

/** GP7 `<MidiConnection>` + `<Sounds>`; drum tracks without channels are guessed from the instrument set. */
function readMidiConnection(node: XmlElement, previous: readonly GpifTrack[]): MidiSetup {
  const connection = child(node, 'MidiConnection');
  const primary = parseJavaInt(childText(connection, 'PrimaryChannel'), -1);
  const secondary = parseJavaInt(childText(connection, 'SecondaryChannel'), -1);
  const sound = firstSound(node);
  if (primary >= 0 && secondary >= 0) {
    return { ...sound, channel1: primary, channel2: secondary };
  }
  if (isDrumInstrumentSet(child(node, 'InstrumentSet')) && sound.program === 0) {
    return { ...sound, channel1: DEFAULT_PERCUSSION_CHANNEL, channel2: DEFAULT_PERCUSSION_CHANNEL };
  }
  const channel1 = freeGmChannel(previous, []);
  return { ...sound, channel1, channel2: freeGmChannel(previous, [channel1, 0]) };
}

/**
 * Program and bank of the track's first `<Sound>` (its initial instrument). TuxGuitar takes the last
 * sound's program; the first one is the sound the track starts with.
 */
function firstSound(node: XmlElement): { readonly program: number; readonly bank: number } {
  const midi = childList(node, 'Sounds', 'Sound')
    .map((sound) => child(sound, 'MIDI'))
    .find((m) => m !== undefined);
  if (midi === undefined) {
    return { program: 0, bank: 0 };
  }
  const msb = parseJavaInt(childText(midi, 'MSB'), 0);
  const lsb = parseJavaInt(childText(midi, 'LSB'), 0);
  return { program: parseJavaInt(childText(midi, 'Program'), 0), bank: ((msb & 0x7f) << 7) | lsb };
}

function isDrumInstrumentSet(set: XmlElement | undefined): boolean {
  const name = (childText(set, 'Name') ?? '').toLowerCase();
  const type = (childText(set, 'Type') ?? '').toLowerCase();
  return name.includes('drum') || type.includes('drum');
}

/** GPXDocumentReader#getFreeGmChannel: lowest channel ≥ 1, not 9, unused by earlier tracks or `reserved`. */
function freeGmChannel(previous: readonly GpifTrack[], reserved: readonly number[]): number {
  const used = new Set<number>(reserved);
  for (const track of previous) {
    used.add(track.gmChannel1);
    used.add(track.gmChannel2);
  }
  let channel = 1;
  while (used.has(channel) || channel === DEFAULT_PERCUSSION_CHANNEL) {
    channel++;
  }
  return channel;
}

function channelStrip(node: XmlElement): readonly (number | undefined)[] {
  const text = childText(child(child(node, 'RSE'), 'ChannelStrip'), 'Parameters');
  const parts = (text ?? '').trim().split(/\s+/).filter((p) => p !== '');
  return parts.map((p) => {
    const value = parseFloatOr(p, Number.NaN);
    return Number.isNaN(value) ? undefined : value;
  });
}

function playbackState(text: string | undefined): GpifPlaybackState {
  if (text === 'Solo') {
    return 'solo';
  }
  return text === 'Mute' ? 'mute' : 'default';
}

function readLyricsLine(line: XmlElement): GpifLyricsLine {
  return { text: childText(line, 'Text') ?? '', offset: parseJavaInt(childText(line, 'Offset'), 0) };
}

/**
 * DiagramCollection items (with a diagram), then ChordCollection items for ids not seen yet
 * (GP7 chords without diagram, which TuxGuitar ignores).
 */
function readChords(properties: readonly XmlElement[]): ReadonlyMap<number, GpifChord> {
  const items = (name: string) => childList(property(properties, name), 'Items', 'Item');
  const diagrams = items('DiagramCollection')
    .filter((item) => child(item, 'Diagram') !== undefined)
    .map(readChordItem);
  const names = items('ChordCollection').map(readChordItem);
  return indexById([...diagrams, ...names]);
}

function readChordItem(item: XmlElement): GpifChord {
  const diagram = child(item, 'Diagram');
  return {
    id: parseJavaInt(attribute(item, 'id'), 0),
    name: attribute(item, 'name') ?? '',
    diagram: diagram === undefined ? undefined : readDiagram(diagram),
  };
}

function readDiagram(diagram: XmlElement): GpifChordDiagram {
  const stringCount = Math.min(MAX_DIAGRAM_STRINGS, Math.max(0, parseJavaInt(attribute(diagram, 'stringCount'), 0)));
  const frets: (number | undefined)[] = Array.from({ length: stringCount }, () => undefined);
  for (const fret of children(diagram, 'Fret')) {
    const string = parseJavaInt(attribute(fret, 'string'), 0);
    if (string >= 0 && string < stringCount) {
      frets[string] = parseJavaInt(attribute(fret, 'fret'), 0);
    }
  }
  return { stringCount, baseFret: parseJavaInt(attribute(diagram, 'baseFret'), 0), frets };
}
