import { memo, useMemo } from 'react';
import type { TrackIconName } from '@gp-editor/core';
import { ScoreCanvas } from '../native/score-canvas';
import { scaleCommands } from '../score/draw';
import { TRACK_ICON_SIZE, engraveTrackIcon } from '../score/track-icons';

export interface TrackIconProps {
  readonly icon: TrackIconName;
  readonly color: string;
  /** Points square; TRACK_ICON_SIZE by default. */
  readonly size?: number;
}

/** A track's Guitar Pro icon on the native canvas, at any size. */
function TrackIconView({ icon, color, size = TRACK_ICON_SIZE }: TrackIconProps) {
  const commands = useMemo(() => {
    const drawn = engraveTrackIcon(icon, color);
    return size === TRACK_ICON_SIZE ? drawn : scaleCommands(drawn, size / TRACK_ICON_SIZE);
  }, [icon, color, size]);
  return <ScoreCanvas commands={commands} style={{ width: size, height: size }} />;
}

export const TrackIcon = memo(TrackIconView);
