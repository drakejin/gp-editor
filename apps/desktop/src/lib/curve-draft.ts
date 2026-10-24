import {
  type Bend,
  type BendPoint,
  CURVE_VALUE_RANGES,
  type CurveEffect,
  addCurvePoint,
  curveFromPoints,
  moveCurvePoint,
  normalizeCurvePoints,
  removeCurvePoint,
} from '@gp-editor/core';
import { bendAmountLabel } from '../score/bend-graph';
import { t } from './i18n/i18n';

/** The bend or tremolo bar panel's curve while it is edited: Apply puts it on the note. */
export interface CurveDraft {
  readonly effect: CurveEffect;
  /** On the grid (positions 0…12, quarter tones), sorted, one per position. */
  readonly points: readonly BendPoint[];
  /** The point the readout and the step buttons act on. */
  readonly selectedIndex?: number;
}

/** Quarter tones in a tone. */
const QUARTERS_PER_TONE = 4;
const QUARTER_FRACTIONS = ['', '¼', '½', '¾'] as const;
/** The panel's positions run 0…12 across the note. */
const LAST_POSITION = 12;


export function draftFromCurve(effect: CurveEffect, curve: Bend | undefined): CurveDraft {
  return { effect, points: normalizeCurvePoints(curve?.points ?? [], CURVE_VALUE_RANGES[effect]) };
}

/** The draft as the note's curve; undefined (no effect) without points. */
export function draftCurve(draft: CurveDraft): Bend | undefined {
  return curveFromPoints(draft.points);
}

/** A preset (or none) in place of the points; nothing selected. */
export function loadDraftCurve(draft: CurveDraft, curve: Bend | undefined): CurveDraft {
  return draftFromCurve(draft.effect, curve);
}

/** The mouse went down on the grid: on a point (`hitIndex`) it selects it, elsewhere it adds a point there, selected. */
export function pressDraft(draft: CurveDraft, hitIndex: number | undefined, at: BendPoint): CurveDraft {
  if (hitIndex !== undefined) {
    return { ...draft, selectedIndex: hitIndex };
  }
  const range = CURVE_VALUE_RANGES[draft.effect];
  const added = normalizeCurvePoints([at], range)[0];
  if (added === undefined) {
    return draft;
  }
  const points = addCurvePoint(draft.points, added, range);
  return { ...draft, points, selectedIndex: points.findIndex((point) => point.position === added.position) };
}

/** A drag from `start` (the draft when the mouse went down): its selected point follows the pointer. */
export function dragDraft(start: CurveDraft, at: BendPoint): CurveDraft {
  if (start.selectedIndex === undefined) {
    return start;
  }
  const points = moveCurvePoint(start.points, start.selectedIndex, at, CURVE_VALUE_RANGES[start.effect]);
  return points === start.points ? start : { ...start, points };
}

/** The draft without the selected point (or the one at `index`); nothing selected after. */
export function removeDraftPoint(draft: CurveDraft, index = draft.selectedIndex): CurveDraft {
  return index === undefined ? draft : { effect: draft.effect, points: removeCurvePoint(draft.points, index) };
}

/** The selected point moved by whole positions and quarter tones (kept between its neighbours and in the range). */
export function stepDraftPoint(draft: CurveDraft, positionStep: number, valueStep: number): CurveDraft {
  const index = draft.selectedIndex;
  const point = index === undefined ? undefined : draft.points[index];
  if (index === undefined || point === undefined) {
    return draft;
  }
  return dragDraft(draft, { position: point.position + positionStep, value: point.value + valueStep });
}

/** Whether the draft holds the curve as it is (Apply would change nothing). */
export function isDraftOf(draft: CurveDraft, curve: Bend | undefined): boolean {
  const points = draftFromCurve(draft.effect, curve).points;
  return points.length === draft.points.length && points.every((point, i) => point.position === draft.points[i]?.position && point.value === draft.points[i]?.value);
}

export function isSameDraft(a: CurveDraft, b: CurveDraft): boolean {
  return a.effect === b.effect && a.selectedIndex === b.selectedIndex && isDraftOf(a, curveFromPoints(b.points));
}

/** A tremolo bar value in tones with its sign (−1½, +¼); a bend as Guitar Pro names its amount (½, full, 1½). */
export function curveValueLabel(effect: CurveEffect, quarterTones: number): string {
  if (quarterTones === 0) {
    return '0';
  }
  if (effect === 'bend') {
    return bendAmountLabel(quarterTones);
  }
  const size = Math.abs(quarterTones);
  const whole = Math.floor(size / QUARTERS_PER_TONE);
  const fraction = QUARTER_FRACTIONS[size % QUARTERS_PER_TONE] ?? '';
  return `${quarterTones < 0 ? '−' : '+'}${whole === 0 ? '' : whole}${fraction}`;
}

/** The selected point as the panel's readout says it, or how to edit the curve when no point is selected. */
export function describeDraftPoint(draft: CurveDraft): string {
  const index = draft.selectedIndex;
  const point = index === undefined ? undefined : draft.points[index];
  if (index === undefined || point === undefined) {
    return t('tools.notePanels.curveHint');
  }
  const isOverATone = Math.abs(point.value) > QUARTERS_PER_TONE;
  const value = curveValueLabel(draft.effect, point.value);
  const pitch = point.value === 0 ? t('tools.notePanels.atPitch') : t(isOverATone ? 'tools.notePanels.tones' : 'tools.notePanels.tone', { value });
  return t('tools.notePanels.point', { index: index + 1, count: draft.points.length, position: point.position, last: LAST_POSITION, pitch });
}
