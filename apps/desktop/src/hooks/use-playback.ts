import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { audioGain, audioTrackChange } from '../lib/audio-track';
import { type LiveChange, hasSameMuteAndSolo, liveChannelChanges } from '../lib/live-channels';
import type { MetronomeBeat } from '../lib/metronome-beat';
import { hasSameEffectRouting } from '../lib/mix';
import type { LoopPass } from '../lib/practice-plan';
import { setAudioTrackMix, setMidiController, setMidiProgram } from '../native/player';
import type { PlayingTracks } from '../lib/playing-beat';
import type { PlayingBeat } from '../score/row';
import { INITIAL_PRACTICE, type PracticeAction, type PracticeSettings, needsNewRender, practiceReducer } from '../state/practice';
import {
  type Follow,
  type PlaybackState,
  type PlayerSession,
  applyMetronome,
  audioSecondsNow,
  launchPlayer,
  releasePlayer,
  resumePlayer,
  stopPlayer,
} from './player-session';

export interface Playback {
  readonly isPlaying: boolean;
  /** Beat of the shown track that is sounding now. */
  readonly playing?: PlayingBeat;
  /** In the multitrack view: the beat sounding now on each shown track. */
  readonly playingTracks?: PlayingTracks;
  /** While a loop plays: the pass being played and its tempo. */
  readonly loopPass?: LoopPass;
  /** The metronome's beat now, the count-in's too (the visual metronome). */
  readonly beat?: MetronomeBeat;
  /** The moment of the audio track heard with the playing beat (while its audio plays). */
  readonly audioSeconds?: number;
  readonly error?: string;
  /** Playback tempo, loop, speed trainer, metronome, count-in and tempo lock of this session (never saved to the file). */
  readonly practice: PracticeSettings;
  /**
   * Plays from a bar (from `fromTick` inside it, when given); when looping, plays the loop until stopped, starting there
   * when that bar is inside the loop, else at the loop's first bar. With the count-in on, a bar of clicks comes first
   * and playback starts at the bar's beginning (a loop's at its first bar).
   */
  readonly start: (fromMeasureIndex: number, fromTick?: number) => void;
  readonly stop: () => void;
  readonly dismissError: () => void;
  /**
   * Changes the practice settings; while playing, playback restarts at the current bar with them (the metronome's
   * toggle is heard at once, without a restart).
   */
  readonly changePractice: (action: PracticeAction) => void;
  /** While playing, starts again at the current bar (after a new sound bank); does nothing when stopped. */
  readonly restart: () => void;
  /** The moment of the audio track heard now; undefined when stopped or no audio plays. */
  readonly audioSecondsNow: () => Promise<number | undefined>;
}

/** Quiet time after the last click before a coalesced restart. */
const RESTART_DELAY_MS = 300;

function sendLiveChange(change: LiveChange): void {
  const sent =
    change.kind === 'program'
      ? setMidiProgram(change.midiChannel, change.value)
      : setMidiController(change.midiChannel, change.controller, change.value);
  sent.catch(() => undefined);
}

function cancelRestart(timer: { current: ReturnType<typeof setTimeout> | undefined }): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
}

/**
 * Plays the whole song (all tracks, honouring mute/solo) from a measure, or the practice loop pass after pass, at the
 * practice tempo, and follows it on the given track (and on the shown tracks of the multitrack view).
 */
export function usePlayback(song: Song | undefined, trackIndex: number, shownTrackIndexes?: readonly number[]): Playback {
  const [state, setState] = useState<PlaybackState>({ isPlaying: false });
  const [practice, setPractice] = useState<PracticeSettings>(INITIAL_PRACTICE);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const generation = useRef(0);
  const follow = useRef<Follow>({ song, trackIndex, practice, timeline: [], measureIndex: 0 });
  follow.current = { ...follow.current, song, trackIndex, shownTrackIndexes, practice };
  const session = useMemo<PlayerSession>(() => ({ timer, generation, follow, setState }), []);

  // Restarts are coalesced: a run of clicks (instruments, sound banks) restarts once, after the last.
  const restartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isPlayingNow = useRef(false);
  isPlayingNow.current = state.isPlaying;

  const stop = useCallback(() => {
    cancelRestart(restartTimer);
    stopPlayer(session);
  }, [session]);
  // The count-in plays when playback starts, not when a bar button moves playing playback.
  const start = useCallback(
    (fromMeasureIndex: number, fromTick?: number) => {
      const { practice: current } = follow.current;
      const withCountIn = current.isCountInOn && !isPlayingNow.current;
      launchPlayer(session, { measureIndex: fromMeasureIndex, tick: fromTick, withCountIn });
    },
    [session],
  );
  const { isPlaying } = state;
  const changePractice = useCallback(
    (action: PracticeAction) => {
      const previous = follow.current.practice;
      const next = practiceReducer(previous, action);
      if (next === previous) {
        return;
      }
      follow.current = { ...follow.current, practice: next };
      setPractice(next);
      if (!isPlaying) {
        return;
      }
      // The metronome is a track of the render: turning it on or off mutes it in place, without a gap.
      if (needsNewRender(previous, next)) {
        resumePlayer(session);
      } else if (previous.isMetronomeOn !== next.isMetronomeOn) {
        applyMetronome(session);
      }
    },
    [session, isPlaying],
  );
  const dismissError = useCallback(() => setState((previous) => ({ ...previous, error: undefined })), []);
  const restart = useCallback(() => {
    cancelRestart(restartTimer);
    restartTimer.current = setTimeout(() => {
      if (isPlayingNow.current) {
        resumePlayer(session);
      }
    }, RESTART_DELAY_MS);
  }, [session]);

  // A track's instrument, volume or pan changed (same bars): sent live on its MIDI channels, heard at once; a restart
  // only when the MIDI channels themselves changed (e.g. the track got a channel of its own), a track was muted or
  // soloed, or a track got its first effect or lost its last. Effect values are sent live by useMixSync.
  const followedSong = useRef(song);
  useEffect(() => {
    const previous = followedSong.current;
    followedSong.current = song;
    if (!isPlaying || previous === undefined || song === undefined || previous.measureHeaders !== song.measureHeaders) {
      return;
    }
    // A track's first effect (or its last removed) moves it onto instruments of its own: only a restart routes it.
    if (!hasSameEffectRouting(previous, song)) {
      restart();
      return;
    }
    if (previous.channels === song.channels && hasSameMuteAndSolo(previous, song)) {
      return;
    }
    const changes = liveChannelChanges(previous, song);
    if (changes === undefined) {
      restart();
      return;
    }
    changes.forEach(sendLiveChange);
  }, [song, isPlaying, restart]);

  // The audio track: another file, mute or solo restart playback; its volume and detune are heard at once.
  const followedAudio = useRef(song);
  useEffect(() => {
    const previous = followedAudio.current;
    followedAudio.current = song;
    if (!isPlaying || previous === undefined || song === undefined) {
      return;
    }
    const change = audioTrackChange(previous, song);
    if (change === 'restart') {
      restart();
    } else if (change === 'live' && song.audioTrack !== undefined) {
      setAudioTrackMix(audioGain(song.audioTrack.volume), song.audioTrack.detuneCents).catch(() => undefined);
    }
  }, [song, isPlaying, restart]);

  // Bars added or deleted while playing move every bar index the timeline and the loop hold: stop rather than follow
  // (and later loop) the wrong bars.
  const measureCount = song?.measureHeaders.length ?? 0;
  const followedMeasureCount = useRef(measureCount);
  useEffect(() => {
    if (followedMeasureCount.current !== measureCount) {
      followedMeasureCount.current = measureCount;
      if (isPlaying) {
        stopPlayer(session);
      }
    }
  }, [measureCount, isPlaying, session]);

  useEffect(
    () => () => {
      cancelRestart(restartTimer);
      releasePlayer(session);
    },
    [session],
  );

  const audioNow = useCallback(() => audioSecondsNow(session), [session]);
  return { ...state, practice, start, stop, dismissError, changePractice, restart, audioSecondsNow: audioNow };
}
