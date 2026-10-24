import {
  type AudioSyncPoint,
  type AudioTrack,
  type AudioTrackMix,
  QUARTER_TIME,
  type Song,
  buildSyncMap,
  canSetAudioSyncPoint,
  deleteAudioSyncPoint,
  moveAudioSyncPoint,
  setAudioSyncPoint,
  setAudioTrack,
  setAudioTrackMix,
  setTempo,
} from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';

/** Edits of the song's audio track (Track ▸ Add Audio Track…, its lane and its mixer strip); each is one undo step. */
export type AudioTrackAction =
  /** Adds, replaces (its sync points go: they belonged to the other recording) or removes (`undefined`) it. */
  | { readonly type: 'setAudioTrack'; readonly audioTrack: AudioTrack | undefined }
  | { readonly type: 'setAudioTrackMix'; readonly mix: AudioTrackMix }
  /** "This bar starts at this moment of the audio": adds a sync point, or moves the one at that place of the score. */
  | { readonly type: 'setAudioSyncPoint'; readonly point: AudioSyncPoint }
  | { readonly type: 'deleteAudioSyncPoint'; readonly pointIndex: number }
  /** A marker dragged on the waveform: the point at another moment of the audio. */
  | { readonly type: 'moveAudioSyncPoint'; readonly pointIndex: number; readonly seconds: number }
  /** The song's tempo from the first two sync points (the bar of the first and the bars with its tempo after it). */
  | { readonly type: 'setTempoFromAudio' };

export interface AudioTrackEditResult {
  readonly song: Song;
  /** Why nothing changed, or what changed, for the hint strip. */
  readonly hint?: string;
}

export function syncOrderHint(): string {
  return t('palette.hint.syncOrder');
}

export function twoSyncPointsHint(): string {
  return t('palette.hint.twoSyncPoints');
}
const SECONDS_PER_MINUTE = 60;
/** The written tempos the song takes (as setTempo clamps them). */
const TEMPO_DECIMALS = 100;

/** The written tempo that plays the recording's pace between the first two sync points. */
function tempoFromAudio(song: Song): AudioTrackEditResult {
  const map = buildSyncMap(song);
  const [first, second] = map.anchors;
  const point = first === undefined ? undefined : song.audioTrack?.syncPoints[first.pointIndex];
  if (first === undefined || second === undefined || point === undefined) {
    return { song, hint: twoSyncPointsHint() };
  }
  const tempo = Math.round(((second.tick - first.tick) / QUARTER_TIME) * (SECONDS_PER_MINUTE / (second.seconds - first.seconds)) * TEMPO_DECIMALS) / TEMPO_DECIMALS;
  const next = setTempo(song, point.measureIndex, tempo);
  return { song: next, hint: t('palette.hint.tempoFromAudio', { bar: point.measureIndex + 1, tempo }) };
}

/** The point at a new place, or the hint saying why it cannot go there. */
function withSyncPoint(song: Song, point: AudioSyncPoint): AudioTrackEditResult {
  return canSetAudioSyncPoint(song, point) ? { song: setAudioSyncPoint(song, point) } : { song, hint: syncOrderHint() };
}

/** The song after an audio track action, and the hint it leaves. */
export function applyAudioTrackAction(song: Song, action: AudioTrackAction): AudioTrackEditResult {
  switch (action.type) {
    case 'setAudioTrack':
      return { song: setAudioTrack(song, action.audioTrack) };
    case 'setAudioTrackMix':
      return { song: setAudioTrackMix(song, action.mix) };
    case 'setAudioSyncPoint':
      return withSyncPoint(song, action.point);
    case 'deleteAudioSyncPoint':
      return { song: deleteAudioSyncPoint(song, action.pointIndex) };
    case 'moveAudioSyncPoint': {
      const moved = moveAudioSyncPoint(song, action.pointIndex, action.seconds);
      return moved === song && song.audioTrack?.syncPoints[action.pointIndex]?.seconds !== action.seconds ? { song, hint: syncOrderHint() } : { song: moved };
    }
    case 'setTempoFromAudio':
      return tempoFromAudio(song);
  }
}
