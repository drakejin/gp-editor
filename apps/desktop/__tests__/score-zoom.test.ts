import { ZOOM_RANGE, parseScoreZoom } from '../src/lib/score-zoom';

describe('parseScoreZoom', () => {
  it('reads a stored zoom: a level in range, a fit, else 100 %', () => {
    expect(parseScoreZoom(0.5)).toBe(0.5);
    expect(parseScoreZoom('fitPage')).toBe('fitPage');
    expect(parseScoreZoom('fitWidth')).toBe('fitWidth');
    expect(parseScoreZoom(99)).toBe(ZOOM_RANGE.max);
    expect(parseScoreZoom(0.01)).toBe(ZOOM_RANGE.min);
    expect(parseScoreZoom('huge')).toBe(1);
    expect(parseScoreZoom(Number.NaN)).toBe(1);
    expect(parseScoreZoom(undefined)).toBe(1);
  });
});
