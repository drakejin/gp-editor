// The GP5 reader's voice layout (TuxGuitar GP5InputStream#readMeasure / #readVoice, LGPL-2.1), as the writer must produce it.
import { durationTicks, QUARTER } from '../model/defaults';
import type { Beat, Duration, Measure } from '../model/song';
import { writableDuration } from './gp-units';
import { MAX_GP_VOICES, voiceAt, voiceBeats } from './gtp-song';
import type { VoicePlacement } from './gtp-ties';

function isPlainQuarter(duration: Duration): boolean {
  const { value, dotted, doubleDotted, tuplet } = duration;
  return value === QUARTER.value && !dotted && !doubleDotted && tuplet.enters === 1 && tuplet.times === 1;
}

/** An empty voice that differs from the readers' placeholder (an empty quarter). */
function hasOwnEmptyVoice(beat: Beat, voiceIndex: number): boolean {
  const voice = beat.voices[voiceIndex];
  return voice !== undefined && voice.isEmpty && voice.notes.length === 0 && !isPlainQuarter(voice.duration);
}

/**
 * The beats to write for a voice: those where it is not empty, then the one beat where an empty voice
 * with its own duration can come back. Empty GP5 beats take no time, so the reader places one at the end
 * of the voice (at the measure start when the voice has no other beat), and a later empty beat there
 * replaces an earlier one; elsewhere the reader's placeholder (an empty quarter) is all there is.
 */
export function voiceSequence(measure: Measure, voiceIndex: number): readonly Beat[] {
  const beats = voiceBeats(measure, voiceIndex);
  const last = beats[beats.length - 1];
  const sorted = [...measure.beats].sort((a, b) => a.start - b.start);
  const end = last === undefined ? sorted[0]?.start : last.start + durationTicks(voiceAt(last, voiceIndex).duration);
  const trailing = sorted.find((beat) => beat.start === end && hasOwnEmptyVoice(beat, voiceIndex));
  return trailing === undefined ? beats : [...beats, trailing];
}

/** GP5 reading order: the beats of voice 1, then those of voice 2. */
export function readOrderGp5(measure: Measure): readonly VoicePlacement[] {
  return Array.from({ length: MAX_GP_VOICES }, (_, voiceIndex) =>
    voiceSequence(measure, voiceIndex).map((beat) => {
      const voice = voiceAt(beat, voiceIndex);
      return { voiceIndex, voice, duration: writableDuration(voice.duration, true) };
    }),
  ).flat();
}
