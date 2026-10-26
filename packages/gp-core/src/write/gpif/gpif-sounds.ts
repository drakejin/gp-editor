// MIDI channels, tuning instruments and sound names of GPIF tracks (no TuxGuitar counterpart: TuxGuitar has no GPIF
// writer); their instrument sets are formats/common/instrument-sets.ts.
import { GM_INSTRUMENT_NAMES, isGmBassProgram } from '../../formats/common/channels';
import { DEFAULT_PERCUSSION_CHANNEL } from '../../model/defaults';
import type { Channel, Song, Track } from '../../model/song';

/** `<MidiConnection>` channels of a track. The reader keeps one song channel per primary channel. */
export interface MidiChannels {
  readonly primary: number;
  readonly secondary: number;
}

const MIDI_CHANNEL_COUNT = 16;
/** Channels for pitched tracks: all but the percussion channel (MIDI channel 10). */
const MELODIC_CHANNELS: readonly number[] = Array.from({ length: MIDI_CHANNEL_COUNT }, (_, i) => i).filter(
  (channel) => channel !== DEFAULT_PERCUSSION_CHANNEL,
);
const PERCUSSION: MidiChannels = { primary: DEFAULT_PERCUSSION_CHANNEL, secondary: DEFAULT_PERCUSSION_CHANNEL };

/** The song channel a track plays on; undefined when the song has none with its id. */
export function channelOf(song: Song, track: Track): Channel | undefined {
  return song.channels.find((channel) => channel.id === track.channelId);
}

/** Whether a track is written as a drum track (its channel is a percussion channel). */
export function isPercussionTrack(song: Song, track: Track): boolean {
  return channelOf(song, track)?.isPercussion ?? track.isPercussion;
}

/**
 * MIDI channels per song channel id, in the order tracks first use them. Every percussion channel plays on channel 10
 * (so the reader merges them). Pitched channels take a primary and a secondary channel (Guitar Pro plays bends on the
 * secondary) while there are enough, then one channel each; past fifteen they wrap round (and the reader merges them).
 */
export function assignMidiChannels(song: Song): ReadonlyMap<number, MidiChannels> {
  const order: number[] = [];
  for (const track of song.tracks) {
    if (!order.includes(track.channelId)) {
      order.push(track.channelId);
    }
  }
  const melodic = order.filter((id) => !(song.channels.find((channel) => channel.id === id)?.isPercussion ?? false));
  const isPaired = melodic.length * 2 <= MELODIC_CHANNELS.length;
  const channels = new Map<number, MidiChannels>();
  for (const id of order) {
    const index = melodic.indexOf(id);
    if (index < 0) {
      channels.set(id, PERCUSSION);
      continue;
    }
    const primary = MELODIC_CHANNELS[(isPaired ? index * 2 : index) % MELODIC_CHANNELS.length] ?? 0;
    channels.set(id, { primary, secondary: isPaired ? (MELODIC_CHANNELS[index * 2 + 1] ?? primary) : primary });
  }
  return channels;
}

/** `<Tuning><Instrument>`: what Guitar Pro's tuning dialog lists the strings for. */
export function tuningInstrumentOf(program: number, isPercussion: boolean): string {
  if (isPercussion) {
    return 'Undefined';
  }
  return isGmBassProgram(program) ? 'Bass' : 'Guitar';
}

/** Name of a track's `<Sound>`: the General MIDI instrument (or the drum kit). */
export function soundNameOf(program: number, isPercussion: boolean): string {
  return isPercussion ? 'Drumkit' : (GM_INSTRUMENT_NAMES[program] ?? 'Sound');
}
