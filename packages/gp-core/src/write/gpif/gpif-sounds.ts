// MIDI channels and instrument sets of GPIF tracks (no TuxGuitar counterpart: TuxGuitar has no GPIF writer).
import { GM_INSTRUMENT_NAMES, gmFamilyIndex, isGmBassProgram } from '../../formats/common/channels';
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

/** How Guitar Pro presents a track's instrument: its instrument set, icon and playing style. */
export interface InstrumentSet {
  readonly name: string;
  readonly type: string;
  readonly iconId: number;
  readonly isStringed: boolean;
}

/** [instrument set name, Guitar Pro icon id] per General MIDI family (program / 8). */
const FAMILY_SETS: readonly (readonly [string, number])[] = [
  ['Acoustic Piano', 10], ['Vibraphone', 17], ['Electric Organ', 10], ['Electric Guitar', 4],
  ['Electric Bass', 5], ['Violin', 11], ['Violin', 11], ['Trumpet', 13],
  ['Saxophone', 14], ['Flute', 15], ['Lead Synthesizer', 12], ['Pad Synthesizer', 12],
  ['Pad Synthesizer', 21], ['Banjo', 8], ['Xylophone', 19], ['Pad Synthesizer', 21],
];

/** Programs whose instrument set differs from their family's. */
const PROGRAM_SETS: ReadonlyMap<number, readonly [string, number]> = new Map([
  [24, ['Nylon Guitar', 23]],
  [25, ['Steel Guitar', 1]],
  [32, ['Acoustic Bass', 5]],
  [35, ['Acoustic Bass', 5]],
  [41, ['Viola', 11]],
  [42, ['Cello', 11]],
  [43, ['Contrabass', 11]],
  [46, ['Harp', 10]],
  [47, ['Timpani', 20]],
  [52, ['Voice', 16]],
  [53, ['Voice', 16]],
  [54, ['Voice', 16]],
]);
const DRUM_SET: InstrumentSet = { name: 'Drums', type: 'drumKit', iconId: 18, isStringed: false };
const GUITAR_FAMILY = 3;

/** "Steel Guitar" → "steelGuitar", as Guitar Pro types its instrument sets. */
function typeOf(name: string): string {
  const [first = '', ...rest] = name.split(' ');
  return [first.charAt(0).toLowerCase() + first.slice(1), ...rest].join('');
}

export function instrumentSetOf(program: number, isPercussion: boolean): InstrumentSet {
  if (isPercussion) {
    return DRUM_SET;
  }
  const family = gmFamilyIndex(program);
  const [name, iconId] = PROGRAM_SETS.get(program) ?? FAMILY_SETS[family] ?? ['Steel Guitar', 1];
  return { name, type: typeOf(name), iconId, isStringed: family === GUITAR_FAMILY || isGmBassProgram(program) };
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
