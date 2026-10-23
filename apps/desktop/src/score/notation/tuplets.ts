import { type NoteValue, QUARTER_TIME, type Tuplet, durationTicks, isSameTuplet } from '@gp-editor/core';
import type { DrawCommand, LineCommand } from '../draw';
import type { BeamedChords } from './beams';
import type { VoiceEvent } from './events';
import { digitGlyphs, horizontal, musicGlyph, vertical } from './glyphs';
import { GLYPH_WIDTH, NOTATION, TUPLET, positionY } from './metrics';
import { restPosition } from './rests';
import type { VoiceLayout } from './voice-layout';

const WHOLE_NOTE_TICKS = QUARTER_TIME * 4;
/** Half the height of a rest, in staff positions. */
const REST_REACH = 3;

/** One tuplet bracket or number: the events under it, its number, and how it nests. */
export interface TupletGroup {
  readonly members: readonly number[];
  /** The number drawn: notes in the tuplet. */
  readonly enters: number;
  /** A tuplet inside another (GP7/GP8's secondary tuplet): drawn next to the notes, the outer one beyond it. */
  readonly isInner: boolean;
  /** An outer tuplet with an inner one under it: its number goes one level further out. */
  readonly hasInner: boolean;
}

/** How a tuplet level is read off an event: the beat's tuplet, or the tuplet inside it. */
interface TupletLevel {
  /** The event's tuplet at this level; undefined when it has none. */
  readonly tupletOf: (event: VoiceEvent) => Tuplet | undefined;
  /** Ticks of one note of `value` at this level, without the level's own tuplet. */
  readonly unitTicks: (event: VoiceEvent, value: NoteValue) => number;
}

const OUTER: TupletLevel = {
  tupletOf: event => {
    const { tuplet } = event.duration;
    return tuplet.enters > 0 && tuplet.enters !== tuplet.times ? tuplet : undefined;
  },
  unitTicks: (_event, value) => Math.floor(WHOLE_NOTE_TICKS / value),
};

const INNER: TupletLevel = {
  tupletOf: event => event.duration.innerTuplet,
  unitTicks: (event, value) =>
    durationTicks({ value, dotted: false, doubleDotted: false, tuplet: event.duration.tuplet }),
};

/** Runs of consecutive events (of `indexes`, in order) with the same tuplet at `level`. */
function tupletRuns(
  indexes: readonly number[],
  events: readonly VoiceEvent[],
  level: TupletLevel,
): number[][] {
  return indexes
    .reduce<number[][]>((runs, index, k) => {
      const event = events[index];
      const previous = events[indexes[k - 1] ?? -1];
      const tuplet = event === undefined ? undefined : level.tupletOf(event);
      if (tuplet === undefined) {
        return [...runs, []];
      }
      const last = runs[runs.length - 1];
      const before = previous === undefined ? undefined : level.tupletOf(previous);
      const continues =
        last !== undefined &&
        last.length > 0 &&
        before !== undefined &&
        isSameTuplet(before, tuplet);
      return continues
        ? [...runs.slice(0, -1), [...last, index]]
        : [...runs, [index]];
    }, [])
    .filter(run => run.length > 0);
}

/**
 * A group is complete when it lasts `times` notes of one plain value between its shortest and longest notes: three
 * triplet eighths (two eighths), two triplet sixteenths and a triplet eighth (two sixteenths), three triplet sixteenths
 * and a dotted triplet eighth (two eighths). Inside a tuplet the plain values are those of the outer tuplet. A
 * rounding tick per note is allowed.
 */
function isComplete(
  members: readonly VoiceEvent[],
  level: TupletLevel,
): boolean {
  const first = members[0];
  const times = first === undefined ? 1 : (level.tupletOf(first)?.times ?? 1);
  const ticks = members.reduce(
    (sum, event) => sum + durationTicks(event.duration),
    0,
  );
  const values = members.map(event => event.duration.value);
  // Note values are powers of two: every plain value from the longest to the shortest note of the group.
  const longest = Math.min(...values);
  const candidates = Array.from(
    { length: Math.log2(Math.max(...values) / longest) + 1 },
    (_, i) => (longest * 2 ** i) as NoteValue,
  );
  return (
    first !== undefined &&
    candidates.some(
      value =>
        Math.abs(ticks - times * level.unitTicks(first, value)) <=
        members.length,
    )
  );
}

interface Plan {
  readonly incomplete: number;
  readonly complete: number;
  /** Groups in order; incomplete members stand alone here and are joined afterwards. */
  readonly groups: ReadonlyArray<{
    readonly members: readonly number[];
    readonly isComplete: boolean;
  }>;
}

function isBetter(a: Plan, b: Plan): boolean {
  return (
    a.incomplete < b.incomplete ||
    (a.incomplete === b.incomplete && a.complete > b.complete)
  );
}

const NO_PLAN: Plan = { incomplete: 0, complete: 0, groups: [] };

/** Splits a run into complete groups, leaving as few notes outside one as possible (then making as many groups as possible). */
function partition(
  run: readonly number[],
  events: readonly VoiceEvent[],
  level: TupletLevel,
): number[][] {
  // plans.get(k): the best plan for the members from k to the end of the run.
  const plans = new Map<number, Plan>([[run.length, NO_PLAN]]);
  for (let start = run.length - 1; start >= 0; start--) {
    const rest = plans.get(start + 1) ?? NO_PLAN;
    let best: Plan = {
      incomplete: rest.incomplete + 1,
      complete: rest.complete,
      groups: [
        { members: [run[start] ?? -1], isComplete: false },
        ...rest.groups,
      ],
    };
    for (let end = start; end < run.length; end++) {
      const members = run.slice(start, end + 1);
      const after = plans.get(end + 1) ?? NO_PLAN;
      const candidate: Plan = {
        incomplete: after.incomplete,
        complete: after.complete + 1,
        groups: [{ members, isComplete: true }, ...after.groups],
      };
      if (
        isBetter(candidate, best) &&
        isComplete(
          members.flatMap(index => events[index] ?? []),
          level,
        )
      ) {
        best = candidate;
      }
    }
    plans.set(start, best);
  }
  return joinIncomplete(plans.get(0)?.groups ?? []);
}

function joinIncomplete(groups: Plan['groups']): number[][] {
  return groups
    .reduce<Array<{ members: number[]; isComplete: boolean }>>(
      (joined, group) => {
        const last = joined[joined.length - 1];
        if (!group.isComplete && last !== undefined && !last.isComplete) {
          return [
            ...joined.slice(0, -1),
            { members: [...last.members, ...group.members], isComplete: false },
          ];
        }
        return [
          ...joined,
          { members: [...group.members], isComplete: group.isComplete },
        ];
      },
      [],
    )
    .map(group => group.members);
}

/** An outer group, then the groups of a tuplet inside it among its members. */
function nestedGroups(
  members: readonly number[],
  events: readonly VoiceEvent[],
): TupletGroup[] {
  const inner = tupletRuns(members, events, INNER).flatMap(run =>
    partition(run, events, INNER),
  );
  const first = events[members[0] ?? -1];
  return [
    {
      members,
      enters: first?.duration.tuplet.enters ?? 0,
      isInner: false,
      hasInner: inner.length > 0,
    },
    ...inner.map(group => ({
      members: group,
      enters: events[group[0] ?? -1]?.duration.innerTuplet?.enters ?? 0,
      isInner: true,
      hasInner: false,
    })),
  ];
}

/** Every voice's tuplet groups, and inside them the groups of a tuplet inside a tuplet. */
export function tupletGroups(events: readonly VoiceEvent[]): TupletGroup[] {
  const voices = [...new Set(events.map(event => event.voiceIndex))];
  return voices.flatMap(voiceIndex => {
    const indexes = events.flatMap((event, index) =>
      event.voiceIndex === voiceIndex ? [index] : [],
    );
    return tupletRuns(indexes, events, OUTER)
      .flatMap(run => partition(run, events, OUTER))
      .flatMap(members => nestedGroups(members, events));
  });
}

/** Vertical reach of an event: its noteheads and stem, or its rest. */
function reach(index: number, layout: VoiceLayout): number[] {
  const chord = layout.chords[index];
  const tip = layout.tips[index];
  if (chord === undefined) {
    const event = layout.events[index];
    const position =
      event === undefined ? 0 : restPosition(event, layout.isMultiVoice);
    return [
      positionY(layout.top, position + REST_REACH),
      positionY(layout.top, position - REST_REACH),
    ];
  }
  const half = NOTATION.space / 2;
  return [
    ...chord.heads.flatMap(head => [head.y - half, head.y + half]),
    ...(tip === undefined ? [] : [tip]),
  ];
}

/** Left and right ends of a tuplet bracket: the outer noteheads, stems and rests of the group. */
function bracketSpan(
  members: readonly number[],
  layout: VoiceLayout,
): readonly [number, number] {
  const edges = members.flatMap(index => {
    const chord = layout.chords[index];
    const x = layout.events[index]?.x ?? 0;
    return chord === undefined
      ? [x - GLYPH_WIDTH.rest / 2, x + GLYPH_WIDTH.rest / 2]
      : [chord.left, Math.max(chord.right, chord.stemX)];
  });
  return [Math.min(...edges), Math.max(...edges)];
}

/** Beamed as one group: every member is a note under the same beam. */
function isBeamedTogether(
  members: readonly number[],
  beamed: readonly BeamedChords[],
): boolean {
  return beamed.some(group =>
    members.every(index =>
      group.chords.some(chord => chord.eventIndex === index),
    ),
  );
}

function bracket(
  left: number,
  right: number,
  centre: number,
  numberWidth: number,
  y: number,
  isAbove: boolean,
  color: string,
): LineCommand[] {
  const gap = numberWidth / 2 + TUPLET.numberGap;
  if (right - left < 2 * gap + 2 * TUPLET.hook) {
    return [];
  }
  const hook = isAbove ? TUPLET.hook : -TUPLET.hook;
  return [
    vertical(left, y, y + hook, TUPLET.bracketWidth, color),
    horizontal(left, centre - gap, y, TUPLET.bracketWidth, color),
    horizontal(centre + gap, right, y, TUPLET.bracketWidth, color),
    vertical(right, y, y + hook, TUPLET.bracketWidth, color),
  ];
}

/**
 * The tuplet number on the stem side of the group, in a bracket unless the group is beamed as one. An outer tuplet
 * with a tuplet inside it goes one number further from the notes.
 */
export function tupletMarks(
  group: TupletGroup,
  layout: VoiceLayout,
  beamed: readonly BeamedChords[],
): DrawCommand[] {
  const { members } = group;
  const first = layout.events[members[0] ?? -1];
  if (first === undefined) {
    return [];
  }
  const stemmed = members.flatMap(index => layout.chords[index] ?? []);
  const isAbove = (stemmed[0]?.direction ?? 'up') === 'up';
  const ys = members.flatMap(index => reach(index, layout));
  const nesting = group.hasInner ? TUPLET.height + TUPLET.gap : 0;
  const y = isAbove
    ? Math.min(...ys) - TUPLET.gap - nesting
    : Math.max(...ys) + TUPLET.gap + TUPLET.height + nesting;
  const digits = digitGlyphs(group.enters, TUPLET.digitZero);
  if (isBeamedTogether(members, beamed)) {
    const xs = members.map(
      index =>
        layout.chords[index]?.stemX ?? layout.events[index]?.x ?? first.x,
    );
    return [
      musicGlyph(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        y,
        digits,
        layout.color,
        'center',
      ),
    ];
  }
  const [left, right] = bracketSpan(members, layout);
  const centre = (left + right) / 2;
  const lines = bracket(
    left,
    right,
    centre,
    [...digits].length * TUPLET.digitWidth,
    y - TUPLET.height / 2,
    isAbove,
    layout.color,
  );
  return [musicGlyph(centre, y, digits, layout.color, 'center'), ...lines];
}
