import type { ComposeOutcome } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';

/**
 * What Compose from Here wrote, in the shown language: "Composed 8 bars from bar 17 · 3 bars added at the end · new:
 * Drums · 143 notes". `startIndex` is where it was written (0-based, within the score it was written into).
 */
export function composeSummary(
  outcome: ComposeOutcome,
  startIndex: number,
): string {
  const added = outcome.song.tracks
    .slice(outcome.song.tracks.length - outcome.tracksAdded)
    .map(track => track.name);
  return [
    t('tools.compose.summary', {
      bars: t('common.bars', { count: outcome.barsWritten }),
      start: startIndex + 1,
    }),
    outcome.barsAdded > 0
      ? t('tools.compose.barsAdded', {
          bars: t('common.bars', { count: outcome.barsAdded }),
        })
      : '',
    outcome.tracksAdded > 0
      ? t('tools.compose.tracksAdded', { names: added.join(', ') })
      : '',
    t('common.notes', { count: outcome.notes }),
    outcome.warnings.length > 0
      ? t('tools.compose.warnings', { count: outcome.warnings.length })
      : '',
  ]
    .filter(part => part !== '')
    .join(' · ');
}
