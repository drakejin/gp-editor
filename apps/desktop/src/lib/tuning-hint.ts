import { NECK_FRETS, type PresetFit, type Track, type TuningAdvice, type TuningChange, type TuningPreset, trackTuning } from '@gp-editor/core';
import { pitchName, tuningLabel } from './pitch';

/** Suggested presets the hint offers as buttons. */
export const HINT_SUGGESTIONS = 3;

const INSTRUMENT_TITLES: Readonly<Record<TuningAdvice['instrument'], string>> = { guitar: 'Guitar', bass: 'Bass', percussion: 'Drums' };

/** Why the neck settings need the user, and the presets offered as one-click buttons. */
export interface TuningHint {
  readonly message: string;
  /** Text before the buttons: "Suggested:" or the closest preset when none plays every note. */
  readonly lead: string;
  readonly presets: readonly TuningPreset[];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** "Guitar · 6 strings · Drop D (D A D G B E)"; a custom tuning shows only its notes; a capo is added. */
export function neckTitle(advice: TuningAdvice, track: Track): string {
  const notes = tuningLabel(trackTuning(track));
  return [
    INSTRUMENT_TITLES[advice.instrument],
    plural(track.strings.length, 'string'),
    advice.current === undefined ? notes : `${advice.current.name} (${notes})`,
    ...(track.offset > 0 ? [`capo ${track.offset}`] : []),
  ].join(' · ');
}

/** Why standard tuning cannot play the track: a note below its lowest string, past its last fret, or a crowded chord. */
function standardProblem(advice: TuningAdvice, standard: TuningPreset, track: Track): string {
  const range = advice.pitchRange;
  const lowestOpen = Math.min(...standard.tuning) + track.offset;
  const highestNote = Math.max(...standard.tuning) + NECK_FRETS;
  const reason =
    range !== undefined && range.lowest < lowestOpen
      ? `lowest note ${pitchName(range.lowest)}`
      : range !== undefined && range.highest > highestNote
      ? `highest note ${pitchName(range.highest)}`
      : 'some notes need the same string at once';
  return `Standard ${advice.instrument} tuning can't play this track (${reason}).`;
}

function trackProblem(advice: TuningAdvice, track: Track, standard: PresetFit): string {
  if (standard.unplayableNotes > 0) {
    return standardProblem(advice, standard.preset, track);
  }
  if (advice.current !== undefined) {
    return `${advice.current.name} can't play every note of this track on a ${NECK_FRETS}-fret neck.`;
  }
  const stringCount = standard.preset.tuning.length;
  return track.strings.length === stringCount
    ? `This tuning (${tuningLabel(trackTuning(track))}) isn't a ${advice.instrument} preset.`
    : `This track has ${track.strings.length} strings; the ${advice.instrument} neck has ${stringCount}.`;
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
    return { message, lead: 'Suggested:', presets: advice.suggested.slice(0, HINT_SUGGESTIONS) };
  }
  const closest = advice.closest ?? standard;
  if (closest.preset.id === advice.current?.id) {
    return { message, lead: `No preset plays every note within ${NECK_FRETS} frets.`, presets: [] };
  }
  const lead = `No preset plays every note; the closest leaves ${plural(closest.unplayableNotes, 'note')} out of reach:`;
  return { message, lead, presets: [closest.preset] };
}

/** What a retune could not keep, for the notice under the neck settings; undefined when every note kept its pitch. */
export function retuneNotice(change: Pick<TuningChange, 'octaveShifted' | 'removed'>): string | undefined {
  const parts = [
    ...(change.octaveShifted > 0 ? [`${plural(change.octaveShifted, 'note')} moved by an octave to fit the new tuning`] : []),
    ...(change.removed > 0 ? [`${plural(change.removed, 'note')} left out (more notes at once than strings)`] : []),
  ];
  return parts.length === 0 ? undefined : `Retuned: ${parts.join('; ')}. ⌘Z restores the old tuning.`;
}
