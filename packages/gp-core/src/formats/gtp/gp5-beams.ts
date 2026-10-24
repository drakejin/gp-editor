// Guitar Pro 5 beaming (TuxGuitar's GP5InputStream skips it; GP5OutputStream#makeBeamEighthNoteBytes writes the
// grouping): four "beam eighth notes by" bytes with each time signature, and per beat display flags.
import { normalizeBeamGrouping, parseBeamGrouping } from '../../model/beaming';
import type { BeamGrouping, BeamLink, TimeSignature } from '../../model/song';

/** Groups a GP5 measure header holds. */
export const GP5_BEAM_GROUPS = 4;
const EIGHTH = 8;
const MAX_GP5_GROUP = 0x7f;

/** Beat display flags (the short after a beat's notes): the beam from the beat before broken / joined. */
export const GP5_BREAK_BEAM = 0x0001;
export const GP5_FORCE_BEAM = 0x0004;
/** Secondary beams broken from the beat before; a byte follows (the beams kept: 1). Guitar Pro sets 0x1000 with it. */
export const GP5_BREAK_SECONDARY_BEAMS = 0x0800;
const GP5_SECONDARY_COMPANION = 0x1000;
/** The byte Guitar Pro writes after a secondary break: the primary beam goes on. */
export const GP5_SECONDARY_BEAMS_KEPT = 1;

/** The grouping as GP5's four eighth-note bytes; undefined when it has more groups or parts of an eighth. */
export function gp5BeamBytes(grouping: BeamGrouping): readonly number[] | undefined {
  const eighths = grouping.groups.map((size) => (size * EIGHTH) / grouping.unit);
  if (eighths.length > GP5_BEAM_GROUPS || !eighths.every((size) => Number.isInteger(size) && size >= 1 && size <= MAX_GP5_GROUP)) {
    return undefined;
  }
  return [...eighths, ...new Array<number>(GP5_BEAM_GROUPS - eighths.length).fill(0)];
}

/** GP5OutputStream#makeBeamEighthNoteBytes, for meters whose own grouping does not fit four bytes. */
function tuxGuitarBeamBytes({ numerator, denominator }: TimeSignature): readonly number[] {
  if (denominator > EIGHTH) {
    return [0, 0, 0, 0];
  }
  const total = (EIGHTH / denominator) * numerator;
  const value = Math.floor(total / GP5_BEAM_GROUPS);
  const missing = total - GP5_BEAM_GROUPS * value;
  return [value + missing, value, value, value];
}

/**
 * The bytes Guitar Pro writes for a bar without a grouping of its own: a group per beat (per dotted quarter in 6/8,
 * 9/8, 12/8) when there are at most four, else TuxGuitar's split (zeros past eighth-note meters).
 */
export function gp5DefaultBeamBytes(timeSignature: TimeSignature): readonly number[] {
  const { numerator, denominator } = timeSignature;
  const isCompound = denominator === EIGHTH && numerator % 3 === 0;
  const groups = isCompound ? numerator / 3 : numerator;
  const groupSize = isCompound ? 3 : EIGHTH / denominator;
  if (groups <= GP5_BEAM_GROUPS && Number.isInteger(groupSize) && (isCompound || denominator <= 4)) {
    return Array.from({ length: GP5_BEAM_GROUPS }, (_, i) => (i < groups ? groupSize : 0));
  }
  return tuxGuitarBeamBytes(timeSignature);
}

function isSameBytes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** A header's beam bytes as a grouping; none when they are what the writer gives every bar of the time signature. */
export function beamGroupingFromGp5(bytes: readonly number[], timeSignature: TimeSignature): BeamGrouping | undefined {
  if (isSameBytes(bytes, gp5DefaultBeamBytes(timeSignature))) {
    return undefined;
  }
  return normalizeBeamGrouping(parseBeamGrouping(EIGHTH, bytes), timeSignature);
}

/** What a beat's display flags say of the beam from the beat before it. */
export function beamLinkFromGp5(flags: number): BeamLink | undefined {
  if ((flags & GP5_FORCE_BEAM) !== 0) {
    return 'join';
  }
  if ((flags & GP5_BREAK_BEAM) !== 0) {
    return 'break';
  }
  return (flags & GP5_BREAK_SECONDARY_BEAMS) !== 0 ? 'breakSecondary' : undefined;
}

/** The display flags of a beat whose previous beat has `link`, as Guitar Pro 5 writes them (a join also breaks). */
export function gp5BeamFlags(link: BeamLink | undefined): number {
  switch (link) {
    case 'join':
      return GP5_FORCE_BEAM | GP5_BREAK_BEAM;
    case 'break':
      return GP5_BREAK_BEAM;
    case 'breakSecondary':
      return GP5_BREAK_SECONDARY_BEAMS | GP5_SECONDARY_COMPANION;
    default:
      return 0;
  }
}
