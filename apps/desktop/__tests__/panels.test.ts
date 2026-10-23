import { INITIAL_PANELS, ZOOM_LEVELS, stepZoom, togglePanel } from '../src/state/panels';

describe('panels', () => {
  it('starts with every panel shown, as Guitar Pro opens', () => {
    expect(INITIAL_PANELS).toEqual({ palette: true, inspector: true, tracks: true, keyboard: true, neck: true });
  });

  it('toggles one panel and leaves the others', () => {
    expect(togglePanel(INITIAL_PANELS, 'inspector')).toEqual({ palette: true, inspector: false, tracks: true, keyboard: true, neck: true });
    expect(togglePanel(INITIAL_PANELS, 'keyboard').keyboard).toBe(false);
  });
});

describe('stepZoom', () => {
  it('moves to the next or previous zoom level', () => {
    expect(stepZoom(1, 1)).toBe(ZOOM_LEVELS[ZOOM_LEVELS.indexOf(1) + 1]);
    expect(stepZoom(1, -1)).toBe(ZOOM_LEVELS[ZOOM_LEVELS.indexOf(1) - 1]);
  });

  it('stays at the ends and snaps a zoom between levels', () => {
    expect(stepZoom(ZOOM_LEVELS[0]!, -1)).toBe(ZOOM_LEVELS[0]);
    expect(stepZoom(ZOOM_LEVELS.at(-1)!, 1)).toBe(ZOOM_LEVELS.at(-1));
    expect(stepZoom(1.05, 1)).toBe(1.1);
  });
});
