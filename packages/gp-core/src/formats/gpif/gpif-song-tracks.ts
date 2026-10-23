// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser#parseTracks (LGPL-2.1).
import {
  DEFAULT_CHANNEL,
  DEFAULT_PERCUSSION_BANK,
  DEFAULT_PERCUSSION_CHANNEL,
  STANDARD_TUNING,
} from '../../model/defaults';
import type { Channel, GuitarString, Lyrics, Measure, Rgb, Track } from '../../model/song';
import { createChannelName } from '../common/channels';
import type { GpifDocument, GpifTrack } from './gpif-document';
import type { TrackLayout } from './gpif-measure';
import { pedalAutomationsByBar } from './gpif-pedals';

const PERCUSSION_STRING_COUNT = 6;
const MAX_MIDI_VALUE = 127;
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

export interface SongTracks {
  readonly channels: readonly Channel[];
  readonly tracks: readonly Track[];
}

/** A channel plus the GM channel that identifies it (tracks on the same GM channel share it). */
interface ChannelEntry {
  readonly gmChannel1: number;
  readonly channel: Channel;
}

/**
 * Channels and tracks. As in TuxGuitar, tracks whose primary GM channel is already used share
 * that channel; GM channel 9 makes a percussion channel (bank 128, program 0).
 */
export function buildTracks(
  doc: GpifDocument,
  measuresFor: (layout: TrackLayout) => readonly Measure[],
): SongTracks {
  const entries: ChannelEntry[] = [];
  const tracks: Track[] = [];
  let barIndex = 0;
  doc.tracks.forEach((gpTrack, index) => {
    const isPercussion = gpTrack.gmChannel1 === DEFAULT_PERCUSSION_CHANNEL;
    const existing = entries.find((entry) => entry.gmChannel1 === gpTrack.gmChannel1);
    const channel = existing?.channel ?? buildChannel(gpTrack, entries, isPercussion);
    if (existing === undefined) {
      entries.push({ gmChannel1: gpTrack.gmChannel1, channel });
    }
    const strings = buildStrings(gpTrack, isPercussion);
    const layout: TrackLayout = { strings, isPercussion, barIndex, chords: gpTrack.chords, pedalAutomations: pedalAutomationsByBar(gpTrack.automations) };
    tracks.push(buildTrack(gpTrack, index, channel.id, layout, measuresFor(layout)));
    // GP7 multi-staff tracks have one bar per staff; the model keeps the first staff.
    barIndex += gpTrack.staffCount;
  });
  return { channels: entries.map((entry) => entry.channel), tracks };
}

/** A new channel; named from its program like TuxGuitar's createChannelNameFromProgram. */
function buildChannel(gpTrack: GpifTrack, entries: readonly ChannelEntry[], isPercussion: boolean): Channel {
  const program = isPercussion ? 0 : clampMidi(gpTrack.gmProgram);
  const existing = entries.map((entry) => entry.channel);
  return {
    ...DEFAULT_CHANNEL,
    id: entries.length + 1,
    name: createChannelName(existing, program, isPercussion),
    program,
    bank: isPercussion ? DEFAULT_PERCUSSION_BANK : Math.max(0, gpTrack.gmBank),
    volume: scaled(gpTrack.volume, DEFAULT_CHANNEL.volume),
    balance: scaled(gpTrack.balance, DEFAULT_CHANNEL.balance),
    isPercussion,
  };
}

function clampMidi(value: number): number {
  return Math.min(MAX_MIDI_VALUE, Math.max(0, value));
}

/** RSE channel strip value 0–1 → MIDI 0–127. */
function scaled(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : clampMidi(Math.round(value * MAX_MIDI_VALUE));
}

/** GPIF tunings list the lowest string first; the model numbers strings from the highest. */
function buildStrings(gpTrack: GpifTrack, isPercussion: boolean): readonly GuitarString[] {
  const pitches = gpTrack.tuningPitches;
  if (pitches !== undefined && pitches.length > 0) {
    return [...pitches].reverse().map((tuning, i) => ({ number: i + 1, tuning }));
  }
  const tuning = isPercussion ? Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0) : STANDARD_TUNING;
  return tuning.map((value, i) => ({ number: i + 1, tuning: value }));
}

function buildTrack(
  gpTrack: GpifTrack,
  index: number,
  channelId: number,
  layout: TrackLayout,
  measures: readonly Measure[],
): Track {
  const lyrics = firstLyrics(gpTrack);
  return {
    number: index + 1,
    name: gpTrack.name,
    channelId,
    strings: layout.strings,
    color: colorOf(gpTrack.color),
    offset: gpTrack.tuningPitches === undefined ? 0 : gpTrack.capo,
    isPercussion: layout.isPercussion,
    solo: gpTrack.playbackState === 'solo',
    mute: gpTrack.playbackState === 'mute',
    ...(lyrics === undefined ? {} : { lyrics }),
    measures,
  };
}

function colorOf(color: readonly number[] | undefined): Rgb {
  const [r, g, b] = color ?? [];
  return color?.length === 3 && r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : BLACK;
}

/** The model holds one lyrics text: the first non-empty GPIF lyrics line (its offset is a 0-based bar). */
function firstLyrics(gpTrack: GpifTrack): Lyrics | undefined {
  const line = gpTrack.lyrics.find((l) => l.text.trim() !== '');
  return line === undefined ? undefined : { from: line.offset + 1, text: line.text };
}
