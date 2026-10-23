// Rasgueado in playback (not in TuxGuitar, which has no rasgueado). An approximation of Guitar Pro's: each finger of the
// pattern strums the beat's strings once, as a quick down stroke from the lowest string, the strokes spread over the
// beat (over a quarter note at most, the last one ringing to the beat's end) evenly or, for an anapaest, short, short,
// long. Each note of a stroke lasts until the next stroke.
import { rasgueadoOnsets } from '../formats/common/rasgueado';
import { type Beat, QUARTER_TIME, type RasgueadoPattern } from '../model/song';

/** Within a stroke, the strings are this share of the stroke's time apart, divided by the number of strings struck. */
const STRUM_SHARE = 1 / 4;

/** One stroke's note on one string: its start from the beat's start, and its length (song ticks). */
export interface RasgueadoStrike {
  readonly start: number;
  readonly duration: number;
}

/** The beat's struck strings (no tied notes), lowest first: the order a down stroke strikes them. */
function strummedStrings(beat: Beat): readonly number[] {
  const strings = new Set(beat.voices.flatMap((voice) => voice.notes.filter((note) => !note.isTied).map((note) => note.string)));
  return [...strings].sort((a, b) => b - a);
}

/** When the note on `stringNumber` sounds in each stroke of the beat's rasgueado; `beatDuration` in song ticks. */
export function rasgueadoStrikes(pattern: RasgueadoPattern, beat: Beat, stringNumber: number, beatDuration: number): readonly RasgueadoStrike[] {
  const span = Math.min(beatDuration, QUARTER_TIME);
  const onsets = rasgueadoOnsets(pattern).map((fraction) => fraction * span);
  const strings = strummedStrings(beat);
  const rank = Math.max(0, strings.indexOf(stringNumber));
  return onsets.flatMap((onset, index) => {
    const end = onsets[index + 1] ?? beatDuration;
    const delay = ((end - onset) * STRUM_SHARE * rank) / Math.max(1, strings.length);
    return end - onset - delay > 0 ? [{ start: onset + delay, duration: end - onset - delay }] : [];
  });
}
