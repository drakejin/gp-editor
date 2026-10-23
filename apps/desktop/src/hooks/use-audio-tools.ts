import { useEffect } from 'react';
import type { Song } from '@gp-editor/core';
import type { MixPreview } from '../lib/mix';
import { subscribeLineInRequests, subscribeMixerRequests } from '../native/audio-effects';
import type { PanelId } from '../state/panels';
import { type LineIn, useLineIn } from './use-line-in';
import { useMixSync } from './use-mix-sync';

export interface AudioTools {
  /** While an effect's slider is dragged: what to hear now; undefined when the drag ended unchanged. */
  readonly previewMix: (preview: MixPreview | undefined) => void;
  readonly lineIn: LineIn;
}

/**
 * The window's sound tools: the playback engine kept on the shown song's effects, View ▸ Mixer (toggles the mixer
 * panel) and Tools ▸ Line In… (opens its panel; the line in follows the selected track unless locked).
 */
export function useAudioTools(song: Song | undefined, trackIndex: number, togglePanel: (panel: PanelId) => void): AudioTools {
  const previewMix = useMixSync(song);
  const lineIn = useLineIn(trackIndex);
  const { open: openLineIn } = lineIn;
  useEffect(() => subscribeLineInRequests(openLineIn), [openLineIn]);
  useEffect(() => subscribeMixerRequests(() => togglePanel('mixer')), [togglePanel]);
  return { previewMix, lineIn };
}
