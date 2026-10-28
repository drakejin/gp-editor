// Playback in the Windows build: spessasynth_lib (a SoundFont / DLS synthesizer in an AudioWorklet) and its MIDI
// sequencer, in place of GPMidiEngine.m (AVAudioSequencer + MIDISynth). The song arrives as a Standard MIDI File, as
// on the Mac; the sound bank is the one chosen in the Song inspector (GeneralUser GS by default, src-tauri resources).
import type { MIDIController } from 'spessasynth_core';
import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';
import { t } from '../../lib/i18n/i18n';
import { silenceTracks } from './smf-tracks';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';

interface Engine {
  readonly context: AudioContext;
  readonly synth: WorkletSynthesizer;
  readonly sequencer: Sequencer;
}

/** Where the sequencer is: its song is loading, playing or done. */
interface Session {
  readonly fromSeconds: number;
  isLoaded: boolean;
  isEnded: boolean;
}

let engine: Promise<Engine> | undefined;
let loadedBankId: string | undefined;
/** A bank still in the synth that is no longer chosen (removed or reloaded): deleted when the next one is in. */
let staleBankId: string | undefined;
let session: Session | undefined;

async function createEngine(): Promise<Engine> {
  const context = new AudioContext({ latencyHint: 'playback' });
  await context.audioWorklet.addModule(processorUrl);
  const synth = new WorkletSynthesizer(context);
  synth.connect(context.destination);
  await synth.isReady;
  const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false });
  sequencer.loopCount = 0;
  sequencer.eventHandler.addEvent('songChange', 'gp-editor', () => {
    if (session !== undefined) {
      session.isLoaded = true;
    }
  });
  sequencer.eventHandler.addEvent('songEnded', 'gp-editor', () => {
    if (session !== undefined) {
      session.isEnded = true;
    }
  });
  return { context, synth, sequencer };
}

function getEngine(): Promise<Engine> {
  if (engine === undefined) {
    engine = createEngine();
    engine.catch(() => {
      engine = undefined;
    });
  }
  return engine;
}

/** Makes `bankId` the synth's sound bank (read by `readBank` the first time it is needed). */
async function loadBank(synth: WorkletSynthesizer, bankId: string, readBank: () => Promise<Uint8Array>): Promise<void> {
  if (loadedBankId === bankId) {
    return;
  }
  const bytes = await readBank();
  const previous = loadedBankId ?? staleBankId;
  // Adding under an id the synth already has replaces that bank.
  await synth.soundBankManager.addSoundBank(bytes.slice().buffer, bankId);
  loadedBankId = bankId;
  staleBankId = undefined;
  if (previous !== undefined && previous !== bankId) {
    await synth.soundBankManager.deleteSoundBank(previous);
  }
}

export interface PlayRequest {
  readonly midi: Uint8Array;
  readonly fromSeconds: number;
  readonly bankId: string;
  readonly readBank: () => Promise<Uint8Array>;
}

/** The file's tracks kept silent (setMutedTracks), for this song and the next ones. */
let mutedTracks: readonly number[] = [];
/** The song playing (to play it again from where it is when the muted tracks change). */
let playing: PlayRequest | undefined;

/** Plays a Standard MIDI File from a time (seconds) with the sound bank; stops what was playing. */
export async function playSong(request: PlayRequest): Promise<void> {
  const { context, synth, sequencer } = await getEngine();
  if (context.state !== 'running') {
    await context.resume();
  }
  if (request.bankId === '') {
    throw new Error(t('window.windows.noSoundBank'));
  }
  await loadBank(synth, request.bankId, request.readBank);
  sequencer.pause();
  synth.stopAll(true);
  playing = request;
  session = { fromSeconds: Math.max(0, request.fromSeconds), isLoaded: false, isEnded: false };
  sequencer.loadNewSongList([{ binary: silenceTracks(request.midi, mutedTracks).slice().buffer, fileName: 'song.mid' }]);
  sequencer.currentTime = session.fromSeconds;
  sequencer.play();
}

/**
 * The tracks of the MIDI file that stay silent, now and for the songs played after (the metronome's while it is off):
 * a playing song goes on from where it is with them silent.
 */
export async function setSilentTracks(trackIndexes: readonly number[]): Promise<void> {
  const isSame = trackIndexes.length === mutedTracks.length && trackIndexes.every((index) => mutedTracks.includes(index));
  mutedTracks = [...trackIndexes];
  const current = session;
  if (isSame || engine === undefined || playing === undefined || current === undefined || current.isEnded) {
    return;
  }
  const { sequencer } = await engine;
  if (current.isLoaded && !sequencer.paused) {
    await playSong({ ...playing, fromSeconds: sequencer.currentTime });
  }
}

/** One note now (a key or fret hovered), when no song plays: a song's channels keep their own programs. */
export async function playPreviewNote(note: PreviewRequest): Promise<void> {
  if (session !== undefined && !session.isEnded) {
    return;
  }
  const { context, synth } = await getEngine();
  if (context.state !== 'running') {
    await context.resume();
  }
  await loadBank(synth, note.bankId, note.readBank);
  synth.programChange(note.midiChannel, note.program);
  synth.noteOn(note.midiChannel, note.key, note.velocity);
  setTimeout(() => synth.noteOff(note.midiChannel, note.key), note.durationMs);
}

export interface PreviewRequest {
  readonly midiChannel: number;
  readonly program: number;
  readonly key: number;
  readonly velocity: number;
  readonly durationMs: number;
  readonly bankId: string;
  readonly readBank: () => Promise<Uint8Array>;
}

export async function stopSong(): Promise<void> {
  session = undefined;
  playing = undefined;
  if (engine === undefined) {
    return;
  }
  const { synth, sequencer } = await engine;
  sequencer.pause();
  synth.stopAll(true);
}

/** Where playback is (seconds into the file) and whether it still plays. */
export async function songPosition(): Promise<{ seconds: number; isPlaying: boolean }> {
  const current = session;
  if (engine === undefined || current === undefined) {
    return { seconds: 0, isPlaying: false };
  }
  const { sequencer } = await engine;
  if (!current.isLoaded) {
    return { seconds: current.fromSeconds, isPlaying: true };
  }
  const seconds = sequencer.currentTime;
  const isPlaying = !current.isEnded && !sequencer.isFinished && !sequencer.paused && seconds < sequencer.duration;
  return { seconds, isPlaying };
}

/** A program change on a channel now (a track's instrument changed while playing). */
export async function changeProgram(channel: number, program: number): Promise<void> {
  if (engine !== undefined) {
    (await engine).synth.programChange(channel, program);
  }
}

/** A control change on a channel now (a track's volume or pan changed while playing). */
export async function changeController(channel: number, controller: number, value: number): Promise<void> {
  if (engine !== undefined) {
    // MIDIController is spessasynth's enum of controller numbers; the app sends GM numbers (7 volume, 10 pan).
    (await engine).synth.controllerChange(channel, controller as MIDIController, value);
  }
}

/** The bank is gone or replaced: the next play loads the selected one afresh. */
export function forgetBank(bankId: string): void {
  if (loadedBankId === bankId) {
    loadedBankId = undefined;
    staleBankId = bankId;
  }
}
