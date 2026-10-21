// Port of TuxGuitar TGSongManager.createChannelNameFromProgram (LGPL-2.1): GM names for channels, used by the gtp and gpif readers.
import type { Channel } from '../../model/song';

/** General MIDI program names, as TuxGuitar's messages.properties (midi.instrument-N) spells them. */
export const GM_INSTRUMENT_NAMES: readonly string[] = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-Tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet', 'Celesta', 'Glockenspiel', 'Music Box',
  'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer', 'Hammond Organ', 'Percussive Organ',
  'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Nylon String Acoustic Guitar', 'Steel String Acoustic Guitar', 'Jazz Electric Guitar', 'Clean Electric Guitar',
  'Muted Electric Guitar', 'Overdrive Electric Guitar', 'Distortion Electric Guitar', 'Harmonics Electric Guitar',
  'Acoustic Bass', 'Fingered Electric Bass', 'Picked Electric Bass', 'Fretless Electric Bass', 'Slap Bass 1',
  'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2', 'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings',
  'Pizzicato Strings', 'Orchestral Harp', 'Timpani', 'String Ensemble', 'Slower String Ensemble',
  'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit', 'Trumpet',
  'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Synth Lead 1 - Square Wave', 'Synth Lead 2 - Saw Wave', 'Synth Lead 3 - Calliope', 'Synth Lead 4 - Chiff',
  'Synth Lead 5 - Charang', 'Synth Lead 6 - Voice', 'Synth Lead 7 - Fifths Saw', 'Synth Lead 8 - Bass and Lead',
  'Synth Pad 1 - New Age', 'Synth Pad 2 - Warm', 'Synth Pad 3 - Polysynth', 'Synth Pad 4 - Choir',
  'Synth Pad 5 - Bowed', 'Synth Pad 6 - Metallic', 'Synth Pad 7 - Halo', 'Synth Pad 8 - Sweep',
  'Synth FX 1 - Rain', 'Synth FX 2 - Soundtrack', 'Synth FX 3 - Crystal', 'Synth FX 4 - Atmosphere',
  'Synth FX 5 - Brightness', 'Synth FX 6 - Goblins', 'Synth FX 7 - Echo Drops', 'Synth FX 8 - Sci-Fi', 'Sitar',
  'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bag Pipe', 'Fiddle', 'Shanai', 'Tinkle Bell', 'Agogô', 'Steel Drums',
  'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal', 'Guitar Fret Noise', 'Breath Noise',
  'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
];

const PERCUSSION_CHANNEL_PREFIX = 'DrumKit';
const DEFAULT_CHANNEL_PREFIX = 'Untitled';

/** TGSongManager.createChannelNameFromProgram: "<instrument> N" with the first unused N. */
export function createChannelName(existing: readonly Channel[], program: number, isPercussion: boolean): string {
  const prefix = isPercussion ? PERCUSSION_CHANNEL_PREFIX : (GM_INSTRUMENT_NAMES[program] ?? DEFAULT_CHANNEL_PREFIX);
  const taken = new Set(existing.map((channel) => channel.name));
  let number = 1;
  while (taken.has(`${prefix} ${number}`)) {
    number++;
  }
  return `${prefix} ${number}`;
}
