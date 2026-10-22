import type { DrawCommand } from '../draw';
import type { Chord } from './chords';
import type { VoiceEvent } from './events';
import { horizontal, vertical } from './glyphs';
import { OTTAVA, STAFF, positionY } from './metrics';

const LABELS: ReadonlyMap<number, string> = new Map([
  [1, '8va'],
  [2, '15ma'],
  [3, '22ma'],
  [-1, '8vb'],
  [-2, '15mb'],
  [-3, '22mb'],
]);

/** Consecutive events of one voice drawn with the same octave shift. */
interface OttavaRun {
  readonly ottava: number;
  readonly chords: readonly Chord[];
}

function voiceRuns(
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
  voiceIndex: number,
): OttavaRun[] {
  return events.reduce<OttavaRun[]>((runs, event, index) => {
    if (event.voiceIndex !== voiceIndex) {
      return runs;
    }
    const chord = chords[index];
    const added = chord === undefined ? [] : [chord];
    const last = runs[runs.length - 1];
    return last !== undefined && last.ottava === event.ottava
      ? [
          ...runs.slice(0, -1),
          { ottava: last.ottava, chords: [...last.chords, ...added] },
        ]
      : [...runs, { ottava: event.ottava, chords: added }];
  }, []);
}

/** "8va" over (or "8vb" under) the run's notes, with a line to the end of the run and a hook towards the staff. */
function runMarks(run: OttavaRun, top: number, color: string): DrawCommand[] {
  const label = LABELS.get(run.ottava);
  const first = run.chords[0];
  const last = run.chords[run.chords.length - 1];
  if (label === undefined || first === undefined || last === undefined) {
    return [];
  }
  const ys = run.chords.flatMap(chord => chord.heads.map(head => head.y));
  const isAbove = run.ottava > 0;
  const y = isAbove
    ? Math.min(top, ...ys) - OTTAVA.gap
    : Math.max(positionY(top, STAFF.bottomLine), ...ys) + OTTAVA.gap;
  const lineStart =
    first.left + label.length * OTTAVA.charWidth + OTTAVA.labelGap;
  const text: DrawCommand = {
    kind: 'text',
    x: first.left,
    y,
    text: label,
    size: OTTAVA.fontSize,
    color,
    font: 'ui',
    align: 'left',
  };
  if (last.right - lineStart < OTTAVA.minLine) {
    return [text];
  }
  const hook = isAbove ? OTTAVA.hook : -OTTAVA.hook;
  return [
    text,
    horizontal(lineStart, last.right, y, OTTAVA.lineWidth, color),
    vertical(last.right, y, y + hook, OTTAVA.lineWidth, color),
  ];
}

/** Ottava marks for every run of octave-shifted notes in the measure's voices. */
export function ottavaMarks(
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
  top: number,
  color: string,
): DrawCommand[] {
  const voices = [...new Set(events.map(event => event.voiceIndex))];
  return voices.flatMap(voiceIndex =>
    voiceRuns(events, chords, voiceIndex).flatMap(run =>
      runMarks(run, top, color),
    ),
  );
}
