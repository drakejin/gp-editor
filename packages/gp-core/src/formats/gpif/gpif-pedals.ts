// GPIF sustain pedal automations (no TuxGuitar counterpart: TuxGuitar reads no pedal): a track's `<Automation>` of type
// SustainPedal, at a bar and a position in it (0–1), its value "0 1" pressing and "0 3" releasing the pedal.
import { comparePedalMarks, measureTicks } from '../../model/defaults';
import type { MeasureHeader, PedalAction, PedalMark } from '../../model/song';
import type { GpifAutomation } from './gpif-document';

export const SUSTAIN_PEDAL_TYPE = 'SustainPedal';
/** The second value of a SustainPedal automation: 1 presses the pedal, 3 releases it. */
export const PEDAL_REFERENCES: Readonly<Record<PedalAction, number>> = { down: 1, up: 3 };

function actionOf(automation: GpifAutomation): PedalAction | undefined {
  const reference = automation.value?.[1];
  if (reference === PEDAL_REFERENCES.down) {
    return 'down';
  }
  return reference === PEDAL_REFERENCES.up ? 'up' : undefined;
}

/** The track's SustainPedal automations with a known action, grouped by bar index. */
export function pedalAutomationsByBar(automations: readonly GpifAutomation[]): ReadonlyMap<number, readonly GpifAutomation[]> {
  const byBar = new Map<number, GpifAutomation[]>();
  for (const automation of automations) {
    if (automation.type === SUSTAIN_PEDAL_TYPE && actionOf(automation) !== undefined) {
      byBar.set(automation.barId, [...(byBar.get(automation.barId) ?? []), automation]);
    }
  }
  return byBar;
}

/** A bar's pedal marks: positions kept inside the bar, sorted; undefined when it has none. */
export function pedalMarksOf(automations: readonly GpifAutomation[] | undefined, header: MeasureHeader): readonly PedalMark[] | undefined {
  if (automations === undefined || automations.length === 0) {
    return undefined;
  }
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const marks = automations.flatMap((automation): PedalMark[] => {
    const action = actionOf(automation);
    const ratio = Number.isFinite(automation.position) ? Math.min(1, Math.max(0, automation.position)) : 0;
    return action === undefined ? [] : [{ offset: Math.round(ratio * length), action }];
  });
  return marks.sort(comparePedalMarks);
}
