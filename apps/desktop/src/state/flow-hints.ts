import type { BarFlow } from '@gp-editor/core';
import { type MessageKey, t } from '../lib/i18n/i18n';

/**
 * The hint strip's words for what a beat edit moved across bar lines (gp-core's BarFlow): how many notes went on into the
 * next bar or came back from it, how far the voice moved, the bars added at the end, and a tuplet that stopped it.
 * Guitar Pro 8 has no such ripple (it marks the bar red), so the hint says what moved.
 */

/** The moved sentence's key: later or earlier, notes or only rests, the next bar alone or further. */
function movedKey(flow: BarFlow, isThrough: boolean): MessageKey {
  const hasNotes = flow.movedNotes > 0;
  if (flow.direction === 'later') {
    if (hasNotes) {
      return isThrough ? 'palette.hint.flowedOnThrough' : 'palette.hint.flowedOn';
    }
    return isThrough ? 'palette.hint.flowedOnRestsThrough' : 'palette.hint.flowedOnRests';
  }
  if (hasNotes) {
    return isThrough ? 'palette.hint.pulledBackThrough' : 'palette.hint.pulledBack';
  }
  return isThrough ? 'palette.hint.pulledBackRestsThrough' : 'palette.hint.pulledBackRests';
}

/** Whether anything crossed the edited bar's line (a tuplet can stop the ripple at that very line). */
function hasMoved(flow: BarFlow, measureIndex: number): boolean {
  return flow.lastMeasureIndex > measureIndex;
}

/** The sentence for a tuplet that stopped the ripple; none when nothing did. */
function keptSentence(flow: BarFlow): readonly string[] {
  if (flow.keptMeasureIndex === undefined) {
    return [];
  }
  const key: MessageKey = flow.direction === 'later' ? 'palette.hint.tupletStaysLong' : 'palette.hint.tupletNotPulled';
  return [t(key, { bar: flow.keptMeasureIndex + 1 })];
}

/** The hint for a beat edit at bar `measureIndex` (0-based) that moved music across bar lines; undefined without a flow. */
export function barFlowHint(flow: BarFlow | undefined, measureIndex: number): string | undefined {
  if (flow === undefined) {
    return undefined;
  }
  const nextBar = measureIndex + 2;
  const isThrough = flow.lastMeasureIndex > measureIndex + 1;
  const moved = hasMoved(flow, measureIndex) ? [t(movedKey(flow, isThrough), { count: flow.movedNotes, bar: nextBar, last: flow.lastMeasureIndex + 1 })] : [];
  const added = flow.addedBars > 0 ? [t('palette.hint.flowAddedBars', { count: flow.addedBars })] : [];
  const sentences = [...moved, ...added, ...keptSentence(flow)];
  return sentences.length === 0 ? undefined : sentences.join(' ');
}
