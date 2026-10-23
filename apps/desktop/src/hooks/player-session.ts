import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { type AudioRun, type Song, type TimelineEntry, positionAt, renderMidi } from '@gp-editor/core';
import { type AudioPlayback, audioPlaybackOf, audioSecondsAtRender } from '../lib/audio-track';
import { isAudioLoaded } from '../native/audio-track';
import { bytesToBase64 } from '../lib/base64';
import { playingBeatAt, samePlayingBeat } from '../lib/playing-beat';
import {
  type LoopPass,
  type PlaybackPlan,
  type PlayRequest,
  loopPassAt,
  nextLoopBatch,
  planPlayback,
  startSeconds,
} from '../lib/practice-plan';
import { type PlayerPosition, playMidi, playerPosition, stopMidi } from '../native/player';
import type { PlayingBeat } from '../score/row';
import type { PracticeSettings } from '../state/practice';
import { errorMessage } from '../lib/errors';

/** How often the player position is read while playing. */
const POLL_INTERVAL_MS = 40;

export interface PlaybackState {
  readonly isPlaying: boolean;
  /** Beat of the shown track that is sounding now. */
  readonly playing?: PlayingBeat;
  /** While a loop plays: the pass being played and its tempo. */
  readonly loopPass?: LoopPass;
  /** The moment of the audio track heard with the playing beat (when its audio plays). */
  readonly audioSeconds?: number;
  readonly error?: string;
}

/** What polls and restarts read: the latest song and settings, the render playing, and where it is now. */
export interface Follow {
  readonly song: Song | undefined;
  readonly trackIndex: number;
  readonly practice: PracticeSettings;
  readonly timeline: readonly TimelineEntry[];
  readonly plan?: PlaybackPlan;
  /** The stretches of the audio track playing under the render (playback follows the audio track). */
  readonly audioRuns?: readonly AudioRun[];
  /** Bar and loop pass last seen playing: where a restart resumes. */
  readonly measureIndex: number;
  readonly passIndex?: number;
}

/** The playback hook's refs and state setter, shared by the functions below. */
export interface PlayerSession {
  readonly timer: MutableRefObject<ReturnType<typeof setInterval> | undefined>;
  /** Every start/stop bumps it; a play() or poll that resolves for an older generation is ignored. */
  readonly generation: MutableRefObject<number>;
  readonly follow: MutableRefObject<Follow>;
  readonly setState: Dispatch<SetStateAction<PlaybackState>>;
}

/** A render ready for the player: what it plays, its MIDI file, and where in it to start. */
interface PreparedPlayback {
  readonly plan: PlaybackPlan;
  readonly timeline: readonly TimelineEntry[];
  readonly base64Midi: string;
  readonly fromSeconds: number;
  readonly loopPass?: LoopPass;
  readonly audioRuns?: readonly AudioRun[];
  /** The audio track under the render; null when it is silent or there is none. */
  readonly audio: AudioPlayback | null;
}

/** A song with an audio track plays at the pace of its sync points (gp-core renderMidi's syncToAudioTrack). */
function preparePlayback(song: Song, practice: PracticeSettings, request: PlayRequest): PreparedPlayback {
  const plan = planPlayback(song, practice, request);
  const render = renderMidi(song, song.audioTrack === undefined ? plan.options : { ...plan.options, syncToAudioTrack: true });
  const fromSeconds = startSeconds(render.timeline, plan.startMeasureIndex, plan.startTick);
  return {
    plan,
    timeline: render.timeline,
    base64Midi: bytesToBase64(render.bytes),
    fromSeconds,
    loopPass: loopPassAt(plan, render.timeline, fromSeconds),
    audioRuns: render.audioRuns,
    audio: song.audioTrack !== undefined && isAudioLoaded(song.audioTrack.assetId) ? audioPlaybackOf(song, render.audioRuns) : null,
  };
}

function clearTimer(session: PlayerSession): void {
  if (session.timer.current !== undefined) {
    clearInterval(session.timer.current);
    session.timer.current = undefined;
  }
}

function isSameLoopPass(a: LoopPass | undefined, b: LoopPass | undefined): boolean {
  return a?.passIndex === b?.passIndex && a?.tempo === b?.tempo;
}

/** Silences the player and invalidates pending play() calls and polls, without touching React state. */
export function releasePlayer(session: PlayerSession): void {
  session.generation.current += 1;
  clearTimer(session);
  // Nothing is left to report once the player is being silenced.
  stopMidi().catch(() => undefined);
}

export function stopPlayer(session: PlayerSession): void {
  releasePlayer(session);
  session.setState({ isPlaying: false });
}

/** Renders what `request` asks for (song or loop batch, practice tempo applied), plays it, and polls it to the end. */
export function launchPlayer(session: PlayerSession, request: PlayRequest): void {
  const { song, practice } = session.follow.current;
  if (song === undefined) {
    return;
  }
  session.generation.current += 1;
  const startedGeneration = session.generation.current;
  clearTimer(session);
  try {
    const { plan, timeline, base64Midi, fromSeconds, loopPass, audioRuns, audio } = preparePlayback(song, practice, request);
    const measureIndex = plan.startMeasureIndex;
    session.follow.current = {
      ...session.follow.current,
      timeline,
      plan,
      audioRuns,
      measureIndex,
      passIndex: loopPass?.passIndex,
    };
    // Shown as playing at once, so a second Space press stops it even before the player has started.
    session.setState((previous) => ({ isPlaying: true, playing: previous.playing, loopPass }));
    playMidi(base64Midi, fromSeconds, audio)
      .then(() => {
        if (session.generation.current === startedGeneration) {
          clearTimer(session);
          session.timer.current = setInterval(() => {
            void pollPlayer(session);
          }, POLL_INTERVAL_MS);
        }
      })
      .catch((error: unknown) => {
        if (session.generation.current === startedGeneration) {
          session.setState({ isPlaying: false, error: errorMessage(error, 'Playback failed') });
        }
      });
  } catch (error: unknown) {
    // A restart can fail while the previous render still sounds.
    releasePlayer(session);
    session.setState({ isPlaying: false, error: errorMessage(error, 'Playback failed') });
  }
}

/** Restarts at the bar being played, keeping the loop's pass count (so the speed trainer's progression goes on). */
export function resumePlayer(session: PlayerSession): void {
  const { measureIndex, passIndex } = session.follow.current;
  launchPlayer(session, { measureIndex, firstPassIndex: passIndex });
}

/** One read of the player: follows the playing beat and loop pass; at the end, stops or plays the next loop batch. */
async function pollPlayer(session: PlayerSession): Promise<void> {
  const polledGeneration = session.generation.current;
  let position: PlayerPosition;
  try {
    position = await playerPosition();
  } catch (error: unknown) {
    if (session.generation.current === polledGeneration) {
      releasePlayer(session);
      session.setState({ isPlaying: false, error: errorMessage(error, 'Playback failed') });
    }
    return;
  }
  if (session.generation.current !== polledGeneration) {
    return;
  }
  const { song, trackIndex, timeline, plan } = session.follow.current;
  if (song === undefined || (!position.isPlaying && plan?.loop === undefined)) {
    stopPlayer(session);
    return;
  }
  if (!position.isPlaying) {
    launchPlayer(session, plan === undefined ? {} : nextLoopBatch(plan));
    return;
  }
  const at = positionAt(timeline, position.seconds);
  const loopPass = plan === undefined ? undefined : loopPassAt(plan, timeline, position.seconds);
  const follow = session.follow.current;
  session.follow.current = {
    ...follow,
    measureIndex: at?.headerIndex ?? follow.measureIndex,
    passIndex: loopPass?.passIndex ?? follow.passIndex,
  };
  const playing = at === undefined ? undefined : playingBeatAt(song, trackIndex, at);
  const audioSeconds = audioSecondsAtRender(session.follow.current.audioRuns, position.seconds);
  session.setState((previous) =>
    previous.isPlaying && samePlayingBeat(previous.playing, playing) && isSameLoopPass(previous.loopPass, loopPass)
      ? previous
      : { isPlaying: true, playing, loopPass, audioSeconds },
  );
}

/** The moment of the audio track heard now (asks the player where it is); undefined when no audio plays. */
export async function audioSecondsNow(session: PlayerSession): Promise<number | undefined> {
  const position = await playerPosition();
  return position.isPlaying ? audioSecondsAtRender(session.follow.current.audioRuns, position.seconds) : undefined;
}
