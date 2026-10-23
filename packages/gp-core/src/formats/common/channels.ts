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

/** The 16 General MIDI families; program p belongs to family floor(p / 8). */
export const GM_INSTRUMENT_FAMILIES: readonly string[] = [
  'Piano', 'Chromatic Percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass', 'Reed', 'Pipe',
  'Synth Lead', 'Synth Pad', 'Synth Effects', 'Ethnic', 'Percussive', 'Sound Effects',
];

const GM_FAMILY_SIZE = 8;

/** Index into GM_INSTRUMENT_FAMILIES of a program 0–127. */
export function gmFamilyIndex(program: number): number {
  return Math.floor(program / GM_FAMILY_SIZE);
}

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

/** General MIDI programs 32–39: acoustic, electric, fretless, slap and synth basses. */
const GM_BASS_PROGRAMS = { first: 32, last: 39 } as const;

/** True for a General MIDI bass program (32–39). */
export function isGmBassProgram(program: number): boolean {
  return program >= GM_BASS_PROGRAMS.first && program <= GM_BASS_PROGRAMS.last;
}

/** General MIDI program 105: banjo. */
export const GM_BANJO_PROGRAM = 105;

/** The first General MIDI percussion key with a sound (channel 10). */
const GM_PERCUSSION_FIRST_KEY = 35;

/** General MIDI percussion sounds, keys 35–81 (GM 1 sound set), the fret of a drum note. */
const GM_PERCUSSION_NAMES: readonly string[] = [
  'Acoustic Bass Drum', 'Bass Drum 1', 'Side Stick', 'Acoustic Snare', 'Hand Clap', 'Electric Snare', 'Low Floor Tom',
  'Closed Hi-Hat', 'High Floor Tom', 'Pedal Hi-Hat', 'Low Tom', 'Open Hi-Hat', 'Low-Mid Tom', 'Hi-Mid Tom',
  'Crash Cymbal 1', 'High Tom', 'Ride Cymbal 1', 'Chinese Cymbal', 'Ride Bell', 'Tambourine', 'Splash Cymbal',
  'Cowbell', 'Crash Cymbal 2', 'Vibraslap', 'Ride Cymbal 2', 'Hi Bongo', 'Low Bongo', 'Mute Hi Conga',
  'Open Hi Conga', 'Low Conga', 'High Timbale', 'Low Timbale', 'High Agogo', 'Low Agogo', 'Cabasa', 'Maracas',
  'Short Whistle', 'Long Whistle', 'Short Guiro', 'Long Guiro', 'Claves', 'Hi Wood Block', 'Low Wood Block',
  'Mute Cuica', 'Open Cuica', 'Mute Triangle', 'Open Triangle',
];

/** The General MIDI percussion keys of a drum kit's pieces. */
export const GM_DRUM_KEYS = {
  acousticBassDrum: 35,
  bassDrum: 36,
  sideStick: 37,
  snare: 38,
  electricSnare: 40,
  lowFloorTom: 41,
  closedHiHat: 42,
  highFloorTom: 43,
  pedalHiHat: 44,
  lowTom: 45,
  openHiHat: 46,
  lowMidTom: 47,
  hiMidTom: 48,
  crash1: 49,
  highTom: 50,
  ride: 51,
  china: 52,
  rideBell: 53,
  tambourine: 54,
  splash: 55,
  cowbell: 56,
  crash2: 57,
  ride2: 59,
} as const;

/** The General MIDI name of a percussion key (35–81); undefined for any other number. */
export function gmPercussionName(key: number): string | undefined {
  return Number.isInteger(key) && key >= GM_PERCUSSION_FIRST_KEY ? GM_PERCUSSION_NAMES[key - GM_PERCUSSION_FIRST_KEY] : undefined;
}
