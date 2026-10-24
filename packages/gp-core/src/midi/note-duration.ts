// Port of TuxGuitar MidiSequenceParser.getRealNoteDuration / applyDurationEffects (LGPL-2.1): how long a note sounds.
import { durationTicks } from '../model/defaults';
import type { Note, Voice } from '../model/song';
import { fromMidiTicks, truncToMidiTicks } from './midi-ticks';
import { type PlacedNote, type PlayedBeat, type TrackContext, nextBeatPosition, noteOnString, voiceAt } from './note-search';

/** DEFAULT_DURATION_DEAD / DEFAULT_DURATION_PM: MIDI file ticks at 60 BPM, scaled with the tempo so they last the same time. */
export const DEAD_NOTE_DURATION = 30;
const PALM_MUTE_DURATION = 60;
const STACCATO_PERCENT = 50;

/** applyStaticDuration: `duration` MIDI file ticks at 60 BPM scaled to the tempo, in song ticks, at most `maximum`. */
export function staticDuration(tempo: number, duration: number, maximum: number): number {
  return Math.min(fromMidiTicks(Math.floor((tempo * duration) / 60)), maximum);
}

function applyDurationEffects(note: Note, tempo: number, duration: number): number {
  if (note.effect.deadNote) {
    return staticDuration(tempo, DEAD_NOTE_DURATION, duration);
  }
  if (note.effect.palmMute) {
    return staticDuration(tempo, PALM_MUTE_DURATION, duration);
  }
  if (note.effect.staccato) {
    return truncToMidiTicks(duration * STACCATO_PERCENT, 100);
  }
  return duration;
}

interface TieScan {
  readonly duration: number;
  /** Sequence tick where the sound reached so far ends. */
  readonly lastEnd: number;
  readonly isLetRing: boolean;
}

/** The scan to go on with, or (a number) the note's duration where the scan ends. */
type ScanStep = TieScan | number;

/**
 * One following beat of getRealNoteDuration's loop: ties extend the note, let ring keeps it sounding. A beat that
 * changes nothing returns the scan itself (most beats: no let ring, no note on the string).
 */
function scanBeat(placed: PlacedNote, next: PlayedBeat, voice: Voice, scan: TieScan): ScanStep {
  if (voice.notes.length === 0) {
    return scan.duration;
  }
  if (!scan.isLetRing && noteOnString(voice.notes, placed.note.string) === undefined) {
    return scan;
  }
  const voiceLength = durationTicks(voice.duration);
  let current = scan;
  let hasTie = false;
  for (const nextNote of voice.notes) {
    if (nextNote === placed.note && next.playedIndex === placed.playedIndex) {
      continue;
    }
    if (current.isLetRing) {
      // Let ring does not survive a repeat close, and ends with the first beat without let ring.
      if (next.playedIndex !== placed.playedIndex && placed.header.repeatClose > 0) {
        return current.duration;
      }
      if (!nextNote.effect.letRing) {
        return current.duration + voiceLength;
      }
    }
    if (nextNote.string === placed.note.string) {
      if (!nextNote.isTied) {
        return current.duration;
      }
      const beatStart = next.move + next.beat.start;
      current = {
        duration: current.duration + (beatStart - current.lastEnd) + voiceLength,
        lastEnd: beatStart + voiceLength,
        isLetRing: nextNote.effect.letRing,
      };
      hasTie = true;
    }
  }
  if (current.isLetRing && !hasTie) {
    return { duration: current.duration + voiceLength, lastEnd: current.lastEnd + voiceLength, isLetRing: current.isLetRing };
  }
  return current;
}

/** getRealNoteDuration: `duration` (the beat's, after triplet feel) extended by ties and let ring, then shortened. */
export function realNoteDuration(context: TrackContext, placed: PlacedNote, duration: number): number {
  const { tempo } = placed;
  let scan: TieScan = {
    duration,
    lastEnd: placed.beat.start + durationTicks(placed.voice.duration) + placed.move,
    isLetRing: placed.note.effect.letRing,
  };
  const { beats } = context.playback;
  for (let position = nextBeatPosition(context, placed.playedIndex, placed.beatIndex); position < beats.length; position++) {
    const next = beats[position];
    const voice = next === undefined ? undefined : voiceAt(next.beat, placed.voiceIndex);
    if (next !== undefined && voice !== undefined) {
      const step = scanBeat(placed, next, voice, scan);
      if (typeof step === 'number') {
        return applyDurationEffects(placed.note, tempo, step);
      }
      scan = step;
    }
  }
  return applyDurationEffects(placed.note, tempo, scan.duration);
}
