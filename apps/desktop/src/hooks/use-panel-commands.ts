import { useCallback, useMemo } from 'react';
import type { Effect, MasterMix, Rgb, SongInfo } from '@gp-editor/core';
import type { ChordDisplay } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import { useStableCallback } from './use-stable-callback';
import type { WindowBase } from './use-window';

/** The tracks panel's and the bar map's edits. */
export interface TrackCommands {
  readonly onSelectTrack: (trackIndex: number) => void;
  /** A cell of the bar map: that track, the cursor at the bar's first beat. */
  readonly onSelectBar: (trackIndex: number, measureIndex: number) => void;
  readonly onSetTrackMute: (trackIndex: number, isMute: boolean) => void;
  readonly onSetTrackSolo: (trackIndex: number, isSolo: boolean) => void;
  readonly onSetTrackVolume: (trackIndex: number, volume: number) => void;
  readonly onSetTrackBalance: (trackIndex: number, balance: number) => void;
}

/** The inspector's edits. */
export interface InspectorCommands {
  readonly onChangeMode: (mode: ScoreMode) => void;
  readonly onChangeChordDisplay: (display: ChordDisplay) => void;
  readonly onSetSongInfo: (info: Partial<SongInfo>) => void;
  readonly onSetTrackName: (trackIndex: number, name: string) => void;
  /** Guitar Pro 8's track information: short name, colour, icon (undefined: the instrument's). */
  readonly onSetTrackShortName: (trackIndex: number, shortName: string) => void;
  readonly onSetTrackColor: (trackIndex: number, color: Rgb) => void;
  readonly onSetTrackIcon: (trackIndex: number, iconId: number | undefined) => void;
  readonly onSetTrackCapo: (trackIndex: number, capo: number) => void;
  readonly onSetTrackSlashNotation: (trackIndex: number, hasSlashNotation: boolean) => void;
  readonly onSetTrackTuning: (trackIndex: number, tuning: readonly number[]) => void;
  readonly onDismissNotice: () => void;
}

/** The mixer's and the Track inspector's effect edits. */
export interface EffectCommands {
  readonly onSetTrackEffects: (trackIndex: number, effects: readonly Effect[]) => void;
  readonly onSetMasterMix: (master: MasterMix) => void;
}

/**
 * The panels' edits, each the same function from render to render: the memoised panels are not redrawn by a cursor
 * move or a playing beat.
 */
export interface PanelCommands {
  readonly track: TrackCommands;
  readonly inspector: InspectorCommands;
  readonly effects: EffectCommands;
  readonly dismissHint: () => void;
}

function useTrackCommands({ dispatch, state }: WindowBase): TrackCommands {
  const cursorString = state.cursor?.string ?? 1;
  // On the cursor's string, read when the cell is clicked.
  const onSelectBar = useStableCallback((trackIndex: number, measureIndex: number) => {
    dispatch({ type: 'selectTrack', trackIndex });
    dispatch({ type: 'placeCursor', cursor: { trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: cursorString } });
  });
  return useMemo(
    () => ({
      onSelectTrack: (trackIndex: number) => dispatch({ type: 'selectTrack', trackIndex }),
      onSelectBar,
      onSetTrackMute: (trackIndex: number, isMute: boolean) => dispatch({ type: 'setTrackMute', trackIndex, isMute }),
      onSetTrackSolo: (trackIndex: number, isSolo: boolean) => dispatch({ type: 'setTrackSolo', trackIndex, isSolo }),
      onSetTrackVolume: (trackIndex: number, volume: number) => dispatch({ type: 'setTrackVolume', trackIndex, volume }),
      onSetTrackBalance: (trackIndex: number, balance: number) => dispatch({ type: 'setTrackBalance', trackIndex, balance }),
    }),
    [dispatch, onSelectBar],
  );
}

function useInspectorCommands({ dispatch }: WindowBase): InspectorCommands {
  return useMemo(
    () => ({
      onChangeMode: (mode: ScoreMode) => dispatch({ type: 'setMode', mode }),
      onChangeChordDisplay: (display: ChordDisplay) => dispatch({ type: 'setChordDisplay', display }),
      onSetSongInfo: (info: Partial<SongInfo>) => dispatch({ type: 'setSongInfo', info }),
      onSetTrackName: (trackIndex: number, name: string) => dispatch({ type: 'setTrackName', trackIndex, name }),
      onSetTrackShortName: (trackIndex: number, shortName: string) => dispatch({ type: 'setTrackShortName', trackIndex, shortName }),
      onSetTrackColor: (trackIndex: number, color: Rgb) => dispatch({ type: 'setTrackColor', trackIndex, color }),
      onSetTrackIcon: (trackIndex: number, iconId: number | undefined) => dispatch({ type: 'setTrackIcon', trackIndex, iconId }),
      onSetTrackCapo: (trackIndex: number, capo: number) => dispatch({ type: 'setTrackCapo', trackIndex, capo }),
      onSetTrackSlashNotation: (trackIndex: number, hasSlashNotation: boolean) => dispatch({ type: 'setTrackSlashNotation', trackIndex, hasSlashNotation }),
      onSetTrackTuning: (trackIndex: number, tuning: readonly number[]) => dispatch({ type: 'setTrackTuning', trackIndex, tuning }),
      onDismissNotice: () => dispatch({ type: 'dismissNotice' }),
    }),
    [dispatch],
  );
}

export function usePanelCommands(base: WindowBase): PanelCommands {
  const { dispatch } = base;
  const track = useTrackCommands(base);
  const inspector = useInspectorCommands(base);
  const effects = useMemo(
    () => ({
      onSetTrackEffects: (trackIndex: number, chain: readonly Effect[]) => dispatch({ type: 'setTrackEffects', trackIndex, effects: chain }),
      onSetMasterMix: (master: MasterMix) => dispatch({ type: 'setMasterMix', master }),
    }),
    [dispatch],
  );
  const dismissHint = useCallback(() => dispatch({ type: 'dismissHint' }), [dispatch]);
  return { track, inspector, effects, dismissHint };
}
