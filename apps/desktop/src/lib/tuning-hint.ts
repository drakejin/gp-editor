import { NECK_FRETS, type PresetFit, type Track, type TuningAdvice, type TuningChange, type TuningPreset, trackTuning } from '@gp-editor/core';
import { t } from './i18n/i18n';
import { tuningName } from './instruments';
import { pitchName, tuningLabel } from './pitch';

/** Suggested presets the hint offers as buttons. */
export const HINT_SUGGESTIONS = 3;


/** Why the neck settings need the user, and the presets offered as one-click buttons. */
export interface TuningHint {
  readonly message: string;
  /** Text before the buttons: "Suggested:" or the closest preset when none plays every note. */
  readonly lead: string;
  readonly presets: readonly TuningPreset[];
}


/** "Guitar · 6 strings · Drop D (D A D G B E)"; a custom tuning shows only its notes; a capo is added. */
export function neckTitle(advice: TuningAdvice, track: Track): string {
  return neckTitleFor(advice.instrument, advice.current, track);
}

/** neckTitle from the track's instrument and the preset it is tuned to (undefined: a custom tuning). */
export function neckTitleFor(instrument: TuningAdvice['instrument'], current: TuningPreset | undefined, track: Track): string {
  const notes = tuningLabel(trackTuning(track));
  return [
    t(`tools.tuning.instrument.${instrument}`),
    t('common.strings', { count: track.strings.length }),
    current === undefined ? notes : `${tuningName(current)} (${notes})`,
    ...(track.offset > 0 ? [t('tools.tuning.capo', { fret: track.offset })] : []),
  ].join(' · ');
}

/** Why standard tuning cannot play the track: a note below its lowest string, past its last fret, or a crowded chord. */
function standardProblem(advice: TuningAdvice, standard: TuningPreset, track: Track): string {
  const range = advice.pitchRange;
  const lowestOpen = Math.min(...standard.tuning) + track.offset;
  const highestNote = Math.max(...standard.tuning) + NECK_FRETS;
  const reason =
    range !== undefined && range.lowest < lowestOpen
      ? t('tools.tuning.lowestNote', { name: pitchName(range.lowest) })
      : range !== undefined && range.highest > highestNote
      ? t('tools.tuning.highestNote', { name: pitchName(range.highest) })
      : t('tools.tuning.sameString');
  return t('tools.tuning.standardCannot', { instrument: t(`tools.tuning.inSentence.${advice.instrument}`), reason });
}

function trackProblem(advice: TuningAdvice, track: Track, standard: PresetFit): string {
  if (standard.unplayableNotes > 0) {
    return standardProblem(advice, standard.preset, track);
  }
  if (advice.current !== undefined) {
    return t('tools.tuning.presetCannot', { name: tuningName(advice.current), frets: NECK_FRETS });
  }
  const stringCount = standard.preset.tuning.length;
  const instrument = t(`tools.tuning.inSentence.${advice.instrument}`);
  return track.strings.length === stringCount
    ? t('tools.tuning.notPreset', { notes: tuningLabel(trackTuning(track)), instrument })
    : t('tools.tuning.stringCount', { count: track.strings.length, instrument, expected: stringCount });
}

/**
 * What the neck settings say when a pitched track is not on a preset of its instrument that plays every note: the
 * problem, then the best suggestions (or the closest preset when none fits). Undefined when nothing needs doing.
 */
export function tuningHint(advice: TuningAdvice, track: Track): TuningHint | undefined {
  const standard = advice.presets[0];
  if (!advice.needsTuning || standard === undefined) {
    return undefined;
  }
  const message = trackProblem(advice, track, standard);
  if (advice.suggested.length > 0) {
    return { message, lead: t('tools.tuning.suggested'), presets: advice.suggested.slice(0, HINT_SUGGESTIONS) };
  }
  const closest = advice.closest ?? standard;
  if (closest.preset.id === advice.current?.id) {
    return { message, lead: t('tools.tuning.noneWithin', { frets: NECK_FRETS }), presets: [] };
  }
  const lead = t('tools.tuning.closest', { notes: t('common.notes', { count: closest.unplayableNotes }) });
  return { message, lead, presets: [closest.preset] };
}

/** What a retune could not keep, for the notice under the neck settings; undefined when every note kept its pitch. */
export function retuneNotice(change: Pick<TuningChange, 'octaveShifted' | 'removed'>): string | undefined {
  const parts = [
    ...(change.octaveShifted > 0 ? [t('tools.tuning.octaveMoved', { notes: t('common.notes', { count: change.octaveShifted }) })] : []),
    ...(change.removed > 0 ? [t('tools.tuning.leftOut', { notes: t('common.notes', { count: change.removed }) })] : []),
  ];
  return parts.length === 0 ? undefined : t('tools.tuning.retuned', { parts: parts.join('; ') });
}
