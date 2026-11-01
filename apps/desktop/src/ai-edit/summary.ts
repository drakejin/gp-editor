import { type EasyTransposition, type FingeringAdoption, type FingeringCost, type Song, isFrettedInstrument, trackInstrumentOf } from '@gp-editor/core';
import { trackBarText, trackNotationOf } from '../compose/score-notation';
import { t } from '../lib/i18n/i18n';
import { transpositionHint } from '../state/transposition';
import type { AiEditRange } from './ai-edit-scope';

/** The notes in a track's bars `first` to `last`, and their highest fret (undefined for none, or a track without frets). */
function barNotes(song: Song, trackIndex: number, first: number, last: number): { readonly count: number; readonly highest?: number } {
  const measures = song.tracks[trackIndex]?.measures.slice(first, last + 1) ?? [];
  const notes = measures.flatMap((measure) => measure.beats.flatMap((beat) => beat.voices.flatMap((voice) => voice.notes)));
  const instrument = trackInstrumentOf(song, trackIndex);
  const isFretted = instrument !== undefined && isFrettedInstrument(instrument);
  return { count: notes.length, ...(isFretted && notes.length > 0 ? { highest: Math.max(...notes.map((note) => note.fret)) } : {}) };
}

/** The range's bars (and those added after it) where a track plays something else after the rewrite, as the score text writes them. */
export function changedBars(before: Song, after: Song, range: AiEditRange, barsAdded: number): number {
  const lastAfter = range.lastBar + barsAdded;
  const notations = range.trackIndexes.map((trackIndex) => [trackNotationOf(before, trackIndex), trackNotationOf(after, trackIndex)] as const);
  let changed = 0;
  for (let measureIndex = range.firstBar; measureIndex <= lastAfter; measureIndex++) {
    const isChanged = notations.some(([was, now]) => trackBarText(before, was, measureIndex) !== trackBarText(after, now, measureIndex));
    changed += isChanged ? 1 : 0;
  }
  return changed;
}

function highestText(before: readonly (number | undefined)[], after: readonly (number | undefined)[]): string {
  const top = (frets: readonly (number | undefined)[]) => frets.reduce<number | undefined>((most, fret) => (fret === undefined ? most : Math.max(most ?? fret, fret)), undefined);
  const [was, now] = [top(before), top(after)];
  return was === undefined || now === undefined ? '' : t('aiEdit.summary.highestFret', { before: was, after: now });
}

/** What an instruction changed: "Rewrote bars 3–10 · 6 bars changed · notes 48 → 36 · highest fret 12 → 7 · 2 bars added at the end". */
export function rewriteSummary(before: Song, after: Song, range: AiEditRange, barsAdded: number): string {
  const lastAfter = range.lastBar + barsAdded;
  const was = range.trackIndexes.map((trackIndex) => barNotes(before, trackIndex, range.firstBar, range.lastBar));
  const now = range.trackIndexes.map((trackIndex) => barNotes(after, trackIndex, range.firstBar, lastAfter));
  const sum = (notes: readonly { readonly count: number }[]) => notes.reduce((total, entry) => total + entry.count, 0);
  const rewrote = range.firstBar === range.lastBar ? t('aiEdit.summary.rewroteBar', { bar: range.firstBar + 1 }) : t('aiEdit.summary.rewrote', { first: range.firstBar + 1, last: range.lastBar + 1 });
  return [
    rewrote,
    t('aiEdit.summary.barsChanged', { count: changedBars(before, after, range, barsAdded) }),
    t('aiEdit.summary.notes', { before: sum(was), after: sum(now) }),
    highestText(was.map((entry) => entry.highest), now.map((entry) => entry.highest)),
    barsAdded > 0 ? t('aiEdit.summary.barsAdded', { bars: t('common.bars', { count: barsAdded }) }) : '',
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

/** "Fingering: 85 notes on other strings, the hand travelling 120 → 45 frets (cost 300.5 → 180.2)", or already the easiest. */
function fingeringText(easy: EasyTransposition, after: FingeringCost): string {
  const { before, restrung } = easy.refingering;
  return restrung === 0
    ? t('aiEdit.summary.fingeringKept')
    : t('aiEdit.summary.fingering', { count: restrung, before: before.handTravel, after: after.handTravel, costBefore: before.total, costAfter: after.total });
}

/**
 * What the preset changed: the transposition (when it moved anything), the optimizer's fingering with the cost the
 * score ends with (`after`), and Claude's part when it was asked.
 */
export function presetSummary(easy: EasyTransposition, semitones: number, after: FingeringCost, adoption?: FingeringAdoption, polishFailure?: string): string {
  const transposed = semitones === 0 ? '' : transpositionHint(easy.transposition, { mode: 'chromatic', amount: semitones });
  const claude = adoption === undefined ? [] : [t('aiEdit.summary.claude', { taken: adoption.taken, suggested: adoption.suggested }), adoption.rejected > 0 ? t('aiEdit.summary.rejected', { count: adoption.rejected }) : ''];
  const failed = polishFailure === undefined ? '' : t('aiEdit.summary.polishFailed', { reason: polishFailure });
  return [transposed, fingeringText(easy, after), ...claude, failed].filter((part) => part !== '').join(' · ');
}
