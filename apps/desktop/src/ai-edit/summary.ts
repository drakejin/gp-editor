import { type EasyTransposition, type FingeringAdoption, type FingeringCost, type PositionsNotTaken, type Song, isFrettedInstrument, trackInstrumentOf } from '@gp-editor/core';
import { trackBarText, trackNotationOf } from '../compose/score-notation';
import type { MessageKey } from '../lib/i18n/en';
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

/** The song written and what its fingering costs. */
export interface WrittenFingering {
  readonly song: Song;
  readonly cost: FingeringCost;
}

/** Each voice's notes as `pitch/string`, by `track:measure:beat:voice`. */
function notePlaces(song: Song): ReadonlyMap<string, readonly string[]> {
  const places = new Map<string, string[]>();
  song.tracks.forEach((track, trackIndex) =>
    track.measures.forEach((measure, m) =>
      measure.beats.forEach((beat, b) =>
        beat.voices.forEach((voice, v) => {
          places.set(`${trackIndex}:${m}:${b}:${v}`, voice.notes.map((note) => `${(track.strings[note.string - 1]?.tuning ?? 0) + note.fret}/${note.string}`));
        }),
      ),
    ),
  );
  return places;
}

/** Notes of `after` on another string than in `before` (the same notes, re-fingered). */
function restrungNotes(before: Song, after: Song): number {
  const was = notePlaces(before);
  let moved = 0;
  notePlaces(after).forEach((notes, key) => {
    const left = [...(was.get(key) ?? [])];
    notes.forEach((place) => {
      const at = left.indexOf(place);
      if (at >= 0) {
        left.splice(at, 1);
      } else {
        moved += 1;
      }
    });
  });
  return moved;
}

/** "Fingering: 85 notes on other strings, the hand travelling 120 → 45 frets (cost 300.5 → 180.2)", from the song written. */
function fingeringText(easy: EasyTransposition, written: WrittenFingering): string {
  const { before } = easy.refingering;
  const count = restrungNotes(easy.transposition.song, written.song);
  return count === 0
    ? t('aiEdit.summary.fingeringKept')
    : t('aiEdit.summary.fingering', { count, before: before.handTravel, after: written.cost.handTravel, costBefore: before.total, costAfter: written.cost.total });
}

const REASONS: readonly (readonly [keyof PositionsNotTaken, MessageKey])[] = [
  ['linked', 'aiEdit.reason.linked'],
  ['unplayable', 'aiEdit.reason.unplayable'],
  ['occupied', 'aiEdit.reason.occupied'],
  ['span', 'aiEdit.reason.span'],
  ['harder', 'aiEdit.reason.harder'],
];

/** "Claude: 3 of 5 suggested positions taken (not taken: 1 on a string another note holds, 1 harder …) · 2 notes rejected". */
function claudeText(adoption: FingeringAdoption): readonly string[] {
  const reasons = REASONS.filter(([reason]) => adoption.notTaken[reason] > 0).map(([reason, key]) => t(key, { count: adoption.notTaken[reason] }));
  const why = reasons.length === 0 ? '' : ` (${t('aiEdit.summary.notTakenWhy', { reasons: reasons.join(', ') })})`;
  return [`${t('aiEdit.summary.claude', { taken: adoption.taken, suggested: adoption.suggested })}${why}`, adoption.rejected > 0 ? t('aiEdit.summary.rejected', { count: adoption.rejected }) : ''];
}

/**
 * What the preset changed: the transposition (when it moved anything), the fingering as written — the notes on other
 * strings than the plain transposition put them, the hand's travel and cost from that to the song written —, and
 * Claude's part when it was asked.
 */
export function presetSummary(easy: EasyTransposition, semitones: number, written: WrittenFingering, adoption?: FingeringAdoption, polishFailure?: string): string {
  // The hint's sentences end in a full stop; the parts here are joined by " · ".
  const transposed = semitones === 0 ? '' : transpositionHint(easy.transposition, { mode: 'chromatic', amount: semitones }).replace(/\.$/, '');
  const claude = adoption === undefined ? [] : claudeText(adoption);
  const failed = polishFailure === undefined ? '' : t('aiEdit.summary.polishFailed', { reason: polishFailure });
  return [transposed, fingeringText(easy, written), ...claude, failed].filter((part) => part !== '').join(' · ');
}
