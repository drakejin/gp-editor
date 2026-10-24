import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AudioTrackMix,
  type SecondsRange,
  type Song,
  type StringAddress,
  buildAudioTrack,
  buildSyncMap,
  syncPointSecondsRange,
} from '@gp-editor/core';
import { type AudioPeaks, newAudioTrackFields, parseAudioPeaks, syncPointAt } from '../lib/audio-track';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { audioPeaks, chooseAudioFile, isAudioLoaded, subscribeAddAudioTrackRequests } from '../native/audio-track';
import { AUDIO_LANE } from '../score/audio-lane';
import type { EditorAction } from '../state/editor';

/** What the audio track's lane shows and does. */
export interface AudioTrackLaneCommands {
  readonly peaks?: AudioPeaks;
  /** Why there is no waveform (the file could not be loaded). */
  readonly error?: string;
  readonly durationSeconds: number;
  readonly pixelsPerSecond: number;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly selectedPointIndex?: number;
  readonly selectPoint: (pointIndex: number | undefined) => void;
  readonly setMix: (mix: AudioTrackMix) => void;
  readonly movePoint: (pointIndex: number, seconds: number) => void;
  readonly deleteSelectedPoint: () => void;
  /** Y: while the audio plays, the cursor's bar starts at the moment heard now; the cursor moves on to the next bar. */
  readonly markSyncPoint: () => void;
  readonly tempoFromAudio: () => void;
  /** Track ▸ Add Audio Track… (asks first when it replaces one). */
  readonly addAudioTrack: () => void;
  readonly removeAudioTrack: () => void;
  readonly pointRange: (pointIndex: number) => SecondsRange | undefined;
}

export interface AudioTrackSources {
  readonly song: Song | undefined;
  readonly cursor: StringAddress | undefined;
  readonly dispatch: Dispatch<EditorAction>;
  /** The moment of the audio heard now (usePlayback); undefined when it does not play. */
  readonly audioSecondsNow: () => Promise<number | undefined>;
}


/** Waveforms fetched in this run, by asset id (each is computed once natively, and small). */
const peaksCache = new Map<string, AudioPeaks>();

/** The waveform of the audio track's file, fetched once per file. */
function usePeaks(assetId: string | undefined): { readonly peaks?: AudioPeaks; readonly error?: string } {
  const [state, setState] = useState<{ readonly assetId?: string; readonly peaks?: AudioPeaks; readonly error?: string }>({});
  useEffect(() => {
    if (assetId === undefined || !isAudioLoaded(assetId)) {
      setState({ assetId, error: assetId === undefined ? undefined : t('tools.audioTrack.notLoaded') });
      return;
    }
    const cached = peaksCache.get(assetId);
    if (cached !== undefined) {
      setState({ assetId, peaks: cached });
      return;
    }
    let isCurrent = true;
    audioPeaks(assetId)
      .then((raw) => {
        const parsed = parseAudioPeaks(raw);
        if (parsed !== undefined) {
          peaksCache.set(assetId, parsed);
        }
        if (isCurrent) {
          setState(parsed === undefined ? { assetId, error: t('tools.audioTrack.waveformFailed') } : { assetId, peaks: parsed });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({ assetId, error: errorMessage(error, t('tools.audioTrack.notLoaded')) });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [assetId]);
  return state.assetId === assetId ? state : {};
}

/** The lane's zoom: an index into AUDIO_LANE.zooms. */
function useZoom() {
  const [zoomIndex, setZoomIndex] = useState<number>(AUDIO_LANE.defaultZoomIndex);
  return useMemo(
    () => ({
      pixelsPerSecond: AUDIO_LANE.zooms[zoomIndex] ?? AUDIO_LANE.zooms[AUDIO_LANE.defaultZoomIndex],
      canZoomIn: zoomIndex < AUDIO_LANE.zooms.length - 1,
      canZoomOut: zoomIndex > 0,
      zoomIn: () => setZoomIndex((index) => Math.min(AUDIO_LANE.zooms.length - 1, index + 1)),
      zoomOut: () => setZoomIndex((index) => Math.max(0, index - 1)),
    }),
    [zoomIndex],
  );
}

/** Track ▸ Add Audio Track…: the picked file becomes the song's audio track (one undo step). */
function useAddAudioTrack(latest: { readonly current: Song | undefined }, dispatch: Dispatch<EditorAction>): () => void {
  const addAudioTrack = useCallback(() => {
    const song = latest.current;
    if (song === undefined) {
      return;
    }
    chooseAudioFile(song.audioTrack !== undefined)
      .then((file) => {
        if (file !== null) {
          dispatch({ type: 'setAudioTrack', audioTrack: buildAudioTrack(newAudioTrackFields(file)) });
        }
      })
      .catch((error: unknown) => dispatch({ type: 'showHint', hint: t('tools.audioTrack.addFailed', { detail: errorMessage(error, t('tools.audioTrack.unknownError')) }) }));
  }, [latest, dispatch]);
  useEffect(() => subscribeAddAudioTrackRequests(addAudioTrack), [addAudioTrack]);
  return addAudioTrack;
}

/** "This bar starts now" (Y): the sync point, then the cursor on the next bar for the next tap. */
function useMarkSyncPoint(sources: AudioTrackSources, latest: { readonly current: Song | undefined }): () => void {
  const { cursor, dispatch, audioSecondsNow } = sources;
  return useCallback(() => {
    if (latest.current?.audioTrack === undefined) {
      dispatch({ type: 'showHint', hint: t('tools.audioTrack.noAudioTrack') });
      return;
    }
    audioSecondsNow()
      .then((seconds) => {
        const song = latest.current;
        if (seconds === undefined || song === undefined) {
          dispatch({ type: 'showHint', hint: t('tools.audioTrack.markSyncHint') });
          return;
        }
        const measureIndex = cursor?.measureIndex ?? 0;
        dispatch({ type: 'setAudioSyncPoint', point: syncPointAt(buildSyncMap(song), measureIndex, seconds) });
        if (cursor !== undefined && measureIndex + 1 < song.measureHeaders.length) {
          dispatch({ type: 'placeCursor', cursor: { ...cursor, measureIndex: measureIndex + 1, beatIndex: 0 } });
        }
      })
      .catch(() => dispatch({ type: 'showHint', hint: t('tools.audioTrack.markSyncHint') }));
  }, [latest, cursor, dispatch, audioSecondsNow]);
}

/** The audio track's lane: its waveform, zoom, selected sync point, and the edits of its controls. */
export function useAudioTrack(sources: AudioTrackSources): AudioTrackLaneCommands {
  const { song, dispatch } = sources;
  const latest = useRef(song);
  latest.current = song;
  const track = song?.audioTrack;
  const { peaks, error } = usePeaks(track?.assetId);
  const zoom = useZoom();
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const selectedPointIndex = selected !== undefined && track?.syncPoints[selected] !== undefined ? selected : undefined;
  const addAudioTrack = useAddAudioTrack(latest, dispatch);
  const markSyncPoint = useMarkSyncPoint(sources, latest);
  const commands = useMemo(
    () => ({
      setMix: (mix: AudioTrackMix) => dispatch({ type: 'setAudioTrackMix', mix }),
      movePoint: (pointIndex: number, seconds: number) => dispatch({ type: 'moveAudioSyncPoint', pointIndex, seconds }),
      tempoFromAudio: () => dispatch({ type: 'setTempoFromAudio' }),
      removeAudioTrack: () => dispatch({ type: 'setAudioTrack', audioTrack: undefined }),
      pointRange: (pointIndex: number) => (latest.current === undefined ? undefined : syncPointSecondsRange(latest.current, pointIndex)),
    }),
    [dispatch],
  );
  const deleteSelectedPoint = useCallback(() => {
    if (selectedPointIndex !== undefined) {
      dispatch({ type: 'deleteAudioSyncPoint', pointIndex: selectedPointIndex });
      setSelected(undefined);
    }
  }, [dispatch, selectedPointIndex]);
  return useMemo(
    () => ({
      ...commands,
      ...zoom,
      peaks,
      error,
      durationSeconds: peaks?.durationSeconds ?? 0,
      selectedPointIndex,
      selectPoint: setSelected,
      deleteSelectedPoint,
      markSyncPoint,
      addAudioTrack,
    }),
    [commands, zoom, peaks, error, selectedPointIndex, deleteSelectedPoint, markSyncPoint, addAudioTrack],
  );
}
