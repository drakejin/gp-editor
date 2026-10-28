// MusicXML octave shifts as the beats' octave signs (no TuxGuitar reader exists): the inverse of the writer's octave-shift
// directions. A shift holds from its place until its stop, across bar lines.
import type { Ottava } from '../../model/song';
import { type XmlElement, attribute, childText, children } from '../gpif/xml';
import type { Timed } from './musicxml-measures';
import { readIntegerIn } from './musicxml-values';

/** An octave-shift start (its sign) or stop (no sign), on a staff when the direction names one. */
export interface OctaveShift {
  readonly staff?: number;
  readonly ottava?: Ottava;
}

/** "down" writes the notes lower than they sound (8va, 15ma), "up" higher (8vb, 15mb); size 8 is one octave, 15 two. */
const SIGNS: Readonly<Record<string, Ottava>> = { 'down 8': '8va', 'up 8': '8vb', 'down 15': '15ma', 'up 15': '15mb' };
const MAX_STAFF = 16;

/** The octave shifts of one `<direction>`: starts of a known size, stops; continues and other sizes are left out. */
export function readOctaveShifts(direction: XmlElement): readonly OctaveShift[] {
  const staff = readIntegerIn(childText(direction, 'staff'), 1, MAX_STAFF);
  const place = staff === undefined ? {} : { staff };
  return children(direction, 'direction-type').flatMap((type) =>
    children(type, 'octave-shift').flatMap((shift): OctaveShift[] => {
      const kind = attribute(shift, 'type')?.trim();
      if (kind === 'stop') {
        return [place];
      }
      const ottava = SIGNS[`${kind ?? ''} ${attribute(shift, 'size')?.trim() ?? '8'}`];
      return ottava === undefined ? [] : [{ ...place, ottava }];
    }),
  );
}

/** A measure's octave signs: the sign over each position, and the one still running at its end. */
export interface MeasureOttavas {
  readonly at: (tick: number) => Ottava | undefined;
  readonly atEnd: Ottava | undefined;
}

/** At one place a stop goes before a start: voices write them in either order (the writer: each on its run's first voice). */
function stopFirst(shift: Timed<OctaveShift>): number {
  return shift.value.ottava === undefined ? 0 : 1;
}

/**
 * The signs over a measure's positions, from the sign running into it (`carried`) and its shifts on the track's
 * `staves` (or on no staff): a shift counts from its position on; at one position, stops first, then in document order.
 */
export function measureOttavas(shifts: readonly Timed<OctaveShift>[], staves: ReadonlySet<number>, carried: Ottava | undefined): MeasureOttavas {
  const own = shifts
    .map((shift, order) => ({ shift, order }))
    .filter(({ shift }) => shift.value.staff === undefined || staves.has(shift.value.staff))
    .sort((a, b) => a.shift.tick - b.shift.tick || stopFirst(a.shift) - stopFirst(b.shift) || a.order - b.order)
    .map(({ shift }) => shift);
  const signAt = (tick: number): Ottava | undefined => own.reduce<Ottava | undefined>((sign, shift) => (shift.tick <= tick ? shift.value.ottava : sign), carried);
  return { at: signAt, atEnd: signAt(Number.POSITIVE_INFINITY) };
}
