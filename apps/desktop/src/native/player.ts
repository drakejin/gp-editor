import { NativeModules } from 'react-native';

export interface PlayerPosition {
  readonly seconds: number;
  readonly isPlaying: boolean;
}

/** A sound bank playback can use: GeneralUser GS (bundled), the macOS GS bank, or a SoundFont the user added. */
export interface SoundBank {
  readonly id: string;
  readonly name: string;
  /** Only banks the user added can be removed. */
  readonly isRemovable: boolean;
}

export interface SoundBanks {
  readonly banks: readonly SoundBank[];
  /** Empty when there is no bank at all (the synth then uses its own). */
  readonly selectedId: string;
}

interface GPPlayerModule {
  play(base64Midi: string, fromSeconds: number): Promise<void>;
  stop(): Promise<void>;
  position(): Promise<PlayerPosition>;
  setProgram(channel: number, program: number): Promise<void>;
  setController(channel: number, controller: number, value: number): Promise<void>;
  soundBanks(): Promise<SoundBanks>;
  selectSoundBank(id: string): Promise<SoundBanks>;
  addSoundBank(): Promise<SoundBanks | null>;
  removeSoundBank(id: string): Promise<SoundBanks>;
}

/** JS side of macos/GPEditor-macOS/GPPlayer.m (GPMidiEngine with the selected sound bank, see GPSoundBanks.m). */
const native = NativeModules.GPPlayer as GPPlayerModule | undefined;

function requireNative(): GPPlayerModule {
  if (native === undefined) {
    throw new Error('GPPlayer native module is not available on this platform');
  }
  return native;
}

export function playMidi(base64Midi: string, fromSeconds = 0): Promise<void> {
  return requireNative().play(base64Midi, fromSeconds);
}

export function stopMidi(): Promise<void> {
  return native === undefined ? Promise.resolve() : native.stop();
}

/** Switches a MIDI channel of the playing song to another program now (a track's instrument changed). */
export function setMidiProgram(midiChannel: number, program: number): Promise<void> {
  return native === undefined ? Promise.resolve() : native.setProgram(midiChannel, program);
}

/** Sends a control change to a MIDI channel of the playing song now (a track's volume or pan changed). */
export function setMidiController(midiChannel: number, controller: number, value: number): Promise<void> {
  return native === undefined ? Promise.resolve() : native.setController(midiChannel, controller, value);
}

export function playerPosition(): Promise<PlayerPosition> {
  return native === undefined ? Promise.resolve({ seconds: 0, isPlaying: false }) : native.position();
}

const NO_SOUND_BANKS: SoundBanks = { banks: [], selectedId: '' };

/** The banks and the selected one; none where the native module is missing (tests). */
export function loadSoundBanks(): Promise<SoundBanks> {
  return native === undefined ? Promise.resolve(NO_SOUND_BANKS) : native.soundBanks();
}

export function selectSoundBank(id: string): Promise<SoundBanks> {
  return requireNative().selectSoundBank(id);
}

/** Open panel for a .sf2/.dls file; the copy becomes the selected bank. null when cancelled. */
export function addSoundBank(): Promise<SoundBanks | null> {
  return requireNative().addSoundBank();
}

export function removeSoundBank(id: string): Promise<SoundBanks> {
  return requireNative().removeSoundBank(id);
}
