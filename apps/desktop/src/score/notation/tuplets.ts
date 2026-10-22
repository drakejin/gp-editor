import { QUARTER_TIME, durationTicks } from '@gp-editor/core';
import type { TextCommand } from '../draw';
import type { Chord } from './chords';
import type { VoiceEvent } from './events';
import { digitGlyphs, musicGlyph } from './glyphs';
import { NOTATION, TUPLET, positionY } from './metrics';
import { restPosition } from './rests';

const WHOLE_NOTE_TICKS = QUARTER_TIME * 4;
/** Half the height of a rest, in staff positions. */
const REST_REACH = 3;

function isTuplet(event: VoiceEvent): boolean {
  const { enters, times } = event.duration.tuplet;
  return enters > 0 && enters !== times;
}

function isSameRatio(a: VoiceEvent, b: VoiceEvent): boolean {
  return a.duration.tuplet.enters === b.duration.tuplet.enters && a.duration.tuplet.times === b.duration.tuplet.times;
}

/**
 * Consecutive tuplet events of one voice, split into groups. A group is complete once it lasts as long as `times`
 * of its shortest plain note value (three triplet eighths = two eighths); a rounding tick per note is allowed.
 */
function voiceTuplets(events: readonly VoiceEvent[], voiceIndex: number): number[][] {
  const groups: number[][] = [];
  let members: number[] = [];
  let ticks = 0;
  let unit = Number.POSITIVE_INFINITY;
  const close = () => {
    if (members.length > 0) {
      groups.push(members);
    }
    members = [];
    ticks = 0;
    unit = Number.POSITIVE_INFINITY;
  };
  events.forEach((event, index) => {
    if (event.voiceIndex !== voiceIndex) {
      return;
    }
    const first = events[members[0] ?? -1];
    if (!isTuplet(event) || (first !== undefined && !isSameRatio(first, event))) {
      close();
    }
    if (!isTuplet(event)) {
      return;
    }
    members = [...members, index];
    ticks += durationTicks(event.duration);
    unit = Math.min(unit, Math.floor(WHOLE_NOTE_TICKS / event.duration.value));
    if (ticks + members.length >= event.duration.tuplet.times * unit) {
      close();
    }
  });
  close();
  return groups;
}

export function tupletGroups(events: readonly VoiceEvent[]): number[][] {
  const voices = [...new Set(events.map((event) => event.voiceIndex))];
  return voices.flatMap((voiceIndex) => voiceTuplets(events, voiceIndex));
}

interface TupletPlacement {
  readonly events: readonly VoiceEvent[];
  readonly chords: readonly (Chord | undefined)[];
  readonly tips: readonly (number | undefined)[];
  readonly isMultiVoice: boolean;
  readonly top: number;
}

/** Vertical reach of an event: its noteheads and stem, or its rest. */
function reach(index: number, placement: TupletPlacement): number[] {
  const chord = placement.chords[index];
  const tip = placement.tips[index];
  if (chord === undefined) {
    const event = placement.events[index];
    const position = event === undefined ? 0 : restPosition(event, placement.isMultiVoice);
    return [positionY(placement.top, position + REST_REACH), positionY(placement.top, position - REST_REACH)];
  }
  const half = NOTATION.space / 2;
  return [...chord.heads.flatMap((head) => [head.y - half, head.y + half]), ...(tip === undefined ? [] : [tip])];
}

/** The tuplet number, centred over the group on its stem side. */
export function tupletNumber(members: readonly number[], placement: TupletPlacement, color: string): TextCommand[] {
  const first = placement.events[members[0] ?? -1];
  if (first === undefined) {
    return [];
  }
  const stemmed = members.flatMap((index) => placement.chords[index] ?? []);
  const isAbove = (stemmed[0]?.direction ?? 'up') === 'up';
  const xs = members.map((index) => placement.chords[index]?.stemX ?? placement.events[index]?.x ?? first.x);
  const ys = members.flatMap((index) => reach(index, placement));
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = isAbove ? Math.min(...ys) - TUPLET.gap : Math.max(...ys) + TUPLET.gap + TUPLET.height;
  return [musicGlyph(x, y, digitGlyphs(first.duration.tuplet.enters, TUPLET.digitZero), color, 'center')];
}
