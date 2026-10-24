import { bendAmountLabel, engraveVibratoPreview } from '../src/score/bend-graph';
import { PALETTE } from '../test-support/score-helpers';

describe('bendAmountLabel', () => {
  it('writes the amount in tones as Guitar Pro does: ¼, ½, ¾, full, 1¼ …', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 12].map(bendAmountLabel)).toEqual(['¼', '½', '¾', 'full', '1¼', '1½', '2', '3']);
  });
});

describe('engraveVibratoPreview', () => {
  it('draws a wider wave for wide vibrato and a flat line for none', () => {
    const height = (kind: 'none' | 'slight' | 'wide') => {
      const ys = engraveVibratoPreview(kind, PALETTE).flatMap((command) => (command.kind === 'line' ? [command.y1, command.y2] : []));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height('none')).toBe(0);
    expect(height('wide')).toBeGreaterThan(height('slight'));
  });
});
