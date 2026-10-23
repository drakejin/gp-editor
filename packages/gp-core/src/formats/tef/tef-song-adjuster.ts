// Port of TuxGuitar app.tuxguitar.io.tef3.TGSongAdjuster (in TESongParser.java) (LGPL-2.1): fits the beats of each
// measure, laid on TablEdit's grid with their written durations, into one another and into the measure.
import { QUARTER, durationFromTicks, durationTicks } from '../../model/defaults';
import { type DraftBeat, type DraftMeasure, type DraftVoice, headerLength } from '../common/song-draft';

const VOICE_COUNT = 2;

/** TGSongAdjuster.process for every measure of every track. */
export function adjustMeasures(measures: readonly DraftMeasure[]): void {
  measures.forEach(adjustMeasure);
}

/**
 * adjustBeats. TuxGuitar only looks at the first voice and treats a beat without notes there as a rest: it removes such
 * a beat when it overlaps the previous one, with the second voice's notes. Here each voice is fitted on its own: a rest
 * that overlaps the voice's previous beat or runs past the measure leaves the voice, a note's previous beat is shortened
 * to end where it starts, and a note running past the measure is shortened to fit. A beat left without voices goes, and
 * its chord and text move to the latest beat with notes before it (TuxGuitar moves the chord of a removed rest).
 */
function adjustMeasure(measure: DraftMeasure): void {
  measure.beats.sort((a, b) => a.start - b.start);
  const end = measure.header.start + headerLength(measure.header);
  for (let voice = 0; voice < VOICE_COUNT; voice++) {
    adjustVoice(measure.beats, voice, end);
  }
  const kept: DraftBeat[] = [];
  let lastWithNotes: DraftBeat | undefined;
  for (const beat of measure.beats) {
    if (beat.voices.every((voice) => voice.isEmpty)) {
      moveMarks(beat, lastWithNotes);
      continue;
    }
    kept.push(beat);
    if (beat.voices.some((voice) => voice.notes.length > 0)) {
      lastWithNotes = beat;
    }
  }
  measure.beats.length = 0;
  for (const beat of kept) {
    measure.beats.push(beat);
  }
}

function adjustVoice(beats: readonly DraftBeat[], voiceIndex: number, end: number): void {
  let previous: DraftBeat | undefined;
  for (const beat of beats) {
    const voice = voiceOf(beat, voiceIndex);
    if (voice.isEmpty) {
      continue;
    }
    const isRest = voice.notes.length === 0;
    const previousVoice = previous === undefined ? undefined : voiceOf(previous, voiceIndex);
    if (previous !== undefined && previousVoice !== undefined && previous.start + durationTicks(previousVoice.duration) > beat.start) {
      if (isRest) {
        clearVoice(voice);
        continue;
      }
      previousVoice.duration = durationFromTicks(beat.start - previous.start);
    }
    if (beat.start + durationTicks(voice.duration) > end) {
      if (isRest) {
        clearVoice(voice);
        continue;
      }
      voice.duration = durationFromTicks(end - beat.start);
    }
    previous = beat;
  }
}

function voiceOf(beat: DraftBeat, voiceIndex: number): DraftVoice {
  return voiceIndex === 0 ? beat.voices[0] : beat.voices[1];
}

function clearVoice(voice: DraftVoice): void {
  voice.duration = QUARTER;
  voice.isEmpty = true;
}

/** A removed beat's chord and text go to the latest beat with notes before it, unless it has its own. */
function moveMarks(beat: DraftBeat, target: DraftBeat | undefined): void {
  if (target === undefined) {
    return;
  }
  if (beat.chord !== undefined && target.chord === undefined) {
    target.chord = beat.chord;
  }
  if (beat.text !== undefined && target.text === undefined) {
    target.text = beat.text;
  }
}
