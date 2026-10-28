import { FOCUSED_PANELS, INITIAL_PANELS, ZOOM_LEVELS, isFocused, stepZoom, toggleFocus, togglePanel } from '../src/state/panels';

describe('panels', () => {
  it('starts with every panel shown, as Guitar Pro opens', () => {
    expect(INITIAL_PANELS).toEqual({ palette: true, inspector: true, tracks: true, keyboard: true, neck: true, mixer: false });
  });

  it('toggles one panel and leaves the others', () => {
    expect(togglePanel(INITIAL_PANELS, 'inspector')).toEqual({ palette: true, inspector: false, tracks: true, keyboard: true, neck: true, mixer: false });
    expect(togglePanel(INITIAL_PANELS, 'mixer').mixer).toBe(true);
    expect(togglePanel(INITIAL_PANELS, 'keyboard').keyboard).toBe(false);
  });
});

describe('toggleFocus', () => {
  it('hides every panel around the score, keeping the ones shown for Unfocus', () => {
    // Arrange: the inspector already hidden
    const layout = { panels: togglePanel(INITIAL_PANELS, 'inspector') };

    // Act
    const focused = toggleFocus(layout);
    const unfocused = toggleFocus(focused);

    // Assert
    expect(focused.panels).toEqual(FOCUSED_PANELS);
    expect(Object.values(FOCUSED_PANELS).every((isShown) => !isShown)).toBe(true);
    expect(focused.unfocusedPanels).toEqual(layout.panels);
    expect(unfocused).toEqual({ panels: layout.panels });
    expect(isFocused(focused)).toBe(true);
    expect(isFocused(unfocused)).toBe(false);
  });

  it('restores what was shown even when a panel was opened while focused', () => {
    // Arrange
    const focused = toggleFocus({ panels: INITIAL_PANELS });
    const withPalette = { ...focused, panels: togglePanel(focused.panels, 'palette') };

    // Act / Assert
    expect(toggleFocus(withPalette).panels).toEqual(INITIAL_PANELS);
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

describe('ZOOM_LEVELS', () => {
  it('zooms out to 25 % — four times the systems on a screen — and in to 400 %, as Guitar Pro’s zoom does', () => {
    expect(ZOOM_LEVELS[0]).toBe(0.25);
    expect(ZOOM_LEVELS.at(-1)).toBe(4);
    expect([...ZOOM_LEVELS].sort((a, b) => a - b)).toEqual(ZOOM_LEVELS);
    expect(stepZoom(0.5, -1)).toBeLessThan(0.5);
  });
});
