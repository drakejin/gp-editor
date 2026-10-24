import { useMemo, useRef } from 'react';
import { type Song, stylesheetOf } from '@gp-editor/core';
import type { ChordDisplay } from '../score/chords';
import { type MeasureCache, type PlanCache, type ScoreLayout, type StaffSpec, scoreMeasures, scoreSystems, stackStaves, staffPlans } from '../score/score-layout';

/** `value` while `key` stays the same: the rows compare geometries by identity, so an edit keeping them redraws nothing. */
function useStable<T>(value: T, key: string): T {
  const kept = useRef<{ readonly key: string; readonly value: T } | undefined>(undefined);
  if (kept.current === undefined || kept.current.key !== key) {
    kept.current = { key, value };
  }
  return kept.current.value;
}

/**
 * The score's layout (`layoutScore`) for the view, recomputed in parts: the staves' geometries only when their bands
 * change (not on every edit), the bars an edit touched (the others kept from the last layout), the systems when the
 * bars or the width change.
 */
export function useScoreLayout(song: Song, specs: readonly StaffSpec[], chordDisplay: ChordDisplay, rowWidth: number): ScoreLayout {
  const shown = useStable(specs, specs.map((spec) => `${spec.trackIndex}:${spec.mode}`).join(','));
  // The bands of the tracks an edit left alone are kept: scanning every track on each keystroke is what costs.
  const planCache = useRef<PlanCache | undefined>(undefined);
  const plans = useMemo(() => {
    const made = staffPlans(song, shown, chordDisplay, planCache.current);
    planCache.current = { song, chordDisplay, plans: made };
    return made;
  }, [song, shown, chordDisplay]);
  const { systemSpacing } = stylesheetOf(song).systems;
  const stacked = useMemo(() => stackStaves(plans, systemSpacing), [plans, systemSpacing]);
  const staves = useStable(stacked, JSON.stringify([systemSpacing, plans.map(({ trackIndex, mode, stringCount, bands, markLanes }) => [trackIndex, mode, stringCount, bands, markLanes])]));
  const cache = useRef<MeasureCache | undefined>(undefined);
  const measures = useMemo(() => {
    const trackIndexes = shown.map((spec) => spec.trackIndex);
    const laidOut = scoreMeasures(song, trackIndexes, chordDisplay, cache.current);
    cache.current = { song, trackIndexes, chordDisplay, measures: laidOut };
    return laidOut;
  }, [song, shown, chordDisplay]);
  const systems = useMemo(() => scoreSystems(song, staves, measures, rowWidth), [song, staves, measures, rowWidth]);
  return useMemo(() => ({ staves, systemHeight: staves.reduce((sum, staff) => sum + staff.height, 0), ...systems }), [staves, systems]);
}
