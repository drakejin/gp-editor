/**
 * Standard-notation engraver: pure functions that turn a measure into draw commands for the score canvas.
 * Guitar and bass are written an octave above sounding pitch (treble / bass clef with an 8 below);
 * drum tracks are drawn on a percussion staff.
 */
export { NOTATION, STAFF_HEIGHT, notationBandHeight } from './metrics';
export { staffLines } from './staff';
export {
  type NotationContext,
  engraveNotationMeasure,
} from './engrave-measure';
export {
  engraveNotationRowHeader,
  notationRowHeaderWidth,
} from './engrave-header';
