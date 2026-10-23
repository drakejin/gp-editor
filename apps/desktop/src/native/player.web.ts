// Windows twin of player.ts: playback on web/synth.ts (spessasynth_lib), sound banks kept by the Rust side
// (src-tauri/src/commands/sound_banks.rs: GeneralUser GS bundled, banks the user added copied into the app's folder).
import { base64ToBytes } from '../lib/base64';
import { pickFilePath } from './web/files';
import { readSetting, writeSetting } from './web/settings';
import { changeController, changeProgram, forgetBank, playSong, songPosition, stopSong } from './web/synth';
import { call, callBytes, isTauri } from './web/tauri';

export interface PlayerPosition {
  readonly seconds: number;
  readonly isPlaying: boolean;
}

export interface SoundBank {
  readonly id: string;
  readonly name: string;
  readonly isRemovable: boolean;
}

export interface SoundBanks {
  readonly banks: readonly SoundBank[];
  readonly selectedId: string;
}

const SELECTED_BANK_SETTING = 'sound-bank.txt';
const NO_SOUND_BANKS: SoundBanks = { banks: [], selectedId: '' };

function isSoundBank(value: unknown): value is SoundBank {
  const bank = value as SoundBank;
  return typeof value === 'object' && value !== null && typeof bank.id === 'string' && typeof bank.name === 'string' && typeof bank.isRemovable === 'boolean';
}

/** The banks the Rust side has, and the chosen one (the first when the chosen one is gone). */
export async function loadSoundBanks(): Promise<SoundBanks> {
  if (!isTauri()) {
    return NO_SOUND_BANKS;
  }
  const listed = await call<unknown>('sound_banks_list');
  const banks = Array.isArray(listed) ? listed.filter(isSoundBank) : [];
  const saved = await readSetting(SELECTED_BANK_SETTING);
  const selectedId = banks.some((bank) => bank.id === saved) ? (saved ?? '') : banks[0]?.id ?? '';
  return { banks, selectedId };
}

export async function playMidi(base64Midi: string, fromSeconds = 0): Promise<void> {
  const { selectedId } = await loadSoundBanks();
  await playSong({
    midi: base64ToBytes(base64Midi),
    fromSeconds,
    bankId: selectedId,
    readBank: () => callBytes('sound_bank_read', { id: selectedId }),
  });
}

export function stopMidi(): Promise<void> {
  return stopSong();
}

export function setMidiProgram(midiChannel: number, program: number): Promise<void> {
  return changeProgram(midiChannel, program);
}

export function setMidiController(midiChannel: number, controller: number, value: number): Promise<void> {
  return changeController(midiChannel, controller, value);
}

export function playerPosition(): Promise<PlayerPosition> {
  return songPosition();
}

export async function selectSoundBank(id: string): Promise<SoundBanks> {
  const { banks } = await loadSoundBanks();
  if (!banks.some((bank) => bank.id === id)) {
    throw new Error('That sound bank is no longer available');
  }
  await writeSetting(SELECTED_BANK_SETTING, id);
  return { banks, selectedId: id };
}

/** The open dialog for a .sf2 / .dls file; the Rust side copies it, and the copy becomes the chosen bank. */
export async function addSoundBank(): Promise<SoundBanks | null> {
  const path = await pickFilePath([{ name: 'SoundFont or DLS sound bank', extensions: ['sf2', 'sf3', 'dls'] }], 'Add a sound bank for playback');
  if (path === null) {
    return null;
  }
  const id = await call<string>('sound_bank_add', { path });
  forgetBank(id);
  return selectSoundBank(id);
}

export async function removeSoundBank(id: string): Promise<SoundBanks> {
  await call('sound_bank_remove', { id });
  forgetBank(id);
  return loadSoundBanks();
}
