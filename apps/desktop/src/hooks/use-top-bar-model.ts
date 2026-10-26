import { useMemo } from 'react';
import type { TrackIconName } from '@gp-editor/core';
import type { PracticeToggle } from '../lib/key-commands';
import { type LcdInfo, lcdInfo } from '../lib/lcd';
import { tempoPercent } from '../lib/practice-tempo';
import { shownTrackIcon } from '../score/track-icons';
import { playbackStartTempo, typedTempoAction } from '../state/practice';
import { selectionBars } from '../state/selection';
import type { EditorCommands } from './use-editor-commands';
import { useStableCallback } from './use-stable-callback';
import type { WindowBase, WindowMedia } from './use-window';

/** What the top bar and its speed and practice menus show, and their handlers (the same from render to render). */
export interface TopBarModel {
  readonly lcd?: LcdInfo;
  /** The shown track's colour (the LCD's swatch). */
  readonly trackColor?: string;
  /** The shown track's icon, beside its colour (Guitar Pro 8's LCD). */
  readonly trackIcon?: TrackIconName;
  /** "100%" or "80%": the playback speed. */
  readonly speedLabel: string;
  /** The tempo of the bar playback starts from (playbackStartTempo). */
  readonly writtenTempo: number;
  readonly measureCount: number;
  readonly cursorMeasureIndex: number;
  /** The loop turned on loops the selected bars, or the whole song with nothing selected. */
  readonly toggleLoop: () => void;
  readonly setPlaybackTempo: (tempo: number) => void;
  readonly togglePractice: (practice: PracticeToggle) => void;
  readonly shiftSpeed: (delta: number) => void;
}

export function useTopBarModel({ state, t }: WindowBase, { playback }: WindowMedia, editor: EditorCommands): TopBarModel {
  const { cursor, trackIndex, selectionAnchor } = state;
  const song = state.document?.song;
  const lcd = useMemo(
    () => (song === undefined ? undefined : lcdInfo({ song, trackIndex, cursor, playing: playback.playing, practice: playback.practice, loopPass: playback.loopPass, t })),
    [song, trackIndex, cursor, playback.playing, playback.practice, playback.loopPass, t],
  );
  const track = song?.tracks[trackIndex];
  const trackIcon = useMemo(() => (song === undefined || song.tracks[trackIndex] === undefined ? undefined : shownTrackIcon(song, trackIndex)), [song, trackIndex]);
  const measureCount = song?.measureHeaders.length ?? 0;
  const cursorMeasureIndex = cursor?.measureIndex ?? 0;
  const writtenTempo = song === undefined ? 0 : playbackStartTempo(song, playback.practice, cursorMeasureIndex);
  const toggleLoop = useStableCallback(() => playback.changePractice({ type: 'toggleLoop', measureCount, selection: selectionBars({ cursor, selectionAnchor }) }));
  const setPlaybackTempo = useStableCallback((tempo: number) => playback.changePractice(typedTempoAction(playback.practice, tempo, writtenTempo)));
  const togglePractice = useStableCallback((practice: PracticeToggle) => editor.runCommand({ type: 'togglePractice', practice }));
  const shiftSpeed = useStableCallback((delta: number) => editor.runCommand({ type: 'shiftPlaybackSpeed', delta }));
  return {
    lcd,
    trackColor: track === undefined ? undefined : `rgb(${track.color.r},${track.color.g},${track.color.b})`,
    trackIcon,
    speedLabel: `${tempoPercent(playback.practice.tempoScale)}%`,
    writtenTempo,
    measureCount,
    cursorMeasureIndex,
    toggleLoop,
    setPlaybackTempo,
    togglePractice,
    shiftSpeed,
  };
}
