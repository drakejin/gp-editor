// Port of TuxGuitar app.tuxguitar.io.ptb.helper.TrackStartHelper (LGPL-2.1): where each staff's voices are on the timeline.
import { QUARTER_TIME } from '../../model/song';

const VOICES_PER_STAFF = 2;
/**
 * fixValue snaps a start within this many ticks below an eighth-note line up onto the line (triplet rounding): 10 of
 * TuxGuitar's 960 ticks per quarter note.
 */
const SNAP_TICKS = QUARTER_TIME / 96;
const EIGHTH_TIME = QUARTER_TIME / 2;

export class TrackStartHelper {
  private voices: number[][] = [];
  private isMeasureEmpty = true;
  private isMeasureRest = false;
  barStart = 0;
  barLength = 0;

  /** A new section with `staffs` staffs. */
  init(staffs: number): void {
    this.voices = Array.from({ length: staffs }, () => Array.from({ length: VOICES_PER_STAFF }, () => 0));
    this.isMeasureEmpty = true;
    this.isMeasureRest = false;
    this.barStart = 0;
    this.barLength = 0;
  }

  /** Every voice of every staff continues from `start`. */
  initVoices(start: number): void {
    const fixed = fixValue(start);
    this.voices = this.voices.map((staff) => staff.map(() => fixed));
    this.isMeasureEmpty = true;
    this.isMeasureRest = false;
  }

  /** The latest voice position (at least QUARTER_TIME); a bar of rests only lasts its whole length. */
  getMaxStart(): number {
    let result = QUARTER_TIME;
    for (const staff of this.voices) {
      for (const start of staff) {
        result = Math.max(result, start);
      }
    }
    if (this.isMeasureRest && this.isMeasureEmpty) {
      result = Math.max(result, this.barStart + this.barLength);
    }
    return fixValue(result);
  }

  getVoiceStart(staff: number, voice: number): number {
    return this.voices[staff]?.[voice] ?? QUARTER_TIME;
  }

  setVoiceStart(staff: number, voice: number, start: number): void {
    const voices = this.voices[staff];
    if (voices !== undefined && voice < voices.length) {
      voices[voice] = fixValue(start);
    }
  }

  /** A beat was placed: the bar is no longer empty unless the beat is a rest. */
  checkBeat(isRest: boolean): void {
    this.isMeasureEmpty = this.isMeasureEmpty && isRest;
    this.isMeasureRest = true;
  }
}

function fixValue(value: number): number {
  const offset = value % EIGHTH_TIME;
  return offset + SNAP_TICKS > EIGHTH_TIME ? value + (EIGHTH_TIME - offset) : value;
}
